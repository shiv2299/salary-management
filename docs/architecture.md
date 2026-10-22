# Architecture

This document is the engineering design for the system described in `docs/requirements.md`. It covers module boundaries, data model, core subsystems, API surface, frontend structure, and testing strategy. Visual design and UI interaction rules live in `docs/design.md`, which this document defers to rather than duplicates. Trade-offs and alternatives considered are logged separately in `docs/decisions.md`; this document describes what will be built and why it's shaped this way.

## 1. Stack and module boundaries

Monorepo (npm workspaces), scaffolded per `docs/prompts/initial.md`:

```
packages/shared/   Zod schemas + inferred types shared by API and web
apps/api/          Fastify + TypeScript + SQLite (via better-sqlite3 + Drizzle ORM)
apps/web/          Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
```

Backend layering, enforced by convention (and reviewable by grepping imports):

```
apps/api/src/
  domain/        pure functions, no I/O: money, fx, stats, validation
  repositories/  Drizzle queries only, no business logic
  services/      orchestrate repositories + domain functions; business rules live here
  routes/        Fastify handlers: parse request -> call service -> shape response
  db/            schema.ts, migrations, client
```

Rules:
- Routes never call repositories directly.
- Services never touch the Drizzle query builder directly; they call repositories.
- `domain/` has zero I/O, which is what makes its tests fast and deterministic without a database.
- **Single salary writer.** Exactly one service function, `applySalaryChanges(changes[])`, writes `salary_history`. In the same transaction it recomputes the employee's `current_*` columns (§2) and, for a promotion or relocation, updates `level_id` / `country_code`. It takes an array, so a single change, a bulk revision (§7), and the seed script (§6) all go through the same function. No other code path writes any of these columns, which is what keeps the denormalized cache in §2/§12 correct. The one documented exception is an FX-rate migration (§3).

## 2. Data model

Reference/config tables (small, mostly static, seeded once):

| Table | Columns | Notes |
|---|---|---|
| `countries` | `code` (PK, ISO 3166-1 alpha-2), `name`, `currency_code` (ISO 4217) | India (INR), United States (USD), Germany (EUR) |
| `departments` | `id`, `name` | Fixed list: Engineering, Sales, Marketing, Finance, People/HR, Support, Operations |
| `levels` | `id`, `code` (`L1`-`L6`), `label`, `rank` | `rank` orders levels; a promotion must move to a higher `rank` |
| `fx_rates` | `currency_code`, `as_of_date`, `rate_to_base_nano` (integer) | Static, dated table; base currency is USD. See §3 for the representation |

Core tables:

| Table | Columns | Notes |
|---|---|---|
| `employees` | `id`, `first_name`, `last_name`, `email`, `country_code` (FK), `department_id` (FK), `level_id` (FK), `job_title`, `hire_date`, `status` (`active`/`inactive`), `deactivated_on` (date, nullable), `current_amount_minor`, `current_currency_code`, `current_amount_base_minor`, `current_effective_date`, `current_reason`, timestamps | No manager/reporting hierarchy (see §9). The `current_*` columns are a denormalized cache of the current `salary_history` row (rule below); `current_amount_base_minor` is that amount in USD cents, used for every cross-currency sort and every insight. See §12 for why. `deactivated_on` is the day the employee became inactive (null while active), set and cleared only by deactivate/reactivate; a payroll on date D counts someone when `status` is active or `deactivated_on` is later than D. No index: the reads that use it scan every employee |
| `salary_history` | `id` (autoincrement), `employee_id` (FK), `amount_minor` (integer), `currency_code`, `effective_date`, `reason` (`hire`/`raise`/`promotion`/`relocation`/`correction`), `level_id` (FK), `country_code` (FK), `batch_id` (FK, nullable), `created_at` | Append-only, the source of truth for current salary. Stores the level and country in force from that row onward, so history shows promotions and relocations. Rows applied together via a bulk revision (§7) share a `batch_id` |
| `salary_revision_batches` | `id`, `created_at`, `effective_date`, `percentage_bp` (integer basis points; 700 = 7%), `employee_count`, `note` | One row per bulk revision (e.g. "7% raise — Engineering L3 India"); lets `salary_history` rows be grouped back into a single event for display (§5, FR-10) |
| `users` | `id`, `email`, `password_hash`, `created_at` | Single seeded HR row; no roles table |

**Which row is "current"**: the employee's `salary_history` row with the latest `effective_date`, with the highest `id` breaking ties. Because future effective dates are rejected at the API boundary (`docs/requirements.md` FR-3), the latest-dated row is always already in effect, so the cache never has to change on its own as time passes. The single writer (§1) re-selects the current row inside its transaction after inserting rather than assuming the new row is current, so:
- a **backdated** change (earlier than the current row) is recorded in history without changing current pay;
- a **correction** dated the same day as the row it fixes wins the tie on `id` and becomes current. The wrong row stays in history for audit.

Indexes:
- `employees(status, current_amount_base_minor)` — salary sort, and insights over active employees
- `employees(country_code, level_id)` — outlier peer groups (§5) and the country filter
- `employees(department_id)`, `employees(level_id)` — single-column filters
- `employees(last_name, first_name)` — default list sort
- `employees(status, job_title)` — job-title sort, like the salary sort; the department, country, and level sorts read the joined name or rank and have no index of their own (`docs/decisions.md`)
- `salary_history(employee_id, effective_date, id)` — current-row selection and history lookups
- `salary_history(effective_date)` — salary-changes window (FR-10)
- `salary_history(batch_id)` — grouping

Search is a substring match and deliberately uses no index (§7, `docs/decisions.md`).

## 3. Money and currency

- All monetary amounts are stored as **integer minor units** (e.g. paise, cents) plus an ISO 4217 currency code — never floats, to avoid rounding bugs. All three supported currencies have 2 minor digits; the domain module still looks up the exponent per currency rather than hardcoding 100.
- **FX rate representation**: `rate_to_base_nano` is the value of one major unit of the currency in USD, multiplied by 10⁹ and stored as an integer (e.g. 1 INR = 0.011980000 USD → `11980000`). Nine decimal places is enough precision for any realistic rate without using a float.
- **Conversion** is a pure domain function, `convert(amountMinor, from, to, rates)`. It computes `amountMinor × rate_from ÷ rate_to` (adjusted for minor-unit exponents) in `BigInt`, so large amounts can't overflow, and **rounds once at the end, half away from zero**, to an integer minor unit. Going between two non-USD currencies (relocation pre-fill) is a single calculation, not two separately rounded conversions.
- **Which rate**: the row with the latest `as_of_date` for each currency. The build ships one row per currency, and the UI shows its date ("FX rates as of …") wherever converted amounts appear.
- **Base amount cache**: the single writer (§1) stores the converted USD amount in `current_amount_base_minor` whenever it writes a salary. Insights and salary sort read this column, so no conversion happens at query time.
- **Changing FX rates**: the table is static, so rates only change by migration. That migration inserts new `fx_rates` rows and recomputes `current_amount_base_minor` for every employee in the same transaction. This is the only code path outside the single writer that touches a `current_*` column.
- Live FX rates are explicitly out of scope (see `docs/requirements.md`).

## 4. Auth

- **Session cookie, not a client-held token.** `POST /api/auth/login` validates email/password (argon2id hash) against the single seeded `users` row. On success it sets a cookie named `session` containing a signed JWT (`{ sub: userId }`, 8-hour expiry, signed with `JWT_SECRET`), with flags `HttpOnly; SameSite=Strict; Path=/; Secure` (`Secure` in production only).
- Because the browser reaches the API through the same-origin `/api` rewrite, the cookie travels with every request automatically. So refreshing the page, opening a new tab, following a bookmarked URL, and a plain `<a href>` CSV download all work, and JavaScript never handles the token.
- `POST /api/auth/logout` clears the cookie. `GET /api/auth/me` returns the logged-in user's email, or 401; the frontend route guard and the user menu both use it.
- **CSRF**: `SameSite=Strict` stops the browser from sending the cookie on cross-site requests. As a second layer, every mutating endpoint accepts only `application/json` bodies, which a cross-site HTML form cannot send.
- No refresh token: when the 8 hours are up, the user logs in again.
- **Deny by default**: a Fastify `onRequest` hook requires a valid session on **every** `/api/*` route, except an explicit allowlist: `POST /api/auth/login` and `GET /api/health`. A new route is therefore protected without anyone having to remember to add it. Failures return `401` with the standard `{ error: { code, message } }` shape.
- Dependency: `@fastify/cookie`, for parsing and setting the cookie. The JWT is signed and verified with `jose`.
- The seed script creates the one HR user from `HR_SEED_EMAIL` / `HR_SEED_PASSWORD` environment variables (documented in `.env.example` and the README), not a hardcoded credential.
- No password reset, registration, or RBAC — one persona only (see `docs/requirements.md`).

## 5. Insights engine

All insights read **active employees only**, using `current_amount_base_minor` (USD cents). Every figure is therefore already in one currency (FR-7) with no conversion at query time.

One core building block reused for every distribution-shaped question:

```ts
// domain/stats.ts — pure, no I/O
computeDistribution(amountsMinor: number[]): {
  headcount, min, max, mean, median, p25, p75, p90
}
```

- **Percentile method**: linear interpolation between the two nearest ranks. This is the same method as Excel's `PERCENTILE.INC`, so the HR Manager's numbers match what their old spreadsheet would have produced.
- **Rounding**: `mean` and any interpolated percentile are rounded half away from zero to an integer minor unit, so every value the function returns is an integer.

SQLite has no percentile functions, so the service layer fetches the filtered set of current USD amounts and passes the array to `computeDistribution`. The filter is a single indexed read on `employees` (§2) rather than a join to `salary_history`, and sorting even 100,000 numbers in memory takes only milliseconds. See `docs/performance.md` for measured numbers at the seeded 10,000, and `docs/decisions.md` for where this approach would eventually stop scaling.

| HR question | Endpoint | Behavior |
|---|---|---|
| Pay distribution by country/department/level | `GET /api/insights/distribution?groupBy=country\|department\|level` | `computeDistribution` per group value |
| Cross-country comparison in one currency | Same endpoint | All amounts are USD (`current_amount_base_minor`) |
| Who's an outlier vs. peers | `GET /api/insights/outliers` | Peer group = same country + level. Flags employees whose current USD salary falls outside `p25 - 1.5*IQR` .. `p75 + 1.5*IQR` for their peer group (Tukey's fences), reusing `computeDistribution`'s existing p25/p75 — no separate threshold parameter. Peer groups with fewer than 10 active employees are not evaluated, since quartiles of a handful of salaries aren't meaningful |
| Total payroll by country/department | `GET /api/insights/payroll?groupBy=country\|department` | Sum of current USD salaries per group |
| What changed, when | `GET /api/insights/recent-changes?years=3\|5&limit=&offset=` (default `years=3`) | `salary_history` rows whose `effective_date` falls in the trailing window, newest first, joined to employee name, country, and status (inactive employees are included and marked). Rows sharing a `batch_id` collapse into a single entry (e.g. "47 people, +7%, Engineering L3 India") rather than one row per employee. Offset-paginated over the grouped entries |

**Peer groups.** `getPeerGroups(db, keys?)` in `services/peer-groups.ts` is the single source of country + level peer statistics for active employees: the local-currency p25, median and p75, and the USD distribution and Tukey fences. A group with fewer than `MIN_PEER_GROUP_SIZE` (10) members has no summary. The outliers endpoint and the employee drawer's peer context both read it, so the drawer's "above the usual range" sentence and the outliers list (FR-8) always agree.

Peer grouping for outliers is country + level, not + department: at 10,000 employees across 7 departments × 3 countries × 6 levels, many department-scoped peer groups would fall below the 10-person minimum, so their quartiles (and therefore their fences) wouldn't be reliable.

## 6. Seed data generation

- 10,000 employees across 3 countries, 7 departments, 6 levels.
- A small TypeScript script (`apps/api/src/db/seed.ts`, with its reference data and tuning knobs in `seed-config.ts`), not hand-written data: `@faker-js/faker` (seeded, deterministic) generates names/emails/job titles; salary amounts are drawn from a per-(country, level) distribution calibrated to realistic local pay magnitudes, not a flat uniform range.
- ~1-2% of employees get a deliberately out-of-band salary, so the outlier/IQR feature has real data to surface in the demo.
- Hire dates are spread over the 10 years before `referenceDate`. One company-wide increment cycle runs every year for the whole span (`referenceDate − 60 days` and each 365 days before it, ten in all) as real bulk revisions, one `salary_revision_batches` row per country + department group, a few percent each, for everyone hired at least 180 days before it with no change in the 120 days before it.
- Individual raises, promotions and relocations fall anywhere from 180 days after hire to the end of employment, about 0.6 changes per 5 years of tenure (each 5-year block of the window draws 0–3 changes with weights 55/30/12/3), each date uniform over the window.
- Entry pay for a level grows 3% a year while increments average 4.5%, so long-tenured staff are paid above recent hires of the same level, except in three planted compression groups (India L2, India L3, US L2) where people hired in the last 12 months come in 20% above entry pay.
- A promotion raises pay by 10–20% and goes only to someone paid at or above their level's entry pay at the time (otherwise the change is a raise). India's level steps are about 1.35×, like the other countries', so a promotion lands inside the next level's band.
- About 4% of active employees, all with 3+ years' tenure, get no change of any kind from a date 2–3 years before `referenceDate`.
- About 4% of employees leave, each deactivated with a `deactivated_on` date between 90 days after hire and the day before `referenceDate`; their history stops before it.
- Measured row counts are in `docs/performance.md`.
- **Inputs**: `seed(db, { rngSeed, referenceDate, employeeCount? })`. All generated dates are offsets back from `referenceDate`, so the salary-changes view (FR-10) always has data across its 3 and 5-year windows. On app boot the server passes today's date; tests pass a fixed date. The same two inputs always produce identical data.
- Runs in a single transaction for insert performance; idempotent (no-op if `employees` already has rows), safe to run on app boot.
- `npm run db:reset -w @acme/api` drops every table, applies every migration, restores the `users` rows (same ids and password hashes) and seeds again. It is the way to move an existing database to a new schema or seed; nothing wipes data automatically.
- Writes go through the service layer: `createEmployees(batch)` (the same function `POST /api/employees` calls with a batch of one), and from there the single salary writer (§1). The seed has no HTTP endpoint of its own, and a future Excel import would be a thin layer on top of these functions rather than duplicated logic.

## 7. API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` \| `/logout`, `GET /api/auth/me` | Session cookie lifecycle (§4) |
| `GET /api/employees` | Paginated list; filters: `country`, `department`, `level` (each multi-valued: repeated or comma-separated; OR within a filter, AND across filters), `status` (default `active`; also `inactive`, `all`), `search`; `sortBy` one of name, `jobTitle`, `department`, `level` (by rank), `country`, hire date, salary (salary sorts by `current_amount_base_minor`); offset pagination |
| `GET /api/employees/facets?<list filters>` | Per-group option counts for the filter panel (`country`, `department`, `level`, `status`) plus `statusTotal`. Each group's counts apply the search and every other group's selection but not its own, so each option's count is how many employees match that option under the search and the other groups' selections (with a sibling already ticked in the same group, ticking another adds to the result rather than narrowing it) |
| `GET /api/employees/:id` | Employee record + current salary + `deactivatedOn` + full salary history. Each history row carries `changeBp`, the % change from the previous row in basis points (across a relocation, compared in USD at the current static rates), and `amountBaseMinor`, its amount in USD at the current static rates. `historySummary` (from `domain/history-summary.ts`) gives `currencyCode` (local, or USD when the history spans currencies) and `convertedToUsd`, `hireAmountMinor` and `currentAmountMinor` in that currency, `sinceHireBp`, `averageYearlyGrowthBp` (compound, from the hire date to today or the deactivation date; null with one row or under a year), `biggestJump` (the largest increase: `historyId`, `changeBp`, `effectiveDate`, `reason`; null when pay never went up), `promotionCount` and `raiseCount` |
| `GET /api/employees/:id/peer-context` | The employee's peer group from `getPeerGroups` (§5): typical range (local p25–p75), median, headcount, and whether the employee is above, below, or inside the range; no range when the group is under the minimum size. Read-only |
| `POST /api/employees/:id/salary-changes/preview` | `{ reason, amountMinor \| percentageBp, newLevelId?, newCountryCode? }` → `current` and `proposed` (local + USD), `changeBaseMinor`, `changeBp`, and `peer` (the peer sentence's data). Read-only; nothing is written. The amount for a percentage is computed here in `domain/`, so the browser never multiplies money |
| `POST /api/employees` | Create employee + initial (hire) salary row, via `createEmployees` (§6) |
| `PATCH /api/employees/:id` | Edit name, email, department, job title. Requests that change `country_code`, `level_id`, or salary fields are rejected with a 400 — those change only through `salary-changes` |
| `POST /api/employees/:id/salary-changes` | One effective-dated change: `{ reason, effectiveDate, amountMinor, newLevelId?, newCountryCode? }`. See the validation rules below |
| `POST /api/employees/bulk-salary-changes/preview` | `{ filter \| employeeIds, percentageBp }` (`filter` takes arrays for `country`, `department`, `level`) → every matching **active** employee with `currentAmountMinor`, currency, and `proposedAmountMinor`; each item also carries `currentAmountBaseMinor` (the cached USD amount), `proposedAmountBaseMinor` (converted once in `domain/`), `changeBp` (`percentChangeBp(current, proposed)`) and `outsidePeerRange` (`'above' | 'below' | null`, the FR-8 rule from `getPeerGroups` on current pay). Read-only. Returns the full set (not paginated) so the UI can page through it and hold overrides locally; for the seeded 10,000 employees (9,577 active) that is about 3.0 MB |
| `POST /api/employees/bulk-salary-changes/summary` | `{ filter \| employeeIds, percentageBp?, overrides?: [{ employeeId, newAmountMinor }] }` → `headcount`, `byDepartment`, and with a percentage `revision`: `addedByCurrency`, `addedBaseMinor`, `typical { currencyCode, beforeMinor, afterMinor }`, `overriddenCount`, `overrideChangeBp`. Read-only; overrides for people outside the selection are ignored. Each `newAmountMinor` is at most `MAX_BULK_AMOUNT_MINOR` (90,000,000,000), so the sums stay exact (`docs/decisions.md`) |
| `GET /api/employees/bulk-salary-changes/latest` | `{ latest: { batchId, effectiveDate, percentageBp, employeeCount, note } \| null }`: the batch with the latest effective date (highest id on a tie) |
| `POST /api/employees/bulk-salary-changes` | Confirm: `{ percentageBp, effectiveDate, note, items: [{ employeeId, expectedCurrentAmountMinor, newAmountMinor }] }`, each `newAmountMinor` at most `MAX_BULK_AMOUNT_MINOR`. Always an explicit list from the preview, never a filter, so the committed set is exactly the set the HR Manager reviewed. If any employee's current amount no longer matches `expectedCurrentAmountMinor`, or any employee is now inactive, the whole request fails with `409` and nothing is written. Otherwise it creates one `salary_revision_batches` row and calls the single writer once with every item, in one transaction |
| `DELETE /api/employees/:id` | Soft delete: `status: inactive` and `deactivated_on` = today (injected clock); an already inactive employee keeps its date. Never a hard delete, to preserve salary history |
| `POST /api/employees/:id/reactivate` | Sets `status: active` and clears `deactivated_on` |
| `GET /api/employees/export?scope=filtered&<list filters>` \| `?scope=all` | Streams CSV. `filtered` = exactly the rows the list query matches (all pages, same search/filters); `all` = every employee, active and inactive. Columns include status, local amount + currency, USD amount, and effective date. Amounts are written as decimal strings formatted from integer minor units (`123456.78`), never via a float |
| `GET /api/insights/distribution` \| `/payroll` \| `/outliers` \| `/recent-changes` | As described in §5 |
| `GET /api/reference/countries` \| `/departments` \| `/levels` \| `/fx-rates` | Powers UI dropdowns/filters and the "FX rates as of" label |
| `GET /api/reference/fx/convert?amountMinor=&from=&to=` | Server-side conversion for the relocation pre-fill. The browser never does money arithmetic |
| `GET /api/health` | Scaffolded in the initial setup |

Every `/api/*` route requires a session except `POST /api/auth/login` and `GET /api/health` (§4).

**Salary-change validation** (Zod at the boundary, business rules in the service):
- **All reasons**: `effectiveDate` ≤ today (injected clock) and ≥ the employee's `hire_date`; the employee must be active; `amountMinor` > 0.
- **`raise`**: `amountMinor` greater than the current amount; `newLevelId` and `newCountryCode` not allowed.
- **`promotion`**: `newLevelId` required, with a higher `rank` than the current level.
- **`relocation`**: `newCountryCode` required and different from the current country; `amountMinor` is in the new country's currency.
- **`correction`**: any positive amount; optional `newLevelId` to fix a mis-entered level.
- **`hire`**: not accepted here — hire rows come only from `POST /api/employees`.

**Bulk-revision math**: `percentageBp` is an integer from 1 to 10,000 (0.01%–100%). The proposed amount is `round_half_away_from_zero(current × (10000 + bp) / 10000)`, computed in integer arithmetic in `domain/`. Every bulk row has reason `raise`.

**Search**: case-insensitive substring match (`LIKE '%term%'`, with `%`, `_`, and `\` in the user's input escaped) against `first_name || ' ' || last_name`, `email`, and `job_title`. This is an unindexed scan; see `docs/decisions.md` for why that's acceptable at the target scale and when to switch to SQLite FTS5.

## 8. Frontend structure

All visual and interaction decisions (layout, color, typography, component conventions, responsive behavior) are specified in `docs/design.md`, not here — this section covers routing and data-flow structure only, and every screen must follow `docs/design.md` rather than improvising.

```
src/app/
  login/page.tsx                          # public
  (app)/layout.tsx                        # auth guard (GET /api/auth/me) + top bar; renders {children} and {drawer}
  (app)/insights/page.tsx                 # default landing page post-login: distribution charts, payroll summary, outliers, recent changes
  (app)/employees/page.tsx                # list: left filter panel + TanStack Table, toolbar, pagination, export, bulk selection bar
  (app)/employees/revisions/new/page.tsx  # bulk revision screen; selection carried in the query string
  (app)/employees/[id]/page.tsx           # full-page detail (direct navigation / refresh)
  (app)/@drawer/default.tsx               # renders nothing when no drawer is open
  (app)/@drawer/(.)employees/[id]/page.tsx  # intercepted route: same detail rendered in a slide-over drawer over the list
src/features/
  auth/       # login form, useSession hook (wraps /api/auth/me), route guard
  employees/  # query hooks, table columns, filter panel, drawer tabs, forms
  bulk-revision/  # selection ⇄ URL, preview/summary hooks, setup and review columns, confirm dialog
  insights/   # query hooks, chart components
src/components/ui/  # shared building blocks named in docs/design.md §5: card, stat tile, segmented control, chip, checkbox group, tabs, avatar, country flag, level badge, menus
src/lib/api.ts  # typed fetch wrapper (same-origin, cookie sent automatically), throws a typed error on non-2xx; on 401 redirects to /login
```

- The bulk revision screen reads its selection from its own query string, loads the preview and a debounced summary through TanStack Query, and never computes a money figure; the preview stays the full set held in the browser, which pages, searches and filters it locally.
- The employee drawer's History tab draws a step chart from the detail response: it uses each row's `amountBaseMinor` when `historySummary.convertedToUsd` is true and `amountMinor` otherwise, and filters rows by date for the chosen range. Every converted amount and percentage it shows comes from the API.
- Route guard: the `(app)` layout calls `GET /api/auth/me`; a 401 redirects to `/login`. Sufficient for a single-user, non-SEO internal tool.
- Insights is the default route after login (§5): it's the surface used weekly, versus the employee list and salary changes which are used far less often.
- Employee detail uses a Next.js parallel route slot (`@drawer`) plus an intercepting route, so it opens as a slide-over drawer while keeping the list's scroll position and filters. On direct navigation or refresh, the same URL renders the full page instead. Both render the same detail component from `features/employees`.
- The relocation form fetches the converted amount from `/api/reference/fx/convert` to pre-fill the salary field; the HR Manager can then edit it.
- CSV export is a plain `<a href="/api/employees/export?...">` built from the current URL's filter params (or `scope=all`); the session cookie authenticates it.
- Components: shadcn/ui (Table, Sheet, Dialog, Form, Select, Badge, Toast) as the base, themed per `docs/design.md`; the shared building blocks live in `components/ui/`. The employee list is a TanStack Table (headless, `manualSorting` and `manualPagination`, so the server stays the only place data is sorted and paged) beside a collapsible left filter panel whose state lives in the URL. The employee drawer has three tabs: Change salary, Details, and History. Recharts for the insights dashboard.
- All data fetching via TanStack Query, through the existing Next.js `/api` rewrite; no server-side API calls.
- Fully responsive per the breakpoint rules in `docs/design.md` §7 — there is one implementation, not a separate mobile build.

## 9. Explicitly excluded from the data model

No `manager_id` / reporting hierarchy on `employees`. None of the five HR questions in `docs/requirements.md` (FR-6..FR-10) require an org chart, and seeding a believable reporting tree would add generator complexity with no analytical payoff.

## 10. Testing strategy

| Layer | What | Tool | Notes |
|---|---|---|---|
| Domain | money rounding, FX conversion, bulk-revision amount, `computeDistribution` (incl. interpolation), IQR outlier check, current-row selection rule, seed distribution math | Vitest | Pure functions, no I/O; written first |
| Repository/service | employee CRUD, single salary writer (backdated, same-day correction, promotion, relocation), bulk revision incl. 409 on stale preview, insights queries, auth (hash/verify/issue token) | Vitest + in-memory SQLite, small fixed fixture | Injected clock and RNG for determinism |
| API | route validation, pagination params, auth 401/200 and deny-by-default, error shape, CSV export scopes and headers | Vitest + Fastify `app.inject()` | A handful per route |
| Frontend | employee table rendering, form validation, relocation pre-fill, bulk revision overrides, insights chart data mapping, auth redirect | Vitest + React Testing Library + jsdom, stubbed `fetch` | Component tests live next to the component |
| E2E | — | Not in this build | Matches `AGENTS.md` |

Test names are plain sentences. Coverage is reported honestly; no arbitrary percentage target is chased.

## 11. Deployment

The deployable unit is a single Docker image (`Dockerfile`) serving the Fastify API and the Next.js standalone build in two processes started by `scripts/start.sh`, matching the scaffold (`output: 'standalone'`, `/api` rewrite, `API_URL` baked in at build time). The image ships `apps/api/drizzle/` for the boot-time migrations, runs as a non-root user, and has a `HEALTHCHECK` on `GET /api/health`; configuration is documented in the README. The SQLite file must live on a **persistent volume** mounted at `DATABASE_PATH`. Render, Railway, and Fly.io all have ephemeral container filesystems, and seed-on-boot (§6) would silently recreate fresh data after every deploy, hiding the data loss. The specific hosting platform is an operational choice deferred to the deployment phase, and will be recorded in `docs/decisions.md` once made.

## 12. Scalability

The system is seeded with 10,000 employees, but the data model and query patterns are chosen so the design holds at 100,000+ without a rework. This is validated architecturally, not by actually seeding or load-testing 100k rows in the submitted build (see `docs/decisions.md`).

- **Current salary is a denormalized, indexed column on `employees`** (§2), in both local currency and USD, kept correct by a single service-layer write path (§1) rather than derived per-request from `salary_history`. This turns every list and insights query from a per-employee aggregation into a plain indexed read. Per-employee aggregation is what breaks down at scale — SQLite itself comfortably handles well past 100,000 rows; the risk was always query shape, not the database.
- **Bulk salary revisions run as one transaction** (§7), the same pattern the seed script uses (§6). In embedded SQLite there are no network round trips; the win is that thousands of rows commit with one disk sync instead of thousands.
- **CSV export streams to the response** in id-ordered batches of 1,000 rows (keyset paging), so the full result set is never buffered in memory and no database cursor stays open while a slow client downloads (`docs/decisions.md`).
- **List pagination stays offset-based.** It remains index-backed and fast through 100,000 rows; it is not designed to stay fast at millions of rows with very deep offsets. That threshold, and the cursor-based alternative, is recorded as a forward-looking trade-off in `docs/decisions.md` rather than built now.
- **Search is an unindexed substring scan**, which is fast enough at 100,000 rows; `docs/decisions.md` records the FTS5 trigram alternative.
- **Insights statistics are computed in application memory** (`computeDistribution`, §5) because SQLite has no percentile functions. Sorting an array of 100,000 numbers is on the order of milliseconds, so this remains fine at the scale this architecture targets; `docs/decisions.md` records where it would need to change (a DB-side percentile extension or pre-aggregated rollups) if the target scale grew by another order of magnitude.
