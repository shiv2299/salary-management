# Decisions

A short log of non-obvious trade-offs: what was chosen, what the alternative was, and why. `docs/architecture.md` describes what will be built; this document explains the calls that weren't forced by the requirements alone.

## Database: SQLite, not Postgres

**Alternative considered**: Postgres (managed, or in a second container).

**Chosen**: SQLite via better-sqlite3, one file on a persistent volume.

**Why**: one HR user means almost no concurrent writes, which is the main thing SQLite gives up. In exchange: zero setup for developers (`npm ci && npm run dev`), tests run against a real in-memory database in milliseconds with no Docker, and deployment is one container. At 100,000 rows SQLite is nowhere near its limits; the scaling risks are query shape (addressed by the denormalized current salary below), not the engine. Drizzle keeps the schema and queries portable.

**Revisit if**: multiple concurrent users are introduced, the app needs to run as more than one instance, or percentile queries need to move into the database (Postgres has `percentile_cont`).

## Base currency: USD

**Chosen**: all cross-country figures are shown in USD.

**Why**: it's the conventional reporting currency for multinational compensation, one of the three currencies already in the data, and the one leadership is most likely to think in. It's a single constant, not hardcoded throughout the code.

**Revisit if**: leadership reports in another currency; the change is a config value plus an FX migration.

## Cross-country comparison: one base currency for insights, peers within one country

**Alternative considered**: comparison within each country only, in local currency.

**Chosen**: both, each where it fits. Every insight (distribution, payroll, cross-country comparison) is shown in USD through the static FX table. Outlier detection compares an employee only with peers in the same country and level. Employee records and salary history keep the local currency the employee is actually paid in.

**Why**: the HR Manager's hardest questions to answer in Excel are the cross-country ones, such as "what does an L4 cost us in India vs. Germany?" or "where is payroll going?". Answering them needs one currency. Within-country-only comparison would leave them answering those questions by hand, which is the spreadsheet work this app is meant to replace. The trade-off is that an FX rate is a snapshot: a USD comparison mixes pay differences with exchange-rate movement, and it is not a cost-of-living or purchasing-power comparison. A German salary that looks high in USD may simply reflect a strong euro. Two choices limit how far that can mislead. First, the rate date is shown wherever converted amounts appear. Second, "is this person paid fairly?" (outliers) is answered only against same-country peers, where conversion is one constant factor and cannot change anyone's rank. Local amounts are never overwritten by converted ones, so nothing is lost if the rate is wrong.

**Revisit if**: leadership wants purchasing-power-adjusted comparison, or rates move enough that a single dated table is misleading. Both mean replacing the FX table, not the data model.

## Money and FX: integer rates, one rounding step, half away from zero

**Alternative considered**: storing FX rates as floats / `REAL`.

**Chosen**: rates stored as integers scaled by 10⁹ (`rate_to_base_nano`). Conversions are computed in `BigInt` and rounded once at the end, half away from zero, to an integer minor unit. The same rounding rule applies to bulk-revision amounts and to computed means and percentiles.

**Why**: a float rate brings float arithmetic straight back into money, which the integer-minor-unit rule exists to prevent. A single, documented rounding rule makes results reproducible and testable to the cent.

## Outlier detection: Tukey's IQR fences, not a fixed threshold

**Alternative considered**: flag anyone more than ±40% from their peer-group median.

**Chosen**: flag anyone outside `p25 - 1.5×IQR` .. `p75 + 1.5×IQR` for their country+level peer group. Peer groups smaller than 10 are not evaluated.

**Why**: a fixed ±40% is an arbitrary number with no justification beyond "it seemed reasonable." IQR fences are a standard statistical method, and the insights endpoint already computes p25/p75 for the distribution feature (FR-6), so this reuses existing output instead of introducing a new threshold parameter to pick and defend.

## Outlier peer group: country + level, not + department

**Chosen**: peers are employees in the same country at the same level, across departments.

**Why**: pay is set mainly by labor market (country) and seniority (level). Adding department splits the 10,000 employees into 126 groups, many of which would fall below the 10-person minimum needed for reliable quartiles.

**Revisit if**: department pay really does diverge within a level (e.g. Engineering vs. Support). The peer key is a single service-layer parameter.

## Percentiles: linear interpolation (Excel `PERCENTILE.INC`)

**Alternative considered**: nearest-rank percentiles.

**Chosen**: linear interpolation between the two nearest ranks.

**Why**: it's the method the HR Manager's existing Excel pivots use, so numbers match what they'd have computed by hand. Pinning the method also makes the stats tests exact.

## Auth: session cookie carrying a JWT, no refresh token

**Alternative considered**: JWT held in browser memory and sent as an `Authorization: Bearer` header (the original plan).

**Chosen**: a signed JWT (`{ sub }`, 8-hour expiry) stored in an `HttpOnly; SameSite=Strict` cookie, set by the API through the same-origin `/api` rewrite. No refresh token; re-login when it expires.

**Why**: an in-memory token is lost on every refresh, new tab, or bookmark. That would break the design's promises that a refreshed detail URL renders and that a bookmarked filtered view is reproducible. It also prevents CSV export from being a plain download link. A cookie fixes all three with less client code, and `HttpOnly` keeps the token away from JavaScript entirely. `SameSite=Strict` plus JSON-only mutation endpoints covers CSRF. 8 hours matches a working day. A single user with no RBAC doesn't need refresh-token rotation or server-side revocation.

## Auth guard: deny by default

**Chosen**: every `/api/*` route requires a session except an explicit allowlist (`POST /api/auth/login`, `GET /api/health`).

**Why**: guarding a list of protected prefixes means every new route is unprotected until someone remembers to add it. An allowlist fails safe.

## Salary history: effective-dated history, not a current snapshot

**Alternative considered**: store only each employee's current salary and overwrite it on change.

**Chosen**: an append-only `salary_history` table, one row per change with an effective date and a reason, plus a cached current salary on `employees` (next entry).

**Why**: a snapshot answers "what do we pay now?" but not "how did we get here?". Several of the HR Manager's core questions are about change over time: who was promoted and when, what the last increment cycles actually did (FR-10), and why someone's pay looks the way it does. A snapshot also loses information on every edit, so a mistyped amount cannot be audited or corrected without losing what was there before. That is the same weakness the Excel sheet has. The cost is a second table and a rule for which row is current. The denormalized current-salary cache keeps reads as cheap as a snapshot would be.

## Current salary: denormalized cache, not a derived query

**Alternative considered**: keep `current_amount_minor` purely derived — a window function or correlated subquery finding each employee's latest `salary_history` row at read time.

**Chosen**: cache `current_amount_minor` / `current_currency_code` / `current_amount_base_minor` / `current_effective_date` / `current_reason` directly on `employees`, written transactionally by the single service function that writes `salary_history`. "Current" means the latest `effective_date`, with the highest `id` breaking ties.

**Why**: this system is designed so it can grow to 100,000+ employees (`docs/spec.md` §2), not just the seeded 10,000. A derived "latest row per employee" query re-aggregates on every list and insights request; a denormalized, indexed column turns that into a plain read. The cost is a second place the value lives, mitigated by funneling every write through exactly one service function (`docs/architecture.md` §1) — there is no second code path that could let it drift from `salary_history`, which remains the append-only source of truth.

**Revisit if**: a future requirement needs the "current" salary to be computed differently per caller (e.g. as-of an arbitrary past date for every list view, not just the detail/history view) — at that point the cache stops being a correct shortcut and the derived query comes back, likely behind the same read path.

## Salary sort and insights: cached USD amount

**Alternative considered**: sort and aggregate on `current_amount_minor` and convert at query time.

**Chosen**: the single writer also stores `current_amount_base_minor` (USD cents), and the salary sort and every insight use it.

**Why**: `current_amount_minor` mixes paise, cents, and euro cents, so sorting on it ranks ₹15,00,000 above $150,000. Converting at query time would make the salary sort unindexable. FX rates are static, so the cached value only changes when a salary changes or an FX migration runs, and that migration recomputes it.

## No future-dated salary changes

**Alternative considered**: allow scheduled changes (e.g. enter in March a raise effective 1 April).

**Chosen**: effective dates must be today or earlier.

**Why**: with future dates allowed, "current salary" depends on the day you read it, so the denormalized cache would need a scheduled job to stay correct, and insights could count pay nobody receives yet. Disallowing them keeps the cache a pure function of the history rows. Backdated changes are allowed and handled by the current-row rule.

**Revisit if**: HR needs to enter increment cycles ahead of time. That would need a `scheduled` status on rows plus a daily job that applies them through the single writer.

## Salary-change reasons: raise and promotion are distinct; relocation is its own reason

**Chosen**: `raise` changes pay only. `promotion` changes level (to a higher rank) and pay together. `relocation` changes country and pay together, with the new amount in the new currency. `correction` fixes a mistake. Country and level cannot be edited through `PATCH`.

**Why**: a promotion and a raise mean different things to HR and leadership, and a promotion without its level change (or vice versa) would make level-based insights wrong. Country affects currency, so changing it without a salary change would leave the employee's pay in the wrong currency. Routing both through the salary writer keeps level, country, and pay consistent in one transaction and visible in history.

## Relocation: pre-filled with the converted salary, editable

**Chosen**: the relocation form pre-fills the new-country salary with the current salary converted at the static FX rate (done server-side), and the HR Manager can change it before saving.

**Why**: a straight conversion is the obvious starting point, but relocations usually come with a local-market adjustment, so the number must be editable. Doing the conversion on the server keeps money arithmetic out of the browser.

## Inactive employees

**Chosen**:
- Hidden from the employee list by default (the status filter can show them).
- Excluded from insights about the present (headcount, payroll today, pay bands, attention). Included in history-based insights (payroll trend, change by cause, raises) for the time they were paid.
- Included in recent changes, marked as inactive.
- Included in "export all"; included in "export current result" only if the current filter includes them.
- Cannot receive salary changes and are skipped by bulk revisions.
- Can be reactivated.

**Why**: an inactive employee isn't being paid, so counting them in payroll or pay bands would misstate both. Their history is still history, though, so it stays visible where history is shown.

## Bulk salary revision: percentage with per-row override, not exact-amount-only

**Context**: salary revisions happen a few times a year, applied to groups of employees at once (an increment cycle), not one employee at a time. It surfaced while designing the UX around how often each feature is actually used.

**Alternative considered**: bulk action that only supports setting the exact same new amount for every selected employee.

**Chosen**: a single percentage increase computed per employee, with the resulting amount editable per row before confirming.

**Why**: a flat percentage is what an increment cycle actually is ("everyone in this group gets 7%"), and the per-row override avoids forcing a second workflow for the inevitable exceptions (one person in the group needs a different number) without building a second bulk-edit feature.

## Bulk revision: confirm an explicit, checked list, not a filter

**Alternative considered**: confirm by resending the filter used for the preview.

**Chosen**: the confirm request carries the exact employee IDs from the preview, each with the current amount it was based on (`expectedCurrentAmountMinor`) and its final new amount. If anything changed since the preview, the whole request is rejected with `409` and nothing is written. The percentage is stored in integer basis points; only increases (1–10,000 bp) are allowed.

**Why**: a filter evaluated twice can return a different set of employees the second time, and the overrides are keyed by employee. Committing exactly what was reviewed is the only way the preview means anything. Decreases are rare, individual events and go through `correction`.

**Trade-off**: the preview returns the full matching set (about 3.0 MB for the 9,577 active employees of the seeded 10,000) so the UI can page through it and hold overrides locally. That's fine at this scale, and selecting tens of thousands of people in one revision isn't a realistic workflow.

## Search: substring match, unindexed

**Alternative considered**: prefix-only search (B-tree indexable), or an SQLite FTS5 trigram index.

**Chosen**: case-insensitive `LIKE '%term%'` across full name, email, and job title.

**Why**: the HR Manager expects a search like Excel's Find, which matches anywhere in the text. A substring scan of 100,000 short rows is a few tens of milliseconds, inside the latency target, and needs no extra table or triggers. FTS5 would add a virtual table that Drizzle doesn't model, plus sync triggers, for no measurable benefit at this scale.

**Revisit if**: measured search latency approaches the target, which is likely somewhere past a few hundred thousand rows. Then add an FTS5 table with the `trigram` tokenizer, which supports substring matching.

## Salary changes: 3, 5 or 10 years or all, a year and a reason, on their own page

**Alternatives considered**: a short window such as 90 days; windowing by `created_at` (when the change was entered).

**Chosen**: the latest five changes sit on Insights; the full list is at `/insights/changes` with a range of 3, 5 or 10 years or all time (default 3 years), a reason and a calendar year. A chosen year overrides the range. A change counts if its `effective_date` falls inside.

**Why**: revisions happen a few times a year, so a 90-day window would usually show one cycle or none. Compensation questions are about multi-year patterns: how pay moved across the last few increment cycles, and who was promoted when. Bulk revisions collapse into one entry each, and the list is paginated, so even all time stays readable. The window is based on effective date because the question is when pay actually changed. The cost is that a correction entered today but backdated to before the window won't appear. That's acceptable because the change is still visible in that employee's history.

## Insights trends: constant currency

**Alternatives considered**: converting each historical amount at the rate of its own date (needs a rate history the product doesn't have, and mixes currency moves into pay trends); local currency per country (no total).

**Chosen**: every past amount converts to USD at the latest static rate, and the meta line says so.

**Why**: the question is how pay changed, and at fixed rates every movement in a trend is a pay movement.

## Insights windows: trailing 12 months for tiles and sentences, calendar years for charts

**Alternatives considered**: calendar year to date for everything (compares a partial year with a full one, so figures always "fall" early in the year); rolling windows on the charts too.

**Chosen**: tiles and answers compare the last 12 months with the 12 before; yearly charts use calendar years with the current year marked "YTD".

**Why**: like-for-like comparisons in the sentences, and familiar years on the axis.

## Payroll change by cause: walk each person's pay through the window

**Alternatives considered**: compare first and last pay per person and attribute the whole difference to the latest reason (hides a raise followed by a correction); sum row deltas (double counts same-day corrections and ignores leavers).

**Chosen**: from a year ago to today, each person's paid amount changes only on the day they join the payroll (New hires, + their pay), the day a salary row takes effect (+ the step, under that row's reason), or the day they leave (People who left, − their pay). When several rows take effect on one day, each row, in id order, adds its own step under its own reason: its amount minus the amount in force just before it. A raise and a promotion on the same day count once each, and a same-day correction shows as its own small step. Rows dated on the day someone joins or leaves are part of that join or leave. The steps telescope, so the parts sum exactly to the payroll difference.

**Why**: an exact reconciliation is the acceptance rule, and this keeps each step under the reason that caused it. Scoring each row against the one before it is also how the raises card scores a raise, so a raise and a promotion on the same day land under the same cause on both cards.

## Needs attention: thresholds in one domain module

**Alternatives considered**: thresholds as API parameters; configuration in the database.

**Chosen**: `domain/attention-rules.ts` holds `NO_RAISE_YEARS = 2`, `RECENT_HIRE_YEARS = 1`, `LONG_TENURE_YEARS = 3`, `COMPRESSION_MIN_SUBGROUP = 5` and `COMPRESSION_MARGIN_BP = 500`. A group is compressed only when its recent hires' median is more than 5% above its long-tenured median. Within a compressed group, only the long-tenured staff paid less than the recent hires' median are listed: listing every long-tenured person flagged 2,104 people (22% of active staff) on the seeded data, 468 of whom earn at or above the new hires; the narrowed list is 1,636 (17%).

**Why**: these are product rules, not user settings. A gap of a few percent between two small groups' medians is noise, and the margin keeps the card to groups where recent hires are clearly paid more.

## Attention filter: resolved to ids on the server, ANDed with the other filters

**Alternatives considered**: SQL for each rule (the outlier fences and medians need in-memory statistics anyway); a precomputed flag column (stale after every change and every day that passes).

**Chosen**: `services/attention.ts` computes the four id sets from active employees, today's date and the peer groups. The list, facets, export and bulk selection AND the union of the chosen sets with their other filters, passed to SQLite as one JSON array through `json_each`.

**Why**: one definition serves the list, the counts, the export and the bulk revision, so "export current result" and "select all matching" take exactly the people shown. One bound parameter stays within SQLite's limit at any size. Computing the sets reads every active employee and the peer groups on each call: about 65–85 ms at p95 for the facet counts and an attention-filtered list on the seeded 10,000 employees (`docs/performance.md`), growing linearly with headcount.

**Revisit if**: the employee count reaches about 30,000, or the p95 of the facets call nears 300 ms. Then cache the attention lists per today and data version.

## Insights endpoints: one per card, history read in full per request

**Alternatives considered**: one endpoint for the whole page (any change reloads everything); pre-aggregated tables (a second write path the single salary writer would have to keep in step).

**Chosen**: payroll trend, payroll change, raises, level bands and attention each have their own endpoint. The tiles read the trend summary, the raises' last 12 months and the attention counts. There is no separate payroll or outliers endpoint: today's point of the trend and the attention filter cover them.

**Why**: each card loads and fails on its own. Reading about 61,000 history rows takes about 93–135 ms at p95 per endpoint on the seeded 10,000 employees (`docs/performance.md`), and the cost grows linearly with history. Removing the old endpoints leaves one definition of each figure.

**Revisit if**: the employee count reaches about 30,000, or the p95 of these endpoints nears 300 ms. Then cache the loaded history per today and data version, so the three history endpoints share one load.

## Charts: one value axis, a strip chart for the second measure

**Alternatives considered**: headcount as a line on a second axis (two scales on one chart invite false comparisons); headcount only in the tooltip.

**Chosen**: payroll bars with a 64px headcount strip beneath, and average raise with a 64px raise-count strip beneath, sharing the years.

**Why**: both measures stay visible without one appearing to cause the other.

## Chart series colours: seven categorical slots

**Alternatives considered**: shades of the accent (unreadable with seven departments); a library default palette (includes the green and red the product reserves for pay going up and down).

**Chosen**: `series-1` … `series-7` (`docs/design.md` §2), in fixed order, starting with the accent, and checked for colour-blind separation between neighbours.

**Why**: departments need seven distinguishable colours that never read as good or bad.

## Seed data: deterministic relative to a reference date

**Alternative considered**: fixed absolute dates.

**Chosen**: `seed({ rngSeed, referenceDate })`; all dates are offsets back from `referenceDate`.

**Why**: with fixed absolute dates the seeded history would slide out of the 3, 5 and 10-year ranges over time, and the view would gradually empty. Generating dates relative to a reference date keeps the demo meaningful whenever it runs, and the output is still fully deterministic for tests because they pass a fixed date.

## Pagination: offset, not cursor

**Chosen**: standard offset/limit pagination on indexed, filtered/sorted columns.

**Why**: stays fast through 100,000 rows, which is the scale this architecture targets, and is simpler to build, test, and explain than cursor-based pagination.

**Revisit if**: the employee count grows into the millions, or UI usage patterns start requiring very deep pages (offset pagination degrades specifically on large offsets, not on large tables with shallow access patterns).

## Insights statistics: computed in application memory

**Chosen**: fetch the filtered set of current salaries and compute distribution/percentiles in the Node process (`computeDistribution`), rather than in SQL.

**Why**: SQLite has no percentile functions. At the scale this system targets (100,000 rows), sorting an array in memory is on the order of milliseconds — not a real cost.

**Revisit if**: the target scale grows by another order of magnitude (millions of rows). At that point, either a SQLite percentile extension or pre-aggregated rollup tables would be needed instead of fetching the full filtered set per request.

## No pre-built access-scope parameter

**Alternative considered**: an unused "visibility scope" parameter threaded through the service layer, for future country/department-restricted access.

**Chosen**: not built.

**Why**: `AGENTS.md` rules out speculative abstractions, and an unused parameter is untested by definition. The layering already gives restricted access one obvious place to live (a scope applied in the service layer to every repository query) if it's ever needed.

**How it would be extended**, if restricted access is ever required:

1. **Data**: add a `role` column to `users` (e.g. `hr_admin`, `hr_viewer`) and a `user_scopes` table listing the countries and/or departments each user may see. No rows means unrestricted.
2. **Auth**: the session JWT keeps carrying only `sub`. The deny-by-default hook loads the user's role and scope once per request and attaches them to the request. Because the JWT does not embed permissions, a changed scope applies on the next request, without waiting 8 hours for the token to expire.
3. **Services**: every service function takes that scope and passes it to the repositories as an extra `WHERE country_code IN (…) AND department_id IN (…)`. This covers the list, detail, history, export, bulk-revision preview and confirm, and every insight. Insights then describe only the employees the user may see, so a country manager's payroll total is their country's total. An employee outside scope returns 404, not 403, so its existence isn't revealed.
4. **Roles**: write endpoints (create, edit, salary changes, bulk revision) check the role in a route-level guard. A viewer gets read-only access.
5. **Tests**: one service-level test per read path shows that out-of-scope employees are excluded, plus API tests showing a viewer gets 403 on every write route.

## Deployment platform: deferred, not decided

**Status**: open. The architecture assumes a single Docker image (`docs/architecture.md` §11); the specific host (Render/Railway/Fly.io) is an operational choice made during the deployment phase, not an architectural one. Whichever is chosen must provide a **persistent volume** for the SQLite file. All three have ephemeral container filesystems, and seed-on-boot would mask the data loss by silently re-seeding. Will be recorded here once chosen, with the reason.

## Seed data: relocations are re-benchmarked to the destination country

**Alternative considered**: carrying the converted salary across a relocation with random variation.

**Chosen**: a relocated employee's new pay is the converted amount rescaled by the ratio of the destination's median pay for their level to the converted source median, with ±5% jitter.

**Why**: the static FX table converts INR to USD at a rate that is far from the pay gap between the two labor markets, so a plain conversion left about 100 of 235 relocated employees outside their new peer group's fences. That would have made the outlier insight mostly a list of relocations instead of the deliberately planted ~1% of anomalies. Re-benchmarking mirrors how a real relocation is priced, and the relocation form still pre-fills the plain converted amount for the HR Manager to adjust (see "Relocation" above).


## Error statuses and mutation responses

**Chosen**:
- `400` for a malformed request (Zod: wrong type, unknown or forbidden field, bad date). `PATCH /api/employees/:id` is strict, so sending `countryCode`, `levelId`, `status` or any salary field is a `400`.
- `422` for a well-formed request that breaks a business rule (a raise that does not increase pay, an effective date in the future, a promotion to a lower level, a change for an inactive employee). The message lists every violation at once.
- `409` for a conflict with existing data (duplicate email; later, a stale bulk-revision preview).
- `404` for an unknown employee. Every successful mutation on one employee (`POST`, `PATCH`, `DELETE`, reactivate, salary change) returns the full employee detail, so the client can replace its cached record without a second request.

**Why**: the client needs to tell "fix the form" (`400`, `422`) apart from "someone else changed this" (`409`), and returning the detail keeps the list and drawer consistent after every write.

## Backdated changes are recorded in the currency of the time

**Chosen**: a change backdated to before a relocation is stored in the currency of the country the employee was in on that date. Only a relocation uses the new country's currency.

**Why**: the history row is a statement about what the employee was paid on that date. Using today's currency would label an old rupee amount as euros. The same reasoning sets the baseline for the raise and promotion rules (next record).

## Raises and promotions are judged against the pay in force on their date

**Alternatives considered**: compare every change with the current salary, which is simpler and was the first rule; allow a promotion with any amount, as a level move whose pay is the HR Manager's call.

**Chosen**: a raise must be higher, and a promotion must not be lower, than the amount the employee was paid on the change's effective date, in the currency of that date. For a change dated today that is the current salary. A correction takes any positive amount, so it remains the way to record a genuine cut.

**Why**: comparing with today's salary rejected a valid backdated raise (paid 10 lakh, raised to 15 lakh in June, a missed raise to 12 lakh in March was refused) and, across a relocation, compared rupees with euros, so a cut in rupees could pass as a "raise" because the number was larger than today's euro amount. The pay in force on the date is what the raise actually changed, and it is always in the same currency as the new row (previous record). A promotion that cuts pay is almost always a typing mistake; allowing an equal amount keeps a level move with no immediate raise possible.

## Email: stored lowercase, unique case-insensitively

**Chosen**: emails are trimmed and lowercased at the API boundary, and uniqueness is checked case-insensitively.

**Why**: `Asha@acme.test` and `asha@acme.test` are the same mailbox, and SQLite's `UNIQUE` is case-sensitive, so without this a duplicate could be created by changing the case.

## Mutations accept JSON only, including `text/plain`

**Chosen**: the `text/plain` body parser Fastify installs by default is removed, so form-encoded, multipart and `text/plain` bodies all get `415`.

**Why**: `docs/architecture.md` §4 relies on "JSON only" as a second CSRF layer. A cross-site HTML form can send `text/plain`, which would have reached body-less mutations such as reactivate. Clients must not send a `Content-Type: application/json` header with an empty body on those routes.

## Recent changes: every history row counts, shown under the country in force

**Chosen**: the recent-changes view lists every `salary_history` row effective in the window, including hire rows (shown with no "from" amount). Each entry's country is the one in force from that row onward, not the employee's current country. "From" is the pay on the employee's previous row by effective date, which may be in another currency after a relocation.

**Why**: a hire is the first change to someone's pay and is part of "what changed, when". Using the row's country keeps a relocation entry under the country the person moved to, and keeps an old change under the country it was made in. Taking "from" by effective date rather than entry order means a backdated change compares against the row actually before it.

## Outlier fences are compared exactly

**Chosen**: the outlier test uses the exact fence values, which no response exposes; the peer range people see is the p25 to p75 (see "Peer context: one peer-group service, typical range in local currency, outlier test in USD").

**Why**: Tukey's fences are 1.5 × IQR and can fall on a half unit. Every amount in the API is an integer minor unit, so rounding a fence for display would be the only way to show it, and the decision about who is an outlier must never depend on that rounding.


## Bulk revision confirm: which failures are 409, 422 and 404

**Chosen**: a confirm request is checked in this order, and the first failing group rejects the whole request with nothing written.
- `404` if any listed employee does not exist.
- `409` if any employee's current amount differs from `expectedCurrentAmountMinor`, or any employee is now inactive. These mean the preview is out of date, so the message tells the HR Manager to preview again.
- `422` for a request that breaks a rule whatever the data: a future or pre-hire effective date, an amount (including a hand override) that does not exceed the current pay, or the same employee listed twice. Every bulk row is a `raise`, so the single-change rule that a raise must increase pay applies to overrides too; a smaller figure is a `correction`.

**Why**: the client reacts differently to each. A `409` is fixed by reloading the preview, a `422` by editing the form, and a `404` means the list itself is wrong. Checking for staleness before the rules means a stale preview is never reported as a form error. Each item's currency is the one in force on the effective date, as for a single change, so a revision backdated to before someone's relocation is not labelled in the wrong currency.

## CSV export: batched keyset reads, not an open database iterator

**Alternative considered**: stream straight from a better-sqlite3 `iterate()` cursor, which is the obvious reading of "stream from the database".

**Chosen**: the export reads 1,000 rows at a time (`WHERE id > last ORDER BY id LIMIT 1000`, with the list's filters), writes each batch to the response, and reads the next when the client is ready. Rows come out in id order, not in the list's sort order.

**Why**: better-sqlite3 has one connection, and while an iterator is open every other statement on it, including every write, throws "This database connection is busy executing a query". A slow download would then make a concurrent request, such as a salary change from a second tab, fail for as long as the download lasts. Batches are complete short queries, so nothing is held open between them, and memory stays bounded at about one batch. Each batch is read in one query, but the export as a whole is not a snapshot: a change committed mid-download can appear in a later batch. For a single-user tool that is acceptable, and the set stays exactly what the filters matched when each batch was read.

**Also**: text cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading apostrophe, so a job title typed as a formula cannot run when the file is opened in a spreadsheet. Amounts are formatted from integer minor units, never through a float.

**Revisit if**: the export must be a consistent snapshot. Wrapping the batches in one read transaction would give that, at the cost of holding a read snapshot (and blocking WAL checkpoints) for the length of the download.

## FX: a static dated table, live rates deliberately not built

**Alternative considered**: fetching live exchange rates from an external provider.

**Chosen**: one static, dated table of integer rates (see "Money and FX" above), with the rate date shown wherever converted amounts appear. Changing a rate is an FX migration that recomputes `current_amount_base_minor`.

**Why**: insights, sorting and outliers must give the same answer for the same data. A live feed would make yesterday's report differ from today's with no salary change, add an external dependency and a failure mode to every insight request, and force a decision about which rate applies to a historical salary row. The cost is that USD figures are a snapshot, which the visible rate date makes explicit.

**Revisit if**: leadership needs rates that track the market. That is a scheduled job writing new dated rows plus an FX migration, not a data-model change (`docs/requirements.md` §4).

## Deployment packaging: one image, two processes, one volume

**Alternative considered**: separate API and web images, or a process manager inside one image.

**Chosen**: a single image (`Dockerfile`, Node 24, multi-stage, non-root `node` user) that runs the Fastify API and the Next.js standalone server from `scripts/start.sh`. The script starts both, and if either exits it stops the other and exits non-zero, so the platform restarts the container. The web server is the only published port (3000) and reaches the API at `127.0.0.1:3001` through the `/api` rewrite. `API_URL` is a build argument because Next.js resolves rewrite destinations during `next build`. The SQLite file is `/data/app.db` on a volume. The image ships `apps/api/drizzle/`, which the API resolves relative to its bundle (`dist/../drizzle`). The `HEALTHCHECK` calls `GET /api/health` through the web server, so it covers the rewrite as well as the API, with a 90-second start period for the first-boot seed.

**Why**: SQLite is a local file, so the API and its database must share a host, and the web app is only a thin proxy in front of one API. Two images would need a network and two deploys for no isolation benefit at this scale, and a single container matches the "deployment is one container" reasoning in the SQLite decision. The shell script is a few lines and has no dependency; a process manager would be one more thing to maintain. Production dependencies are installed in their own stage on the same base image, so native modules (`better-sqlite3`, `argon2`) are built for the platform they run on and dev tooling never reaches the final image.

**Limits**: one container means no horizontal scaling of the API (SQLite allows a single writer host), and restarting the container restarts both processes. Both are acceptable for one HR user.

**Verified**: the image was built and run with a volume. Login via `/api/auth/login` worked, data survived a container restart, and the restart did not re-seed (`seeded: false`, `hrUser: exists`). The container exits non-zero without `JWT_SECRET`.

## Frontend: batch rows not expandable, list state in the URL, native selects

**Chosen**:
- The bulk revision total is no longer the browser's per-currency sum: see "Bulk revision figures: a server summary that follows the edits".
- A bulk revision in the recent-changes list is one row (headcount, percentage, note) that does not expand to list its employees.
- Detail links carry the list's own query string (`/employees/123?status=all`), and the list reads its filters, sort and page from the URL query only.
- Form pickers and the rows-per-page choice are native `<select>` elements, not a custom listbox. List filters are checkbox groups instead (see "Employee filters: a left panel of checkbox groups, not an inline dropdown row").

**Why**: the API has no endpoint that lists a batch's members, so the expandable row in `docs/design.md` §5 has nothing to show beyond what the row already says. The intercepted drawer route changes the URL to `/employees/123`, and the list underneath keeps rendering, so without the carried query it would reset its filters while the drawer is open. Native selects are reliable on touch screens and for keyboards, which matters for the 44px mobile targets.

**Revisit if**: HR wants a drill-down into a batch (add a batch-members endpoint).

## Bulk revision: a wide slide-over at `/employees/revisions/new`, the selection in the query string

**Alternatives considered**: the panel that replaced the list; a separate full page (the list disappears while reviewing, and before a percentage is chosen most of the page is empty); a centered modal (a paged table of editable amounts is cramped in a dialog, and the confirm step would be a dialog on top of a dialog); `/employees/bulk-revision` (the drawer's intercepting route rewrites every one-segment `/employees/<x>` soft navigation into the drawer); carrying the selection in `sessionStorage` or in memory (lost in a new tab, missing when storage is blocked, and gone after a refresh in memory).

**Chosen**: the screen lives at `/employees/revisions/new`. A soft navigation from the list is intercepted by `@drawer/(.)employees/revisions/new` and renders the screen in a 960px slide-over above the list, as employee detail does; direct navigation or a refresh renders the same component as a full page. Closing the slide-over goes back in history. A click outside it does not close it, because that would discard the percentage and hand edits. Its query string is the list's own query plus `select=all` or `ids=3,12`. At most 1,000 people can be picked by hand (about 6 KB of URL); beyond that the selection bar asks for "select all matching". No percentage is pre-chosen, and changing it keeps hand edits, because an edit is an amount the HR Manager typed, not a percentage.

**Why**: the HR Manager keeps the list they selected from in view, and closing returns to it exactly as it was, selection included. Refresh, back and a copied link still reproduce the screen, and the full page's "Back to employees" rebuilds the list exactly. The cost is a 960px panel, too narrow to put the setup beside the review table, so in the panel the setup always stacks above it. A `select=all` filter is evaluated when the screen loads; the confirm still sends the explicit reviewed list (see "Bulk revision: confirm an explicit, checked list, not a filter").

## Bulk revision figures: a server summary that follows the edits

**Alternatives considered**: the browser's per-currency sums only (the earlier rule); converting each row to USD and adding them (rounds once per person); the average instead of the median.

**Chosen**: `POST /api/employees/bulk-salary-changes/summary`, re-posted 400 ms after the last edit. Added payroll is the exact integer sum of new minus current per currency; the USD total converts each currency's sum once (half away from zero) and adds them. Typical pay is the median before and after: in the local currency when everyone selected is paid in one currency, otherwise in USD (before from the cached USD amount, after from each new amount converted once).

**Why**: the browser never converts or applies a percentage, so every figure that does comes from `domain/`. One rounding per currency keeps the USD total consistent with the per-currency figures shown beside it. The median is the "typical" the rest of the app uses, and one outlier cannot move it.

## Salary amounts: at most 90,000,000,000 minor units

**Alternatives considered**: no upper bound, with payroll totals failing as a server error once a sum leaves the safe integer range; returning every total as a string or `BigInt` so no sum can overflow.

**Chosen**: every salary amount the API accepts (a new employee's salary, a single salary change and its preview, and each `newAmountMinor` in a bulk summary or confirm) is at most `MAX_AMOUNT_MINOR` = 90,000,000,000 minor units (900,000,000.00 in a two-decimal currency), checked by the Zod schema, so a larger one is a `400`. The forms check the same limit and say "Enter an amount up to …" inline.

**Why**: this is the largest amount the system can store safely, not a pay policy. Totals are exact integer sums sent as JSON numbers, and every amount ends up in one: the payroll trend and payroll change insights add up every history row, so a single oversized salary would turn them into server errors for good (deactivating the employee keeps the history). 100,000 amounts at the limit add up to 9,000,000,000,000,000, inside `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). The limit is far above any real annual salary in INR, USD or EUR. Sending totals as strings would remove the limit but change every money field in the shared types, the web app and the CSV export, for a case no real salary reaches.

**Revisit if**: a currency with very large nominal amounts (such as IDR or VND) is added, where a real salary could approach the cap.

## Bulk review: search and quick filters run over the loaded preview

The preview is already the full selection held in the browser (see "Bulk revision: confirm an explicit, checked list, not a filter"), so name search and the Overridden / Outside peer range filters need no request. The review table is plain table markup rather than TanStack Table: it has no sorting, column choice or row selection, which are what TanStack brings.

## Bulk revision: "outside peer range" is the FR-8 rule on current pay

The flag is `peerPosition(...).outlier` from `getPeerGroups`, evaluated on pay before the revision, so it matches the drawer and the attention counts; groups under 10 are not evaluated. It is a heads-up, not a block.

## Last bulk revision: the batch with the latest effective date

**Alternative considered**: the first batch entry of recent changes, which is windowed to a range (3 years by default) and paginated, so an older revision would be missed.

**Chosen**: `GET /api/employees/bulk-salary-changes/latest`, taking the latest `effective_date` and the highest id on a tie. The batch table is small, so there is no index.

**Why**: it answers "when did we last do this" directly and regardless of the recent-changes window.

## Employee filters: a left panel of checkbox groups, not an inline dropdown row

**Alternative considered**: keep the inline row of dropdowns above the table.

**Chosen**: a left filter panel with a group each for Status, Country, Department and Level, every option a checkbox with a count. The panel collapses, and the collapsed state is remembered per browser.

**Why**: ticking several options with a count beside each needs more room than a dropdown gives, and a row of open dropdowns would cover the table it filters. Making the panel collapsible gives the full table width back when the HR Manager is only reading. Below `md` it becomes a bottom sheet.

## Filters: multi-select within a group, AND across groups, with faceted counts

**Alternative considered**: single-select dropdowns, with counts taken over the whole table.

**Chosen**: several options in one group are OR-ed, and groups are AND-ed. In Status, Active and Inactive both ticked means all, and neither ticked means the default (active). A group's counts apply the search and every other group's selection but not its own.

**Why**: "India and Germany" is a normal question, and single-select cannot ask it. Counts over the whole table would say 3,200 for an option that returns 40 once another filter is on. Leaving a group's own selection out of its counts shows how many employees each option matches by itself, so the counts of a ticked group's siblings stay meaningful instead of dropping to zero. A count is therefore not the size of the result after ticking that option: with India ticked, Germany's count is Germany's employees, and ticking it returns India plus Germany.

## Employee table: TanStack Table, headless, sorting and paging on the server

**Alternative considered**: the hand-rolled table.

**Chosen**: `@tanstack/react-table` v8 with `manualSorting` and `manualPagination`, so it holds column definitions, sort state, column visibility and row selection but never processes data in the browser. The server stays the only place rows are sorted and paged.

**Why**: column visibility, sort state and selection are the parts that grow bespoke code and bugs in a hand-rolled table. Version 8 is pinned because its API is stable and documented, while v9 is recent.

## Menus are non-modal

**Chosen**: every dropdown menu (export, columns, row and drawer menus, the user menu) is non-modal. Dialogs and sheets stay modal.

**Why**: a modal Radix menu locks page scroll and removes the scrollbar, which shifted the layout by 15px while the export menu was open. A menu holds no state worth trapping focus for, so nothing is lost by leaving the rest of the page interactive.

## Country flags: `country-flag-icons`, imported per country, code as fallback

**Alternative considered**: emoji flags, or bundling all 250 flags.

**Chosen**: `country-flag-icons`, with one SVG imported per supported country (three today). A country with no imported flag shows its code.

**Why**: emoji flags are not rendered on Windows, where the HR Manager is likely to be. Three SVGs add almost nothing to the bundle, adding a country is one import line, and an unknown code still reads correctly.

## Peer context: one peer-group service, typical range in local currency, outlier test in USD

**Chosen**: the typical range shown in the drawer is the p25 to p75, with the median, of active employees in the same country and level, in the local currency. Whether someone is an outlier uses the existing USD Tukey fences, so the drawer and FR-8 always agree. With fewer than 10 peers no range is shown. One function, `getPeerGroups`, serves the drawer, the bulk revision and the insights. This assumes every employee is paid in their country's currency (creation and relocation both set it), so a peer group's typical range is computed from local amounts; a group in which nobody is paid in the country's currency is not summarised, and so is not evaluated for outliers.

**Why**: a range in local currency is what the HR Manager can compare with the salary in front of them, and because peers share one country, conversion cannot change anyone's rank. The outlier verdict must not depend on which screen asks, so it keeps the fences it already had rather than a second rule in local currency. A single peer service keeps the three screens from drifting apart.

## Salary change preview: the server computes amounts, % and USD

**Alternative considered**: computing the proposed amount, the change and its USD value in the browser.

**Chosen**: `POST /api/employees/:id/salary-changes/preview` returns the amounts, the % and the USD change for a given percentage or amount. One endpoint serves the quick-% buttons and the comparison box.

**Why**: the browser never applies a percentage to money or converts a currency (`AGENTS.md`), so the rounding rule and the FX table exist in one place. The only arithmetic left in the browser is subtracting two integers in the same currency.

## Sorting by department, country and level: by joined name or rank, no extra index

**Alternative considered**: denormalised sort columns on `employees`.

**Chosen**: these sorts read the joined department or country name, or the level rank, with no index of their own. Job title gets an `employees(status, job_title)` index, like salary.

**Why**: the sort runs over a filtered set of at most 10,000 rows in a join, and it measured well inside the 300 ms target on the full 10,000-employee seed: p95 of 5.5 ms for department, 5.7 ms for level and 4.9 ms for country (2026-10-21, `docs/performance.md`). Denormalised columns would add a second copy of data that must be kept in step.

**Revisit if**: the list grows to 100,000 or more and the measured latency of these sorts approaches the target.

## Rows per page: 25, 50 or 100, in the URL

**Chosen**: the list offers 25, 50 or 100 rows per page, default 50 (`DEFAULT_PAGE_SIZE`), and the choice is a query param like the other list state.

**Why**: 50 keeps a page about one screen tall for a dense table, while 25 and 100 cover the people who want less scrolling or fewer pages. Being in the URL means a bookmarked or back-navigated list shows the same page.

## History % change: computed by the API; across a relocation, in USD at today's static rates

**Chosen**: each salary-history row in the employee detail carries `changeBp`, the % change from the previous row in basis points, computed by the API. When the previous row is in another currency (after a relocation), both amounts are compared in USD at the current static rates.

**Why**: the browser does not do money arithmetic. A relocation changes the currency, so comparing the raw numbers would show a meaningless jump. Comparing in USD at one static rate means the % reflects the change in pay rather than the exchange rate.

## Login: a dark brand panel with no copy

**Chosen**: the login screen has a solid `brand-panel` navy panel carrying only the app mark and name and a faint bar-chart pattern. It is the app's only dark surface, and an exception to the no-dark-mode rule in `docs/design.md`.

**Why**: the panel gives the first screen some identity without a second theme to maintain. It carries no pitch or feature list because the only user is already an employee who knows what the tool is for.

## Deactivation date: one nullable `deactivated_on`, cleared on reactivation, no backfill

**Alternatives considered**: reading it from `updated_at` (it changes on every edit); a status-history table (keeps every leave and return, which no question needs); backfilling existing inactive rows from `updated_at`.

**Chosen**: deactivating sets `deactivated_on` to today from the injected clock; deactivating someone already inactive keeps it; reactivating clears it. Existing databases are reset with `npm run db:reset -w @acme/api` rather than backfilled, since every database is demo data.

**Why**: a payroll at a past date, which counts someone when `status` is active or `deactivated_on` is later than that date, needs to know who had left by then, and one date per person answers that. Someone who left, came back and left again keeps only the last date, so a past payroll counts them during the gap, which is acceptable for a rare event. A backfill from `updated_at` would write wrong dates into history.

## Database reset: an explicit command that keeps the login, never automatic

**Alternatives considered**: wiping and re-seeding on boot when the schema or seed changes (silently destroys data); deleting the file (fails while the API holds it open and loses the HR login); upgrading demo data in place (a data migration per seed change).

**Chosen**: `npm run db:reset -w @acme/api` drops every table, migrates, restores the `users` rows with their ids and password hashes, then seeds. Stop the API first. The boot-time seed still does nothing once employees exist.

**Why**: nothing is lost by surprise, and because a session carries the user id, keeping the users means the HR login and any open session keep working after a reset.

## Seed realism: ten years of history, entry pay that trails increments, 10–20% promotions, skipped raises, compression groups, dated leavers

**Alternatives considered**: the earlier seed (increments only in the last five years, so someone hired ten years ago showed flat pay for five; promotions priced at the full gap between level medians, about 50% in India); hand-written fixtures for each pattern.

**Chosen**: the `docs/architecture.md` §6 bullets, with these values: ten cycles, 180 days' tenure for a cycle, entry pay +3% a year (`MARKET_GROWTH_BP = 300`) against 4.5% increments, promotions of 10–20% only for someone at or above entry pay, India's entry pay by level ₹8.0L / 10.8L / 14.5L / 19.5L / 26L / 35L (steps of about 1.35×), 4% of active employees with no change for the last 2–3 years, compression in India L2, India L3 and US L2 with recent hires 20% above entry pay, and 4% leavers with `deactivated_on`.

**Why**: every insight has real people behind it by design, and seed tests assert each proportion. Entry pay that trails increments is what makes tenure pay off, so the three planted groups show compression. On a small seed a few other groups can show a noise-level gap (5% or less); the full 10,000-employee seed shows only the planted three. With India's steeper steps a 10–20% promotion left every promotee below the new level's fences and the "Outside peer range" attention count filled with promotions.

## Salary history chart: ranges zoom the chart, figures cover the whole history, USD after a currency change

**Alternatives considered**: figures per range (four server summaries, or division in the browser); a 3Y default like recent changes; one line per currency.

**Chosen**: 3Y / 5Y / 10Y / All, default All, change only the chart's window, which ends today (or on the deactivation date) and never starts before the hire date. The summary line and figures cover the whole history and come from `domain/`. Average yearly growth is compound (`(current ÷ hire)^(365.25 ÷ days) − 1`, rounded half away from zero to a basis point, null under 365 days). The biggest jump is the largest increase, earliest on a tie. After a relocation the summary and chart are in USD at the current static rates, as the per-row % already is (see "History % change").

**Why**: one person's history is a couple of dozen rows, so the whole story is the useful default and a range is just a closer look. Compound growth is the figure that reads as "a year" across uneven gaps. Plotting two currencies on one axis would show the exchange rate, not the pay.
