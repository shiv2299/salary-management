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

**Why**: this system is designed to hold up at 100,000+ employees (`docs/requirements.md` §6), not just the seeded 10,000. A derived "latest row per employee" query re-aggregates on every list and insights request; a denormalized, indexed column turns that into a plain read. The cost is a second place the value lives, mitigated by funneling every write through exactly one service function (`docs/architecture.md` §1) — there is no second code path that could let it drift from `salary_history`, which remains the append-only source of truth.

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
- Excluded from all insights.
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

**Trade-off**: the preview returns the full matching set (~1 MB at 10,000 rows) so the UI can page through it and hold overrides locally. That's fine at this scale, and selecting tens of thousands of people in one revision isn't a realistic workflow.

## Search: substring match, unindexed

**Alternative considered**: prefix-only search (B-tree indexable), or an SQLite FTS5 trigram index.

**Chosen**: case-insensitive `LIKE '%term%'` across full name, email, and job title.

**Why**: the HR Manager expects a search like Excel's Find, which matches anywhere in the text. A substring scan of 100,000 short rows is a few tens of milliseconds, inside the latency target, and needs no extra table or triggers. FTS5 would add a virtual table that Drizzle doesn't model, plus sync triggers, for no measurable benefit at this scale.

**Revisit if**: measured search latency approaches the target, which is likely somewhere past a few hundred thousand rows. Then add an FTS5 table with the `trigram` tokenizer, which supports substring matching.

## Salary changes view: 3 or 5 years, by effective date

**Alternatives considered**: a short window such as 90 days; windowing by `created_at` (when the change was entered).

**Chosen**: the window is the last 3 or 5 years (default 3), and a change counts if its `effective_date` falls inside it.

**Why**: revisions happen a few times a year, so a 90-day window would usually show one cycle or none. Compensation questions are about multi-year patterns: how pay moved across the last few increment cycles, and who was promoted when. Bulk revisions collapse into one entry each, and the list is paginated, so even 5 years stays readable. The window is based on effective date because the question is when pay actually changed. The cost is that a correction entered today but backdated to before the window won't appear. That's acceptable because the change is still visible in that employee's history.

## Seed data: deterministic relative to a reference date

**Alternative considered**: fixed absolute dates.

**Chosen**: `seed({ rngSeed, referenceDate })`; all dates are offsets back from `referenceDate`.

**Why**: with fixed absolute dates the seeded history would slide out of the 3/5-year window over time, and the view would gradually empty. Generating dates relative to a reference date keeps the demo meaningful whenever it runs, and the output is still fully deterministic for tests because they pass a fixed date.

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

**Why**: the history row is a statement about what the employee was paid on that date. Using today's currency would label an old rupee amount as euros. The "a raise must increase the current amount" rule still compares against the current amount, so a backdated raise across a relocation is judged by the HR Manager, not guessed at by the system.

## Email: stored lowercase, unique case-insensitively

**Chosen**: emails are trimmed and lowercased at the API boundary, and uniqueness is checked case-insensitively.

**Why**: `Asha@acme.test` and `asha@acme.test` are the same mailbox, and SQLite's `UNIQUE` is case-sensitive, so without this a duplicate could be created by changing the case.

## Mutations accept JSON only, including `text/plain`

**Chosen**: the `text/plain` body parser Fastify installs by default is removed, so form-encoded, multipart and `text/plain` bodies all get `415`.

**Why**: `docs/architecture.md` §4 relies on "JSON only" as a second CSRF layer. A cross-site HTML form can send `text/plain`, which would have reached body-less mutations such as reactivate. Clients must not send a `Content-Type: application/json` header with an empty body on those routes.

## Recent changes: every history row counts, shown under the country in force

**Chosen**: the recent-changes view lists every `salary_history` row effective in the window, including hire rows (shown with no "from" amount). Each entry's country is the one in force from that row onward, not the employee's current country. "From" is the pay on the employee's previous row by effective date, which may be in another currency after a relocation.

**Why**: a hire is the first change to someone's pay and is part of "what changed, when". Using the row's country keeps a relocation entry under the country the person moved to, and keeps an old change under the country it was made in. Taking "from" by effective date rather than entry order means a backdated change compares against the row actually before it.

## Outlier fences are shown rounded, compared exactly

**Chosen**: the outliers response gives each peer group's fences rounded to a whole minor unit, while the outlier test itself uses the exact fence values.

**Why**: Tukey's fences are 1.5 × IQR and can fall on a half unit. Every other amount in the API is an integer minor unit, so the displayed fence follows suit, and the decision about who is an outlier is never affected by that display rounding.

