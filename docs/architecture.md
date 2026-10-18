# Architecture

This document is the engineering design for the system described in `docs/requirements.md`. It covers module boundaries, data model, core subsystems, API surface, frontend structure, and testing strategy. Visual design and UI interaction rules live in `docs/design.md`, which this document defers to rather than duplicates. Trade-offs and alternatives considered are logged separately in `docs/decisions.md`; this document describes what was built and why it's shaped this way.

## 1. Stack and module boundaries

Monorepo (npm workspaces), as scaffolded in `docs/prompts/initial.md`:

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
- Exactly one service function writes `salary_history`, and it always writes the employee's `current_*` columns in the same transaction. No other code path is allowed to touch either, which is what keeps the denormalized cache in §2/§12 correct.

## 2. Data model

Reference/config tables (small, mostly static, seeded once):

| Table | Columns | Notes |
|---|---|---|
| `countries` | `code` (PK, ISO 3166-1 alpha-2), `name`, `currency_code` (ISO 4217) | India (INR), United States (USD), Germany (EUR) |
| `departments` | `id`, `name` | Fixed list: Engineering, Sales, Marketing, Finance, People/HR, Support, Operations |
| `levels` | `id`, `code` (`L1`-`L6`), `label`, `rank` | `rank` orders levels for band comparisons |
| `fx_rates` | `currency_code`, `as_of_date`, `rate_to_base` | Static, dated table; base currency is USD |

Core tables:

| Table | Columns | Notes |
|---|---|---|
| `employees` | `id`, `first_name`, `last_name`, `email`, `country_code` (FK), `department_id` (FK), `level_id` (FK), `job_title`, `hire_date`, `status` (`active`/`inactive`), `current_amount_minor`, `current_currency_code`, `current_effective_date`, `current_reason`, timestamps | No manager/reporting hierarchy (see §9). The `current_*` columns are a denormalized cache of the latest `salary_history` row — see §12 for why |
| `salary_history` | `id`, `employee_id` (FK), `amount_minor` (integer), `currency_code`, `effective_date`, `reason` (`hire`/`raise`/`promotion`/`correction`), `batch_id` (FK, nullable), `created_at` | Append-only, the source of truth for current salary. Rows applied together via a bulk revision (§7) share a `batch_id` |
| `salary_revision_batches` | `id`, `created_at`, `percentage`, `note` | One row per bulk revision (e.g. "7% raise — Engineering L3 India"); lets `salary_history` rows be grouped back into a single event for display (§5, FR-10) |
| `users` | `id`, `email`, `password_hash`, `created_at` | Single seeded HR row; no roles table |

Indexes: `employees(country_code, department_id, level_id)` composite for list/filter; `employees(status)`; `employees(current_amount_minor)` for insights queries that filter/sort on current pay; `salary_history(employee_id, effective_date)` for audit/history lookups; `salary_history(batch_id)` for grouping; a name/email index on `employees` for search.

## 3. Money and currency

- All monetary amounts are stored as **integer minor units** (e.g. paise, cents) plus an ISO 4217 currency code — never floats, to avoid rounding bugs.
- Cross-country comparisons convert to a common base currency (USD) via the static, dated `fx_rates` table at query time. Conversion is a pure domain function, independently testable.
- Live FX rates are explicitly out of scope (see `docs/requirements.md`).

## 4. Auth

- `POST /api/auth/login` validates email/password (argon2id hash) against the single seeded `users` row and returns a JWT (`{ sub: userId }`, 1-hour expiry, signed with `JWT_SECRET`).
- No refresh token: given a single user, re-login on expiry is simpler to build, test, and explain than refresh rotation.
- The client holds the token in memory (not `localStorage`), attached as `Authorization: Bearer <token>` via the shared API client.
- A Fastify `preHandler` hook guards `/api/employees*`, `/api/insights*`, `/api/reference*`; returns `401` with the standard `{ error: { code, message } }` shape on a missing/invalid/expired token.
- The seed script creates the one HR user from `HR_SEED_EMAIL` / `HR_SEED_PASSWORD` environment variables (documented in `.env.example` and the README), not a hardcoded credential.
- No password reset, registration, or RBAC — one persona only (see `docs/requirements.md`).

## 5. Insights engine

One core building block reused for every distribution-shaped question:

```ts
// domain/stats.ts — pure, no I/O
computeDistribution(amounts: number[]): {
  headcount, min, max, mean, median, p25, p75, p90
}
```

SQLite has no percentile functions, so the service layer fetches the filtered set of current salaries (already converted to USD via the FX domain module) and passes the array to `computeDistribution`. Because `current_amount_minor` is a denormalized, indexed column on `employees` (§12) rather than a derived join, this fetch stays a single indexed query at any employee count this system is designed for; the in-memory sort that follows is cheap even at 100,000 rows (see `docs/performance.md` for measured numbers at the seeded 10,000, and `docs/decisions.md` for where this approach would eventually stop scaling).

| HR question | Endpoint | Behavior |
|---|---|---|
| Pay distribution by country/department/level | `GET /api/insights/distribution?groupBy=country\|department\|level` | `computeDistribution` per group value |
| Cross-country comparison in one currency | Same endpoint | Amounts pre-converted to USD before grouping |
| Who's an outlier vs. peers | `GET /api/insights/outliers` | Peer group = same country + level. Flags employees whose current (USD) salary falls outside `p25 - 1.5*IQR` .. `p75 + 1.5*IQR` for their peer group (Tukey's fences), reusing `computeDistribution`'s existing p25/p75 — no separate threshold parameter |
| Total payroll by country/department | `GET /api/insights/payroll?groupBy=country\|department` | Sum of current (USD) salaries per group |
| What changed, when | `GET /api/insights/recent-changes?days=90` | `salary_history` rows within the trailing window, joined to employee name/country. Rows sharing a `batch_id` collapse into a single entry (e.g. "47 people, +7%, Engineering L3 India") rather than one row per employee |

Peer grouping for outliers is country + level, not + department: at 10,000 employees across 7 departments x 3 countries x 6 levels, department-scoped peer groups would often be too small (fewer than 5 people) for a stable median.

## 6. Seed data generation

- 10,000 employees across 3 countries, 7 departments, 6 levels.
- A small TypeScript script (`apps/api/src/db/seed.ts`), not hand-written data: `@faker-js/faker` (seeded, deterministic) generates names/emails/job titles; salary amounts are drawn from a per-(country, level) distribution calibrated to realistic local pay magnitudes, not a flat uniform range.
- ~1-2% of employees get a deliberately out-of-band salary, so the outlier/IQR feature has real data to surface in the demo.
- Each employee gets 1-3 `salary_history` rows (hire plus occasional raise/promotion) with staggered `effective_date`s.
- Fixed RNG seed for reproducibility; single batched transaction with a reused prepared statement for insert performance; idempotent (no-op if `employees` already has rows), safe to run on app boot.
- The seed script calls the same service-layer bulk-create/validation path the API uses, so a future Excel import would be a thin layer on top rather than duplicated logic.

## 7. API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` | Returns a JWT |
| `GET /api/employees` | Paginated list; filters: `country`, `department`, `level`, `status`, `search`; sort; offset pagination |
| `GET /api/employees/:id` | Employee record + current salary + full salary history |
| `POST /api/employees` | Create employee + initial (hire) salary row |
| `PATCH /api/employees/:id` | Edit non-salary fields |
| `POST /api/employees/:id/salary-changes` | Add an effective-dated salary change for one employee |
| `POST /api/employees/bulk-salary-changes` | Apply a percentage increase to a set of employees (explicit IDs or a filter) as of one effective date, with optional per-employee amount overrides. Creates one `salary_revision_batches` row, one `salary_history` row per employee, and updates each employee's `current_*` columns, all in a single transaction with a reused prepared statement (same pattern as the seed script, §6) |
| `DELETE /api/employees/:id` | Soft delete (`status: inactive`); never a hard delete, to preserve salary history |
| `GET /api/employees/export` | Streams CSV of current employees + current salary |
| `GET /api/insights/distribution` \| `/payroll` \| `/outliers` \| `/recent-changes` | As described in §5 |
| `GET /api/reference/countries` \| `/departments` \| `/levels` | Powers UI dropdowns/filters |
| `GET /api/health` | Already scaffolded |

All endpoints except `POST /api/auth/login` and `GET /api/health` sit behind the JWT auth hook.

## 8. Frontend structure

All visual and interaction decisions (layout, color, typography, component conventions, responsive behavior) are specified in `docs/design.md`, not here — this section covers routing and data-flow structure only, and every screen must follow `docs/design.md` rather than improvising.

```
src/app/
  login/page.tsx                   # public
  (app)/insights/page.tsx          # default landing page post-login: distribution charts, payroll summary, outliers, recent changes
  (app)/employees/page.tsx         # list: table, inline filter row, pagination, export, bulk-revision action bar
  (app)/employees/[id]/            # intercepted route: opens as a slide-over drawer over the list, not a full navigation
src/features/
  auth/       # login form, token context, route guard
  employees/  # query hooks, table columns, forms, bulk-revision preview logic
  insights/   # query hooks, chart components
src/lib/api.ts  # typed fetch wrapper, attaches Authorization header, throws a typed error on non-2xx
```

- Route guard: client-side check in a layout for the `(app)` route group; no token redirects to `/login`. Sufficient for a single-user, non-SEO internal tool.
- Insights is the default route after login (§5): it's the surface used weekly, versus the employee list and salary changes which are used far less often.
- Employee detail opens via Next.js's intercepting-routes pattern as a slide-over drawer, preserving the list's scroll position and filters; it falls back to a full page at the same URL on direct navigation/refresh.
- Components: shadcn/ui (Table, Sheet, Dialog, Form, Select, Badge, Toast) as the base, themed per `docs/design.md`; Recharts for the insights dashboard.
- All data fetching via TanStack Query, through the existing Next.js `/api` rewrite; no server-side API calls.
- Fully responsive per the breakpoint rules in `docs/design.md` §7 — there is one implementation, not a separate mobile build.

## 9. Explicitly excluded from the data model

No `manager_id` / reporting hierarchy on `employees`. None of the five HR questions in `docs/requirements.md` require an org chart, and seeding a believable reporting tree would add generator complexity with no analytical payoff.

## 10. Testing strategy

| Layer | What | Tool | Notes |
|---|---|---|---|
| Domain | money, FX conversion, `computeDistribution`, IQR outlier check, seed distribution math | Vitest | Pure functions, no I/O; written first |
| Repository/service | employee CRUD, salary-change creation, insights queries, auth (hash/verify/issue token) | Vitest + in-memory SQLite, small fixed fixture | Injected clock and RNG for determinism |
| API | route validation, pagination params, auth 401/200, error shape, CSV export headers | Vitest + Fastify `app.inject()` | A handful per route |
| Frontend | employee table rendering, form validation, insights chart data mapping, auth redirect | Vitest + React Testing Library + jsdom, stubbed `fetch` | Follows the pattern set by the scaffolded health-check test |
| E2E | — | Skipped | Not committed to in the plan; the first thing added back if time allows, never something cut from a committed scope |

Test names are plain sentences. Coverage is reported honestly; no arbitrary percentage target is chased.

## 11. Deployment

The architecture assumes a single Docker image serving the Fastify API and the Next.js standalone build, as already reflected in the scaffold (`output: 'standalone'`, `/api` rewrite, `API_URL` env var). The specific hosting platform (Render / Railway / Fly.io) is an operational choice deferred to the deployment phase, not an open architectural question, and will be recorded in `docs/decisions.md` once made.

## 12. Scalability

The system is seeded with 10,000 employees, but the data model and query patterns are chosen so the design holds at 100,000+ without a rework. This is validated architecturally, not by actually seeding or load-testing 100k rows in the submitted build (see `docs/decisions.md`).

- **Current salary is a denormalized, indexed column on `employees`** (§2), kept correct by a single service-layer write path (§1) rather than derived per-request from `salary_history`. This turns every list and insights query from a per-employee aggregation into a plain indexed read, which is what actually breaks down at scale — SQLite itself comfortably handles well past 100,000 rows; the risk was always query shape, not the database.
- **Bulk salary revisions run as one transaction with a reused prepared statement** (§7), the same pattern the seed script already uses (§6) — applying a revision to thousands of employees is one round trip, not thousands.
- **CSV export streams rows from a database cursor directly to the response** instead of buffering the full result set in memory.
- **List pagination stays offset-based.** It remains index-backed and fast through 100,000 rows; it is not designed to stay fast at millions of rows with very deep offsets. That threshold, and the cursor-based alternative, is recorded as a forward-looking trade-off in `docs/decisions.md` rather than built now.
- **Insights statistics are computed in application memory** (`computeDistribution`, §5) because SQLite has no percentile functions. Sorting an array of 100,000 numbers is on the order of milliseconds, so this remains fine at the scale this architecture targets; `docs/decisions.md` records where it would need to change (a DB-side percentile extension or pre-aggregated rollups) if the target scale grew by another order of magnitude.
