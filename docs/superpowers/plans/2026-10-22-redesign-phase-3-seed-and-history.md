# Redesign Phase 3: Seed, Data Model and Salary History Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give employees a deactivation date, add a `db:reset` command, make the seed realistic across its full 10-year span (spec §10), and add the drawer's History tab step chart with its ranges, summary line and figures (spec §6 "History tab").

**Architecture:** `employees.deactivated_on` (nullable ISO date) is written by `setEmployeeStatus` from the injected clock and returned as `deactivatedOn` in the employee detail. `resetDatabase` (in `db/reset.ts`) drops every table, migrates, restores the `users` rows and runs the existing `bootstrapDatabase`; `npm run db:reset -w @acme/api` runs it through `seed-cli.ts --reset`. The seed keeps `seed({ rngSeed, referenceDate })` and adds, one pattern per task: ten yearly cycles and individual changes from each hire date with entry pay that trails the increments, 10–20% promotions, dated leavers, skipped raises and three compression groups; its reference data and knobs move to `db/seed-config.ts`. A pure `domain/history-summary.ts` computes the since-hire change, compound yearly growth, biggest increase and counts (in USD when the history spans currencies); the detail response carries it as `historySummary`, plus `amountBaseMinor` on every history row. The web History tab filters the loaded rows by date for the chosen range and plots them with a Recharts step line; it never converts or divides money.

**Tech Stack:** Fastify 5, Drizzle ORM + drizzle-kit + better-sqlite3, `@faker-js/faker` (seeded), Zod 4 (`packages/shared`), Next.js 16 App Router, TanStack Query 5, Recharts 3, Tailwind 4, Vitest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-ux-redesign-design.md` (binding; §6 "History tab", §10, §13 and §14 item 3, with §3, §4 and §11). Overview plan: `docs/superpowers/plans/2026-10-21-ui-ux-redesign.md` ("Phase 3" and "Cross-phase interfaces"). Phase 1 and 2 plans (names this phase builds on): `docs/superpowers/plans/2026-10-21-redesign-phase-1-style-and-employees.md`, `docs/superpowers/plans/2026-10-21-redesign-phase-2-bulk-revision.md`.

## Global Constraints

Copied verbatim from the overview plan (apply to every task):

- Use Node 24. Prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" &&`. The default `node` is v20, and the test runner crashes under it.
- Commands are run from the repo root: `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check` (`npm run format` to fix). All four must pass at the end of every task.
- Follow `AGENTS.md`:
  - routes → services → repositories;
  - pure `domain/` with no clock or RNG calls;
  - money as integer minor units plus an ISO code;
  - Zod at the API boundary;
  - server-side pagination;
  - plain-sentence test names;
  - injected clock and RNG in tests.
- The browser never converts currencies and never applies a percentage to money. Integer subtraction or summing within one currency is allowed.
- Docs first: a task that changes behaviour covered by `docs/design.md`, `docs/requirements.md`, `docs/architecture.md` or `docs/decisions.md` updates that doc in the same task. Decision entries use the existing "Alternatives considered / Chosen / Why" form.
- Repository text (docs, comments, commit messages) reads as a real product's own documentation: it describes the product and its decisions, never the circumstances of its development.
- Conventional Commits, small commits. Each commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, force-push or rewrite history.
- Add a dependency only with a stated reason in the commit message.
- The visual language is "Refined classic" (spec §4). Reuse shared building blocks rather than restyling per screen.

Phase-specific:

- The commit trailer names the model that authored the commit, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The commit commands below show the Opus line; swap in the authoring model's name.
- **Never run `db:reset`, `db:seed`, `npm run dev` or anything else that writes to the database against `apps/api/data/app.db`.** Tests use in-memory databases. A manual check sets `DATABASE_PATH=./data/check.db` (or the perf recipe's `./data/perf.db`) on the command line, which takes precedence over `apps/api/.env`, and deletes `apps/api/data/check.db*` / `perf.db*` afterwards. Resetting the owner's `app.db` is not part of any task here; it happens afterwards, outside this plan, once the owner confirms.
- The wording rule above applies to test names, seed comments and the README too.
- `employees.deactivated_on` keeps exactly that column name (Drizzle field `deactivatedOn`, ISO `yyyy-mm-dd` text, nullable): phase 4's payroll snapshots read it. It means "inactive from this day": a payroll on date D counts the person when `deactivated_on` is null or later than D.
- The seed keeps `seed(db, { rngSeed, referenceDate, employeeCount? })`. Every random draw comes from its seeded `createRng`, every date is an offset from `referenceDate`, there is no `Date.now()` or `Math.random()`, and every write goes through `createEmployees`, `applySalaryChanges`, `insertSalaryRevisionBatch` and `markEmployeesInactive`. The test "produces identical database content for the same RNG seed and reference date" must keep passing after every seed task.
- Seed knobs carry the values this plan gives. If a proportion test only passes after tuning one, stay inside the range this plan names for it, and update the figure in `docs/architecture.md` §6 and in the "Seed realism" decision in the same commit.
- Every figure that converts currency or divides money comes from the API: per-row `amountBaseMinor` and the whole `historySummary`. The History tab only picks `amountMinor` or `amountBaseMinor` per row, filters rows by date, does calendar arithmetic on dates, and formats.
- Test commands use `npm test -w @acme/api -- <file filter>` or `npm test -w @acme/web -- <file filter>`; "PASS" means Vitest reports every selected file passed.
- UI copy in this plan is exact (labels, messages, aria-labels). Tests query by it.

## Review Focus

1. **An employee with only the hire row** (hired last week): the History tab reads "Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since.", the figures read "—", the chart is a flat line from the hire date with "No salary changes in this period.", and nothing divides by zero. Tests added in Tasks 8 and 9.
2. **A relocated employee** (paid in ₹, then in $): the summary line and the chart are in USD with the note "Shown in USD because this salary moved between currencies. FX rates as of …", the biggest jump is compared in USD, and the change list keeps each row's own currency. Tests added in Tasks 8 and 9.
3. **A range with no change inside it** (3Y when the last change was four years ago): the chart shows a flat line at the pay in force when the range starts, and "No salary changes in this period.", never an empty plot. Tests added in Task 9.
4. **A range longer than the employment** (hired in May 2024, 10Y chosen): the chart starts on the hire date with no point before it, the same as All. Test added in Task 9.
5. **Deactivate, reactivate, deactivate again** (and deactivating someone already inactive): the first deactivation records its date, a second one while inactive keeps it, reactivating clears it, and the later deactivation records the new date. Test added in Task 2.

---

## File structure

API (`apps/api`):
- `src/db/schema.ts` (modify): `deactivatedOn`.
- `drizzle/0002_*.sql`, `drizzle/meta/0002_snapshot.json`, `drizzle/meta/_journal.json` (generated by `npm run db:generate -w @acme/api`).
- `src/db/reset.ts` (create) + test: `resetDatabase`.
- `src/db/seed-cli.ts` (modify): `--reset`. `package.json` (modify): `db:reset` script.
- `src/db/seed-config.ts` (create): reference data and generation knobs moved out of `seed.ts`.
- `src/db/seed.ts`, `src/db/seed.test.ts` (modify): the seed patterns and their tests.
- `src/repositories/employees.ts` (modify): `setEmployeeStatus`, `markEmployeesInactive`. `src/repositories/users.ts` (modify): `listUsers`, `insertUsers`.
- `src/services/employees.ts` (modify): deactivate/reactivate dates.
- `src/domain/history-summary.ts` (create) + test: `summariseHistory`.
- `src/services/employee-detail.ts` (modify): `deactivatedOn`, `amountBaseMinor`, `historySummary`, a `today` parameter. `src/routes/employees.ts` (modify): passes `today`.
- `src/perf/measure-latency.ts` (modify): the employee detail case.

Shared (`packages/shared/src`): `employees.ts`, `index.ts` (modify).

Web (`apps/web/src`):
- `features/employees/history-chart.ts` (create) + test: range dates, chart points, labels, summary and time-since wording.
- `features/employees/salary-history-chart.tsx` (create): the Recharts step chart and its key.
- `features/employees/salary-history-tab.tsx` (create): summary line, range control, chart, figures, change list.
- `features/employees/employee-detail.tsx`, `employee-detail.test.tsx` (modify).
- `test/fixtures.ts` (modify): `employeeDetail()` gains the new fields.

Docs: `docs/design.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/decisions.md` (Task 1), `README.md` (Tasks 3 and 10), `docs/performance.md` (Task 10).

---

### Task 1: Product docs for the deactivation date, the reset command, the fuller seed and the history chart

**Files:**
- Modify: `docs/design.md` (§5 "Drawers" → "History tab"), `docs/requirements.md` (FR-2, FR-12, new FR-13, acceptance rows), `docs/architecture.md` (§2, §6, §7, §8), `docs/decisions.md`

**Interfaces:**
- Produces: the binding text for Tasks 2–10. Names fixed here: column `deactivated_on`; command `npm run db:reset -w @acme/api`; detail fields `deactivatedOn`, `history[].amountBaseMinor`, `historySummary { currencyCode, convertedToUsd, hireAmountMinor, currentAmountMinor, sinceHireBp, averageYearlyGrowthBp, biggestJump, promotionCount, raiseCount }`; ranges `3Y / 5Y / 10Y / All` (default All); compression groups India L2, India L3, US L2.

- [ ] **Step 1: Update `docs/design.md`**

§5 "Drawers": replace the "History tab" sub-bullet with:

- **History tab**, top to bottom:
  - A summary line for the whole history: "₹45,00,000.00 → ₹50,00,000.00 since hire (+11.11%)", and under it "0 promotions · 1 raise". With only the hire row: "Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since." and no counts.
  - A segmented control labelled "Range": 3Y | 5Y | 10Y | All, default All. A range ends today, or on the deactivation date for an inactive employee, and never starts before the hire date, so for someone hired two years ago 3Y, 5Y, 10Y and All draw the same chart.
  - A step chart of pay over time, 200px tall at every width: the line in `accent` steps at each change and runs flat to the end of the range; each change is a dot coloured by reason (Hire `text-primary`, Raise `positive`, Promotion `series-promotion`, Relocation `text-secondary`, Correction `warning`), with a key listing the reasons shown. Each promotion is labelled with its new level and % jump ("L4 +15%") in `series-promotion`. A tooltip gives the date, the amount and the reason. When no change falls inside the range, the line is flat at the pay in force and the chart reads "No salary changes in this period."
  - When the pay has been in more than one currency (after a relocation), the summary line and the chart are in USD at the static FX rates, with the note "Shown in USD because this salary moved between currencies. FX rates as of <date>." The change list keeps each row's own currency.
  - Three figures under the chart, for the whole history: Average yearly growth (compound, from the hire date to today or the deactivation date; "—" with only the hire row or under a year of history), Biggest jump ("+15% · Promotion, 1 Apr 2023"; "—" when pay has never gone up), Last change ("1 year, 6 months ago").
  - The full change list, newest first, with the % change on every row after the hire, and bulk revisions marked "Bulk revision".

- [ ] **Step 2: Update `docs/requirements.md`**

- FR-2: append "Deactivating records the date it happened; reactivating clears it."
- FR-12: replace "so the salary-changes view always has realistic data spread across the full 5-year window, including a yearly company-wide increment cycle recorded as bulk revisions." with "so every view has realistic data across the full 10-year span: a yearly company-wide increment cycle recorded as bulk revisions from the earliest hire onward, individual raises, promotions of 10–20% and relocations, a few people whose raises stopped more than two years ago, a few country + level groups where recent hires are paid more than long-tenured staff, and leavers deactivated on dates spread over the years."
- Add under "Compensation", after FR-5: "**FR-13**: Show each employee's pay over time since hire as a step chart, with a 3, 5 or 10-year or all-time range, the change since hire, the counts of promotions and raises, average yearly growth, the biggest increase and the time since the last change. An employee whose pay moved between currencies is shown in USD at the static FX rates."
- Acceptance table: FR-2 append "Deactivating on 1 Feb 2026 records that date, deactivating again while inactive keeps it, and reactivating clears it." FR-12 append "3–5% of active employees have had no raise or promotion for over two years; every promotion raises pay by 10–20%; recent hires out-earn long-tenured peers in each planted country + level group and in at most five groups in all; every inactive employee has a deactivation date after their last salary change." Add an FR-13 row: "For an employee hired at $100,000.00 on 22 Oct 2016 and paid $148,024.43 on 22 Oct 2026, the change since hire is +48.02% and average yearly growth +4%; a relocated employee's summary and chart are in USD; an employee with only the hire row has no growth figures."

- [ ] **Step 3: Update `docs/architecture.md`**

- §2 `employees` row: add `deactivated_on` (date, nullable) to the columns, and to the notes: "`deactivated_on` is the day the employee became inactive (null while active), set and cleared only by deactivate/reactivate; a payroll on date D counts someone whose `deactivated_on` is null or later than D. No index: the reads that use it scan every employee."
- §6: replace the "Hire dates are spread…" bullet with these bullets, and add a reset bullet after "Runs in a single transaction…":
  - Hire dates are spread over the 10 years before `referenceDate`. One company-wide increment cycle runs every year for the whole span (`referenceDate − 60 days` and each 365 days before it, ten in all) as real bulk revisions, one `salary_revision_batches` row per country + department group, a few percent each, for everyone hired at least 180 days before it with no change in the 120 days before it.
  - Individual raises, promotions and relocations fall anywhere from 180 days after hire to the end of employment, at the same density per 5-year stretch as before.
  - Entry pay for a level grows 3% a year while increments average 4.5%, so long-tenured staff are paid above recent hires of the same level, except in three planted compression groups (India L2, India L3, US L2) where people hired in the last 12 months come in 20% above entry pay.
  - A promotion raises pay by 10–20% and goes only to someone paid at or above their level's entry pay at the time (otherwise the change is a raise). India's level steps are about 1.35×, like the other countries', so a promotion lands inside the next level's band.
  - About 4% of active employees, all with 3+ years' tenure, get no change of any kind from a date 2–3 years before `referenceDate`.
  - About 4% of employees leave, each deactivated with a `deactivated_on` date between 90 days after hire and the day before `referenceDate`; their history stops before it.
  - Measured row counts are in `docs/performance.md`.
  - Reset bullet: "`npm run db:reset -w @acme/api` drops every table, applies every migration, restores the `users` rows (same ids and password hashes) and seeds again. It is the way to move an existing database to a new schema or seed; nothing wipes data automatically."
  Keep the "~1-2% of employees get a deliberately out-of-band salary" bullet as it is, and drop "about 40–50k `salary_history` rows in total".
- §7: `GET /api/employees/:id` row → "Employee record + current salary + `deactivatedOn` + full salary history. Each history row carries `changeBp`, the % change from the previous row in basis points (across a relocation, compared in USD at the current static rates), and `amountBaseMinor`, its amount in USD at the current static rates. `historySummary` (from `domain/history-summary.ts`) gives `currencyCode` (local, or USD when the history spans currencies) and `convertedToUsd`, `hireAmountMinor` and `currentAmountMinor` in that currency, `sinceHireBp`, `averageYearlyGrowthBp` (compound, from the hire date to today or the deactivation date; null with one row or under a year), `biggestJump` (the largest increase: `historyId`, `changeBp`, `effectiveDate`, `reason`; null when pay never went up), `promotionCount` and `raiseCount`." `DELETE /api/employees/:id` → "Soft delete: `status: inactive` and `deactivated_on` = today (injected clock); an already inactive employee keeps its date. Never a hard delete." `POST /api/employees/:id/reactivate` → "Sets `status: active` and clears `deactivated_on`".
- §8: after the bulk revision bullet add "The employee drawer's History tab draws a step chart from the detail response: it uses each row's `amountBaseMinor` when `historySummary.convertedToUsd` is true and `amountMinor` otherwise, and filters rows by date for the chosen range. Every converted amount and percentage it shows comes from the API."

- [ ] **Step 4: Update `docs/decisions.md`**

Add four entries (Alternatives considered / Chosen / Why):

1. "Deactivation date: one nullable `deactivated_on`, cleared on reactivation, no backfill" — alternatives: reading it from `updated_at` (it changes on every edit); a status-history table (keeps every leave and return, which no question needs); backfilling existing inactive rows from `updated_at`. Chosen: deactivating sets `deactivated_on` to today from the injected clock; deactivating someone already inactive keeps it; reactivating clears it; existing databases are reset with `npm run db:reset -w @acme/api` rather than backfilled, since every database is demo data. Why: a payroll at a past date needs to know who had left by then, and one date per person answers that; someone who left, came back and left again keeps only the last date, so a past payroll counts them during the gap, which is acceptable for a rare event; a backfill from `updated_at` would write wrong dates into history.
2. "Database reset: an explicit command that keeps the login, never automatic" — alternatives: wiping and re-seeding on boot when the schema or seed changes (silently destroys data); deleting the file (fails while the API holds it open and loses the HR login); upgrading demo data in place (a data migration per seed change). Chosen: `npm run db:reset -w @acme/api` drops every table, migrates, restores the `users` rows with their ids and password hashes, then seeds; stop the API first; the boot-time seed still does nothing once employees exist. Why: nothing is lost by surprise, and because a session carries the user id, keeping the users means the HR login and any open session keep working after a reset.
3. "Seed realism: ten years of history, entry pay that trails increments, 10–20% promotions, skipped raises, compression groups, dated leavers" — alternatives: the earlier seed (increments only in the last five years, so someone hired ten years ago showed flat pay for five; promotions priced at the full gap between level medians, about 50% in India); hand-written fixtures for each pattern. Chosen: the §6 bullets, with the values: ten cycles, 180 days' tenure for a cycle, entry pay +3% a year (`MARKET_GROWTH_BP = 300`) against 4.5% increments, promotions 10–20% only for someone at or above entry pay, India's entry pay by level ₹8.0L / 10.8L / 14.5L / 19.5L / 26L / 35L (steps of about 1.35×), 4% of active employees with no change for the last 2–3 years, compression in India L2, India L3 and US L2 with recent hires 20% above entry pay, 4% leavers with `deactivated_on`. Why: every insight has real people behind it by design, and seed tests assert each proportion; entry pay that trails increments is what makes tenure pay off, so compression appears only where it was planted; with India's steeper steps a 10–20% promotion left every promotee below the new level's fences and the outliers list filled with promotions.
4. "Salary history chart: ranges zoom the chart, figures cover the whole history, USD after a currency change" — alternatives: figures per range (four server summaries, or division in the browser); a 3Y default like recent changes; one line per currency. Chosen: 3Y / 5Y / 10Y / All, default All, change only the chart's window, which ends today (or on the deactivation date) and never starts before the hire date; the summary line and figures cover the whole history and come from `domain/`; average yearly growth is compound (`(current ÷ hire)^(365.25 ÷ days) − 1`, rounded half away from zero to a basis point, null under 365 days); the biggest jump is the largest increase, earliest on a tie; after a relocation the summary and chart are in USD at the current static rates, as the per-row % already is (see "History % change"). Why: one person's history is a couple of dozen rows, so the whole story is the useful default and a range is just a closer look; compound growth is the figure that reads as "a year" across uneven gaps; plotting two currencies on one axis would show the exchange rate, not the pay.

- [ ] **Step 5: Check wording and formatting**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run format:check`, and reread every added line against the wording rule in the Global Constraints.
Expected: Prettier reports all files formatted; no added line breaks the wording rule.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add docs/design.md docs/requirements.md docs/architecture.md docs/decisions.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "docs: describe the history chart, the deactivation date, the reset command and the fuller seed" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Record the deactivation date

**Files:**
- Modify: `apps/api/src/db/schema.ts`, `apps/api/src/repositories/employees.ts`, `apps/api/src/services/employees.ts`, `apps/api/src/services/employee-detail.ts`, `packages/shared/src/employees.ts`, `apps/web/src/test/fixtures.ts`
- Generate: `apps/api/drizzle/0002_*.sql`, `apps/api/drizzle/meta/0002_snapshot.json`, `apps/api/drizzle/meta/_journal.json`
- Test: `apps/api/src/services/employees.test.ts`, `apps/api/src/routes/employees.test.ts`

**Interfaces:**
- Produces (schema): `employees.deactivatedOn: text('deactivated_on')` (nullable, no default, no index), declared after `status`.
- Produces (repository): `setEmployeeStatus(db: DbHandle, id: number, status: EmployeeStatus, deactivatedOn: string | null, updatedAt: string): void` (replaces the four-argument form).
- Produces (service): `deactivateEmployee` writes `status: 'inactive'`, `deactivatedOn: deps.now().slice(0, 10)` unless the employee is already inactive, in which case it writes nothing; `reactivateEmployee` writes `status: 'active'`, `deactivatedOn: null`.
- Produces (shared): `employeeDetailSchema = employeeListItemSchema.extend({ deactivatedOn: z.string().nullable(), history: … })`. The list item does not change.
- Produces (web fixture): `employeeDetail()` returns `deactivatedOn: null`.

- [ ] **Step 1: Write the failing tests**

In `services/employees.test.ts`, under `describe('deactivateEmployee and reactivateEmployee')`:

```ts
const at = (iso: string) => ({ now: () => iso });
const deactivatedOn = (id: number) =>
  database.db.select().from(employees).where(eq(employees.id, id)).get()?.deactivatedOn;

it('records the deactivation date from the clock and clears it on reactivation', () => {
  const id = createEmployee(database.db, input(), deps);
  expect(deactivatedOn(id)).toBeNull();
  deactivateEmployee(database.db, id, at('2026-02-01T09:00:00.000Z'));
  expect(deactivatedOn(id)).toBe('2026-02-01');
  reactivateEmployee(database.db, id, at('2026-03-01T09:00:00.000Z'));
  expect(deactivatedOn(id)).toBeNull();
});

// Review Focus 5
it('keeps the first date when an inactive employee is deactivated again, and records a new one after reactivating', () => {
  const id = createEmployee(database.db, input(), deps);
  deactivateEmployee(database.db, id, at('2026-02-01T09:00:00.000Z'));
  deactivateEmployee(database.db, id, at('2026-02-10T09:00:00.000Z'));
  expect(deactivatedOn(id)).toBe('2026-02-01');
  reactivateEmployee(database.db, id, at('2026-03-01T09:00:00.000Z'));
  deactivateEmployee(database.db, id, at('2026-04-15T09:00:00.000Z'));
  expect(deactivatedOn(id)).toBe('2026-04-15');
});
```

In `routes/employees.test.ts`, let `setup(options: { now?: () => Date } = {})` pass `options` to `createTestApp`, and add to `describe('DELETE /api/employees/:id and POST /api/employees/:id/reactivate')`:

```ts
it('returns the deactivation date with the employee and clears it on reactivation', async () => {
  const t = await setup({ now: () => new Date('2026-02-01T09:00:00.000Z') });
  const deactivated = await send(t, 'DELETE', '/api/employees/1');
  expect(deactivated.json<{ deactivatedOn: string | null }>().deactivatedOn).toBe('2026-02-01');
  const reactivated = await send(t, 'POST', '/api/employees/1/reactivate');
  expect(reactivated.json<{ deactivatedOn: string | null }>().deactivatedOn).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- services/employees routes/employees`
Expected: FAIL (`deactivatedOn` is undefined).

- [ ] **Step 3: Add the column and generate the migration**

Add `deactivatedOn` to `schema.ts` (with a one-line comment: the day the employee became inactive; null while active). Then run:

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run db:generate -w @acme/api && cat apps/api/drizzle/0002_*.sql`
Expected: a new `0002_<name>.sql` containing only ``ALTER TABLE `employees` ADD `deactivated_on` text;``, plus `meta/0002_snapshot.json` and a third `_journal.json` entry. Nothing else in `drizzle/` changes.

- [ ] **Step 4: Implement the repository, services, detail field and schema**

`requireEmployee` returns the `Employee` it found so `deactivateEmployee` can see the current status. `getEmployeeDetail` adds `deactivatedOn: row.deactivatedOn`. Add `deactivatedOn: null` to `employeeDetail()` in `apps/web/src/test/fixtures.ts`.

- [ ] **Step 5: Run to verify pass, then all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- services/employees routes/employees`
Expected: PASS.

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src apps/api/drizzle packages/shared/src apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): record the date an employee is deactivated" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Database reset command

**Files:**
- Create: `apps/api/src/db/reset.ts`, `apps/api/src/db/reset.test.ts`
- Modify: `apps/api/src/repositories/users.ts`, `apps/api/src/db/seed-cli.ts`, `apps/api/package.json`, `README.md`

**Interfaces:**
- Consumes: `bootstrapDatabase`, `BootstrapOptions`, `BootstrapResult` (`db/bootstrap.ts`); `migrate` (`drizzle-orm/better-sqlite3/migrator`); `login`, `getUser` (`services/auth.ts`).
- Produces (repository): `listUsers(db: DbHandle): User[]` (by id); `insertUsers(db: DbHandle, rows: User[]): void` (ids kept; no-op for an empty array).
- Produces (db): `resetDatabase(db: Db, options: BootstrapOptions): Promise<BootstrapResult>`.
- Produces (CLI): `seed-cli.ts --reset` calls `resetDatabase` instead of `bootstrapDatabase` and first prints `Resetting the database at <DATABASE_PATH>.`; script `"db:reset": "tsx --env-file-if-exists=.env src/db/seed-cli.ts --reset"`.

- [ ] **Step 1: Write the failing tests**

`db/reset.test.ts` (same `options`, `hrUser` and `loginDeps` as `bootstrap.test.ts`; `dump(db)` = JSON of employees, salary history and batches ordered by id, as in `seed.test.ts`):

```ts
it('replaces every employee and salary row with a fresh seed', async () => {
  const { db } = createDatabase(':memory:');
  await bootstrapDatabase(db, { ...options, hrUser });
  createEmployees(db, [{ firstName: 'Extra', lastName: 'Person', email: 'extra@acme.test', countryCode: 'US', departmentId: 1, levelId: 1, jobTitle: 'Engineer', hireDate: '2026-01-05', amountMinor: 9_000_000 }], { now: options.now });
  deactivateEmployee(db, 1, { now: options.now });

  const result = await resetDatabase(db, { ...options, hrUser });

  const fresh = createDatabase(':memory:').db;
  await bootstrapDatabase(fresh, { ...options, hrUser });
  expect(result.seed).toMatchObject({ skipped: false, employees: 50 });
  expect(dump(db)).toBe(dump(fresh));
});

it('keeps the HR login, its password and its id, so a signed-in session stays valid', async () => {
  const { db } = createDatabase(':memory:');
  await bootstrapDatabase(db, { ...options, hrUser });
  const session = (await login(db, hrUser, loginDeps))!; // { token, user }

  const result = await resetDatabase(db, { ...options, hrUser: { email: 'other@acme.test', password: 'another password' } });

  expect(result.hrUser).toBe('exists');
  expect(await login(db, hrUser, loginDeps)).not.toBeNull();
  expect(await login(db, { email: 'other@acme.test', password: 'another password' }, loginDeps)).toBeNull();
  const verified = await verifySessionToken(session.token, loginDeps.jwtSecret, loginDeps.clock());
  expect(verified?.userId).toBe(session.user.id);
  expect(getUser(db, verified!.userId)?.email).toBe('hr@acme.test');
});

it('sets up a database that has never been migrated', async () => {
  const { db } = createDatabase(':memory:');
  const result = await resetDatabase(db, { ...options, hrUser });
  expect(result).toMatchObject({ seed: { skipped: false, employees: 50 }, hrUser: 'created' });
});
```

(`login` returns `{ token, user } | null`; `verifySessionToken` and `getUser` are exported from `services/auth.ts`.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/reset`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `resetDatabase` in `db/reset.ts`**

```ts
// 1. tables = db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' and name not like 'sqlite_%'`)
// 2. kept = tables.some((t) => t.name === 'users') ? listUsers(db) : []
// 3. db.run(sql`pragma foreign_keys = off`); try { db.transaction((tx) => tables.forEach(({ name }) => tx.run(sql.raw(`drop table "${name}"`)))) } finally { db.run(sql`pragma foreign_keys = on`) }
//    (this drops Drizzle's __drizzle_migrations too, so every migration applies again)
// 4. migrate(db, { migrationsFolder: options.migrationsFolder })
// 5. insertUsers(db, kept)
// 6. return bootstrapDatabase(db, options)   // seeds (no employees) and finds the HR user ('exists')
```

A comment above it says why the users are kept (the login and open sessions survive) and that the API must not be running.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/reset db/bootstrap`
Expected: PASS.

- [ ] **Step 5: Add the CLI flag, the script and the README note**

`seed-cli.ts`: `const reset = process.argv.includes('--reset')`; print the reset line, then call `resetDatabase` or `bootstrapDatabase` with the same options; the existing result lines stay. `package.json`: the `db:reset` script above.

README: add rows `npm run db:seed -w @acme/api` ("Migrate and seed an empty database, without starting the server") and `npm run db:reset -w @acme/api` ("Drop all data, migrate and seed again, keeping the HR login") to the Commands table, and after the "Setup and run" paragraph:

"**Starting over.** `npm run db:reset -w @acme/api` drops every table, applies the migrations and seeds a fresh dataset, keeping the HR login (its email, password and any open session). Stop the API first. Run it after pulling a change to the schema or the seed: nothing wipes the database automatically, and the start-up seed does nothing once employees exist. With Docker, remove the volume instead (`docker volume rm salary-data`) and start the container again."

- [ ] **Step 6: Check the command on a scratch database**

Run (never against `app.db`; the command-line `DATABASE_PATH` takes precedence over `.env`):

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && mkdir -p apps/api/data && rm -f apps/api/data/check.db* && DATABASE_PATH=./data/check.db SEED_RNG_SEED=42 SEED_REFERENCE_DATE=2026-10-22 HR_SEED_EMAIL=check@acme.test HR_SEED_PASSWORD=check-password npm run db:seed -w @acme/api && DATABASE_PATH=./data/check.db SEED_RNG_SEED=42 SEED_REFERENCE_DATE=2026-10-22 HR_SEED_EMAIL=check@acme.test HR_SEED_PASSWORD=check-password npm run db:reset -w @acme/api; rm -f apps/api/data/check.db*
```
Expected: the seed prints "Seeded 10000 employees …" and "Created the HR user."; the reset prints "Resetting the database at …/apps/api/data/check.db.", the same "Seeded 10000 employees, N salary history rows and M revision batches …" counts, and "HR user already exists; left unchanged."; `ls apps/api/data` then shows no `check.db*`.

- [ ] **Step 7: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src apps/api/package.json README.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add a database reset command that keeps the HR login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Seed ten years of increments and individual changes from each hire date

**Files:**
- Create: `apps/api/src/db/seed-config.ts`
- Modify: `apps/api/src/db/seed.ts`, `apps/api/src/db/seed.test.ts`

**Interfaces:**
- Produces (`seed-config.ts`, moved from `seed.ts` and exported): `COUNTRIES`, `DEPARTMENTS`, `LEVELS`, `FX_AS_OF_DATE`, `FX_RATES`, `ENTRY_PAY_MAJOR` (renamed from `MEDIAN_PAY_MAJOR`: "a new hire's annual pay in whole major units at each level today"), and the knobs. Changed or new knob values:
  - `CYCLE_COUNT = 10`
  - `MIN_TENURE_FOR_CYCLE_DAYS = 180` (was 365, so the earliest cycle has people in it)
  - `EVENT_BLOCK_DAYS = 1825` (replaces `CHANGE_WINDOW_DAYS`)
  - `MARKET_GROWTH_BP = 300` (tunable 200–350): entry pay grows this much a year
  - unchanged: `HIRE_SPAN_DAYS = 3650`, `FIRST_CYCLE_DAYS_BEFORE_REFERENCE = 60`, `MIN_QUIET_DAYS_BEFORE_CYCLE = 120`, `MIN_TENURE_FOR_CHANGE_DAYS = 180`, `MEAN_CYCLE_BP = 450`, `PAY_SIGMA = 0.12` (tunable 0.10–0.14), `OUTLIER_SHARE = 0.011`, the event weights.
- Produces (`seed.ts`): `entryPayMinor(countryCode: string, currencyCode: string, rank: number): number` (renamed from `medianPayMinor`; the relocation re-benchmark keeps using it as a ratio).
- `seed()` keeps its signature and `SeedResult`.

- [ ] **Step 1: Write the failing tests**

In `seed.test.ts`, replace `runs one increment cycle per year over the last five years`, `has salary changes in both the last three years and years three to five` and `only gives a bulk revision to employees hired before its effective date` with:

```ts
it('runs one increment cycle a year for the last ten years', () => {
  const dates = [...new Set(small.db.select().from(salaryRevisionBatches).all().map((b) => b.effectiveDate))].sort();
  expect(dates).toEqual([
    '2017-05-03', '2018-05-03', '2019-05-03', '2020-05-02', '2021-05-02',
    '2022-05-02', '2023-05-02', '2024-05-01', '2025-05-01', '2026-05-01',
  ]);
});

it('has salary changes in every one of the last ten years', () => {
  const ages = small.db.select().from(salaryHistory).all()
    .filter((r) => r.reason !== 'hire')
    .map((r) => daysBetween(r.effectiveDate, REFERENCE_DATE));
  for (let year = 0; year < 10; year++) {
    expect(ages.some((age) => age > year * 365 && age <= (year + 1) * 365)).toBe(true);
  }
});

it('only gives a bulk revision to employees hired at least 180 days before it', () => {
  // as the old test, asserting daysBetween(hireDate, row.effectiveDate) >= 180 for every batch row
});

it('gives individual changes to people in their early years, not only in the last five', () => {
  const old = small.db.select().from(salaryHistory).all()
    .filter((r) => r.batchId === null && r.reason !== 'hire' && daysBetween(r.effectiveDate, REFERENCE_DATE) > 5 * 365);
  expect(old.length).toBeGreaterThan(0);
});
```

Move the 2,000-employee seed of `puts between 1% and 2.5% …` into a shared `large` fixture (`beforeAll(() => { large = seeded({ employeeCount: 2000 }); })`) for this and the later pattern tests.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: FAIL (five cycle dates; no change older than five years).

- [ ] **Step 3: Implement**

- Move the reference data and knobs to `seed-config.ts`; `seed.ts` imports them. Update the `seed()` doc comment ("then ten years of salary history").
- Cycle dates: `CYCLE_COUNT` dates, `referenceDate − (60 + 365k)` days, as today.
- Hire pay replaces the per-cycle discount with market growth:
  `major = ENTRY_PAY_MAJOR[country][rank − 1] × payFactor × exp(PAY_SIGMA × z) × (1 + MARKET_GROWTH_BP / 10_000) ** −(daysBetween(hireDate, referenceDate) / 365)`, then the outlier multiplier as today.
- `planIndividualEvents`: the window is `[hireDate + MIN_TENURE_FOR_CHANGE_DAYS, last day of employment]` with no 5-year cut-off; `blocks = Math.max(1, Math.round(windowDays / EVENT_BLOCK_DAYS))`; the event count is the sum of `blocks` draws from `INDIVIDUAL_EVENT_COUNT_WEIGHTS`; each date is uniform over the whole window.
- If the outlier test fails, tune `OUTLIER_SHARE` first, then `PAY_SIGMA`, within the ranges above.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed db/bootstrap db/reset`
Expected: PASS, including the determinism, current-salary, batch and outlier tests.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src/db docs/architecture.md docs/decisions.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): seed ten years of increments and individual changes from each hire date" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Seed promotions at 10–20% that land in the next level's band

**Files:**
- Modify: `apps/api/src/db/seed-config.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/db/seed.test.ts`

**Interfaces:**
- Consumes: Task 4's config and `entryPayMinor`; `proposedAmount`, `percentChangeBp` (`domain/revision.ts`).
- Produces (config): `ENTRY_PAY_MAJOR.IN = [800_000, 1_080_000, 1_450_000, 1_950_000, 2_600_000, 3_500_000]` (US and DE unchanged); `PROMOTION_UPLIFT_BP = { min: 1000, max: 2000 }`.
- Produces (`seed.ts`): `marketPayMinor(countryCode: string, currencyCode: string, rank: number, departmentPayFactor: number, date: string, referenceDate: string): number` = `entryPayMinor(...) × departmentPayFactor × (1 + MARKET_GROWTH_BP / 10_000) ** −(daysBetween(date, referenceDate) / 365)`, rounded to an integer. `buildIndividualChange(rng, event, context)` takes `context: { currencyOf; levelIdByRank; payFactorByDepartmentId; referenceDate }`.

- [ ] **Step 1: Write the failing tests**

```ts
function promotionUplifts(db: ReturnType<typeof freshDb>): number[] {
  const ordered = db.select().from(salaryHistory).all()
    .sort((a, b) => a.employeeId - b.employeeId || a.effectiveDate.localeCompare(b.effectiveDate) || a.id - b.id);
  return ordered.flatMap((row, i) => {
    const before = ordered[i - 1];
    return row.reason === 'promotion' && before?.employeeId === row.employeeId
      ? [percentChangeBp(before.amountMinor, row.amountMinor)] : [];
  });
}

it('raises pay by 10% to 20% on every promotion', () => {
  const uplifts = promotionUplifts(large.db);
  expect(uplifts.length).toBeGreaterThan(0);
  expect(uplifts.every((bp) => bp >= 1000 && bp <= 2000)).toBe(true);
});

it('promotes between 5% and 25% of employees at some point', () => {
  const promoted = new Set(large.db.select().from(salaryHistory).all().filter((r) => r.reason === 'promotion').map((r) => r.employeeId));
  expect(promoted.size / 2000).toBeGreaterThanOrEqual(0.05);
  expect(promoted.size / 2000).toBeLessThanOrEqual(0.25);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: FAIL (uplifts of about 25–80%).

- [ ] **Step 3: Implement**

A planned promotion applies only when `worker.rank < LEVELS.length` and `worker.amountMinor >= marketPayMinor(country, currency, worker.rank, payFactor, event.date, referenceDate)`; then `amountMinor = proposedAmount(amountMinor, rng.int(PROMOTION_UPLIFT_BP.min, PROMOTION_UPLIFT_BP.max))` and the rank goes up by one. Otherwise the event falls through to the existing individual raise. Update the comment on `ENTRY_PAY_MAJOR` to say why India's steps are about 1.35×.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: PASS, the outlier share still between 1% and 2.5%.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src/db docs/architecture.md docs/decisions.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): seed promotions of 10-20% that land inside the next level's band" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Date each seeded deactivation

**Files:**
- Modify: `apps/api/src/repositories/employees.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/db/seed-config.ts`, `apps/api/src/db/seed.test.ts`

**Interfaces:**
- Produces (repository): `markEmployeesInactive(db: DbHandle, leavers: { id: number; deactivatedOn: string }[], updatedAt: string): void` (one update per leaver; replaces the id-list form and `INACTIVE_UPDATE_CHUNK`).
- Produces (`seed.ts`): `Worker.endDate` becomes `leftOn: string | null`, the day the employee became inactive. A leaver is drawn as today (`rng.float() < INACTIVE_SHARE`) but only when `span = daysBetween(hireDate, referenceDate) > 91`, with `leftOn = addDays(hireDate, rng.int(90, span − 1))`. Their changes are dated strictly before `leftOn`: cycles need `cycleDate < leftOn`, and the event window ends on `addDays(leftOn, −1)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('dates every deactivation after the employee\'s last salary change and before the reference date', () => {
  const lastChange = new Map<number, string>();
  for (const row of small.db.select().from(salaryHistory).all()) {
    if (row.effectiveDate > (lastChange.get(row.employeeId) ?? '')) lastChange.set(row.employeeId, row.effectiveDate);
  }
  for (const e of small.db.select().from(employees).all()) {
    if (e.status === 'active') {
      expect(e.deactivatedOn).toBeNull();
    } else {
      expect(e.deactivatedOn! > lastChange.get(e.id)!).toBe(true);
      expect(e.deactivatedOn! < REFERENCE_DATE).toBe(true);
    }
  }
});

it('marks between 3% and 5% of employees inactive, spread over the years and including the last twelve months', () => {
  const inactive = large.db.select().from(employees).all().filter((e) => e.status === 'inactive');
  expect(inactive.length / 2000).toBeGreaterThanOrEqual(0.03);
  expect(inactive.length / 2000).toBeLessThanOrEqual(0.05);
  expect(new Set(inactive.map((e) => e.deactivatedOn!.slice(0, 4))).size).toBeGreaterThanOrEqual(5);
  expect(inactive.some((e) => daysBetween(e.deactivatedOn!, REFERENCE_DATE) <= 365)).toBe(true);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: FAIL (`deactivatedOn` is null for every leaver).

- [ ] **Step 3: Implement**

Rename `endDate` to `leftOn` through `seed.ts`; at the end call `markEmployeesInactive(tx, leavers.map((w) => ({ id: w.id, deactivatedOn: w.leftOn! })), now())`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): date each seeded deactivation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Seed skipped raises and pay compression groups

**Files:**
- Modify: `apps/api/src/db/seed-config.ts`, `apps/api/src/db/seed.ts`, `apps/api/src/db/seed.test.ts`

**Interfaces:**
- Consumes: Task 6's `leftOn`; `computeDistribution` (`domain/stats.ts`) in the test.
- Produces (config):
  - `SKIPPED_RAISE_SHARE = 0.04` (of active employees), `SKIP_MIN_TENURE_DAYS = 1100`, `SKIP_START_DAYS = { min: 760, max: 1095 }` (days before the reference date when the pause starts).
  - `COMPRESSION_GROUPS = [{ countryCode: 'IN', rank: 2 }, { countryCode: 'IN', rank: 3 }, { countryCode: 'US', rank: 2 }] as const`, `RECENT_HIRE_DAYS = 365`, `COMPRESSION_PREMIUM = 1.2` (tunable 1.15–1.3).
- Produces (`seed.ts`): `Worker.pausedFrom: string | null`; `createRng` gains `sample<T>(items: readonly T[], count: number): T[]` (`faker.helpers.arrayElements`).

- [ ] **Step 1: Write the failing tests**

```ts
const shiftDays = (date: string, days: number) => new Date(Date.parse(date) + days * 86_400_000).toISOString().slice(0, 10);

it('leaves 3% to 5% of active employees without a raise or promotion for over two years', () => {
  const twoYearsAgo = shiftDays(REFERENCE_DATE, -730);
  const active = large.db.select().from(employees).all().filter((e) => e.status === 'active');
  const increased = new Set(large.db.select().from(salaryHistory).all()
    .filter((r) => (r.reason === 'raise' || r.reason === 'promotion') && r.effectiveDate > twoYearsAgo)
    .map((r) => r.employeeId));
  const stalled = active.filter((e) => e.hireDate <= twoYearsAgo && !increased.has(e.id));
  expect(stalled.length / active.length).toBeGreaterThanOrEqual(0.03);
  expect(stalled.length / active.length).toBeLessThanOrEqual(0.05);
});

it('pays recent hires above long-tenured staff in each planted group and in at most five groups in all', () => {
  const levelCode = new Map(large.db.select().from(levels).all().map((l) => [l.id, l.code]));
  const recentFrom = shiftDays(REFERENCE_DATE, -365);
  const tenuredTo = shiftDays(REFERENCE_DATE, -1095);
  const groups = new Map<string, { recent: number[]; tenured: number[] }>();
  for (const e of large.db.select().from(employees).all().filter((x) => x.status === 'active')) {
    const key = `${e.countryCode} ${levelCode.get(e.levelId)}`;
    const group = groups.get(key) ?? { recent: [], tenured: [] };
    if (e.hireDate > recentFrom) group.recent.push(e.currentAmountMinor);
    if (e.hireDate <= tenuredTo) group.tenured.push(e.currentAmountMinor);
    groups.set(key, group);
  }
  const compressed = [...groups].filter(([, g]) => g.recent.length >= 5 && g.tenured.length >= 5
    && computeDistribution(g.recent).median > computeDistribution(g.tenured).median).map(([key]) => key);
  expect(compressed).toEqual(expect.arrayContaining(['IN L2', 'IN L3', 'US L2']));
  expect(compressed.length).toBeLessThanOrEqual(5);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: FAIL (almost no one stalled; the planted groups are not compressed).

- [ ] **Step 3: Implement**

- Compression: in the hire loop, a hire in a `COMPRESSION_GROUPS` country + rank with `daysBetween(hireDate, referenceDate) <= RECENT_HIRE_DAYS` has `major *= COMPRESSION_PREMIUM` (before the outlier multiplier).
- Skipped raises, after every worker exists and before events are planned: `candidates` = workers with `leftOn === null` and `daysBetween(hireDate, referenceDate) >= SKIP_MIN_TENURE_DAYS`; pick `Math.round(SKIPPED_RAISE_SHARE × activeCount)` with `rng.sample`, sort them by id, and give each `pausedFrom = addDays(referenceDate, −rng.int(SKIP_START_DAYS.min, SKIP_START_DAYS.max))`. A paused worker is left out of every cycle dated on or after `pausedFrom`, and `buildIndividualChange` returns `null` for any event dated on or after it, before changing the worker's state.
- If a planted group is not compressed, raise `COMPRESSION_PREMIUM` within its range; if more than five groups are, lower `MARKET_GROWTH_BP` within its range (a wider gap between increments and entry pay). The outlier test must still pass.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- db/seed`
Expected: PASS, every earlier seed test included.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src/db docs/architecture.md docs/decisions.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): seed skipped raises and pay compression groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Summarise each employee's salary history in the detail response

**Files:**
- Create: `apps/api/src/domain/history-summary.ts`, `apps/api/src/domain/history-summary.test.ts`
- Modify: `apps/api/src/services/employee-detail.ts`, `apps/api/src/routes/employees.ts`, `packages/shared/src/employees.ts`, `packages/shared/src/index.ts`, `apps/web/src/test/fixtures.ts`
- Test: `apps/api/src/services/employee-detail.test.ts`, `apps/api/src/routes/employees.test.ts`

**Interfaces:**
- Consumes: `historyChangeBp` (`domain/history-change.ts`); `convert`, `BASE_CURRENCY`, `FxRates`; `percentChangeBpOrNull`; `selectCurrentRow`; `loadLatestFxRates`.
- Produces (domain):
  ```ts
  export interface HistorySummaryRow<R extends string = string> { id: number; effectiveDate: string; amountMinor: number; currencyCode: string; reason: R }
  export interface HistorySummaryFigures<R extends string = string> {
    currencyCode: string;              // the rows' currency, or USD when they span more than one
    convertedToUsd: boolean;
    hireAmountMinor: number;           // first row (by date, then id), in currencyCode
    currentAmountMinor: number;        // current row (selectCurrentRow), in currencyCode
    sinceHireBp: number | null;        // null with one row
    averageYearlyGrowthBp: number | null;
    biggestJump: { historyId: number; changeBp: number; effectiveDate: string; reason: R } | null;
    promotionCount: number;
    raiseCount: number;
  }
  export function summariseHistory<R extends string>(rows: HistorySummaryRow<R>[], rates: FxRates, endDate: string): HistorySummaryFigures<R>;
  ```
  Average yearly growth: with two or more rows, a positive hire amount and `days = daysBetween(firstDate, endDate) >= 365`, `((current / hire) ** (365.25 / days) − 1) × 10_000` rounded half away from zero (`Math.sign(x) * Math.round(Math.abs(x))`); otherwise null. Biggest jump: the row with the largest positive `historyChangeBp`, the earliest (by date, then id) on a tie; null when none is positive. Throws for no rows.
- Produces (shared): `salaryHistoryEntrySchema` adds `amountBaseMinor: z.number().int()`; `historySummarySchema` (the figures with `reason` as the reason enum) and type `HistorySummary`; `employeeDetailSchema` adds `historySummary: historySummarySchema`. Export both from `index.ts`.
- Produces (service): `getEmployeeDetail(db: DbHandle, id: number, today: string)`; `amountBaseMinor = convert(row.amountMinor, row.currencyCode, BASE_CURRENCY, rates)`; `historySummary = summariseHistory(history, rates, row.deactivatedOn ?? today)`. Every route that returns the detail passes `now().toISOString().slice(0, 10)`.
- Produces (web fixture): `employeeDetail()` history rows gain `amountBaseMinor` (`5_990_000` for id 2, `5_391_000` for id 1) and `historySummary: { currencyCode: 'INR', convertedToUsd: false, hireAmountMinor: 450_000_000, currentAmountMinor: 500_000_000, sinceHireBp: 1111, averageYearlyGrowthBp: 193, biggestJump: { historyId: 2, changeBp: 1111, effectiveDate: '2025-04-01', reason: 'raise' }, promotionCount: 0, raiseCount: 1 }`.

- [ ] **Step 1: Write the failing domain tests**

```ts
const rates = { INR: 11_980_000, EUR: 1_080_000_000 };
const usd = (id: number, effectiveDate: string, amountMinor: number, reason: string) => ({ id, effectiveDate, amountMinor, currencyCode: 'USD', reason });
const career = [
  usd(1, '2016-10-22', 10_000_000, 'hire'), usd(2, '2018-04-01', 10_500_000, 'raise'),
  usd(3, '2020-04-01', 12_075_000, 'promotion'), usd(4, '2022-04-01', 12_678_750, 'raise'),
  usd(5, '2024-04-01', 13_312_688, 'raise'), usd(6, '2025-04-01', 14_802_443, 'raise'),
];

it('gives the change since hire, compound yearly growth, the biggest jump and the counts', () => {
  expect(summariseHistory(career, rates, '2026-10-22')).toEqual({
    currencyCode: 'USD', convertedToUsd: false, hireAmountMinor: 10_000_000, currentAmountMinor: 14_802_443,
    sinceHireBp: 4802, averageYearlyGrowthBp: 400,
    biggestJump: { historyId: 3, changeBp: 1500, effectiveDate: '2020-04-01', reason: 'promotion' },
    promotionCount: 1, raiseCount: 4,
  });
});

it('measures yearly growth up to the end date it is given', () => {
  expect(summariseHistory(career, rates, '2024-10-22').averageYearlyGrowthBp).toBe(502);
});

// Review Focus 2
it('works in USD at the given rates when the pay moved between currencies', () => {
  const moved = [
    { id: 1, effectiveDate: '2020-01-01', amountMinor: 100_000_000, currencyCode: 'INR', reason: 'hire' },
    { id: 2, effectiveDate: '2023-01-01', amountMinor: 6_000_000, currencyCode: 'USD', reason: 'relocation' },
  ];
  expect(summariseHistory(moved, rates, '2026-10-22')).toEqual({
    currencyCode: 'USD', convertedToUsd: true, hireAmountMinor: 1_198_000, currentAmountMinor: 6_000_000,
    sinceHireBp: 40083, averageYearlyGrowthBp: 2671,
    biggestJump: { historyId: 2, changeBp: 40083, effectiveDate: '2023-01-01', reason: 'relocation' },
    promotionCount: 0, raiseCount: 0,
  });
});

// Review Focus 1
it('has no growth figures for an employee with only the hire row', () => {
  expect(summariseHistory([usd(1, '2026-10-15', 9_000_000, 'hire')], rates, '2026-10-22')).toEqual({
    currencyCode: 'USD', convertedToUsd: false, hireAmountMinor: 9_000_000, currentAmountMinor: 9_000_000,
    sinceHireBp: null, averageYearlyGrowthBp: null, biggestJump: null, promotionCount: 0, raiseCount: 0,
  });
});

it('has no yearly growth under a year of history', () => {
  const short = [usd(1, '2026-01-01', 10_000_000, 'hire'), usd(2, '2026-06-01', 10_500_000, 'raise')];
  expect(summariseHistory(short, rates, '2026-10-22')).toMatchObject({ sinceHireBp: 500, averageYearlyGrowthBp: null });
});

it('picks the earliest of two equal increases and ignores a correction downwards', () => {
  const rows = [usd(1, '2020-01-01', 10_000_000, 'hire'), usd(2, '2021-01-01', 10_500_000, 'raise'),
    usd(3, '2022-01-01', 9_975_000, 'correction'), usd(4, '2023-01-01', 10_473_750, 'raise')];
  expect(summariseHistory(rows, rates, '2026-10-22').biggestJump).toMatchObject({ historyId: 2, changeBp: 500 });
  expect(summariseHistory([rows[0]!, { ...rows[2]!, id: 2 }], rates, '2026-10-22').biggestJump).toBeNull();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/history-summary`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `summariseHistory` in `domain/history-summary.ts`; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/history-summary`
Expected: PASS.

- [ ] **Step 4: Write the failing service and route tests**

`services/employee-detail.test.ts` (existing calls gain `'2026-03-01'` as `today`):

```ts
it('gives each history row its amount in USD and summarises the history up to today', () => {
  const id = addAsha();
  applySalaryChanges(database.db, [{ employeeId: id, reason: 'raise', amountMinor: 525_000_000, currencyCode: 'INR', effectiveDate: '2022-04-01' }], deps);
  const detail = getEmployeeDetail(database.db, id, '2026-03-01');
  expect(detail.history.map((h) => h.amountBaseMinor)).toEqual([6_289_500, 5_990_000]);
  expect(detail.historySummary).toMatchObject({ currencyCode: 'INR', hireAmountMinor: 500_000_000, currentAmountMinor: 525_000_000, sinceHireBp: 500, averageYearlyGrowthBp: 98, raiseCount: 1 });
});

it('measures an inactive employee\'s growth up to the day they were deactivated', () => {
  const id = addAsha();
  applySalaryChanges(database.db, [{ employeeId: id, reason: 'raise', amountMinor: 525_000_000, currencyCode: 'INR', effectiveDate: '2022-04-01' }], deps);
  deactivateEmployee(database.db, id, { now: () => '2024-03-01T09:00:00.000Z' });
  const detail = getEmployeeDetail(database.db, id, '2026-03-01');
  expect(detail.deactivatedOn).toBe('2024-03-01');
  expect(detail.historySummary.averageYearlyGrowthBp).toBe(164);
});
```

`routes/employees.test.ts`: `it('returns the history summary with the employee')` — `setup({ now: () => new Date('2026-03-01T09:00:00.000Z') })`, `GET /api/employees/1` → 200 and `historySummary` matches `{ currencyCode: 'USD', convertedToUsd: false, hireAmountMinor: 10_000_000, sinceHireBp: null, averageYearlyGrowthBp: null, biggestJump: null }`, and `history[0].amountBaseMinor` is `10_000_000`.

- [ ] **Step 5: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-detail routes/employees`
Expected: FAIL (`amountBaseMinor` and `historySummary` are undefined).

- [ ] **Step 6: Implement the schema, service, routes and fixture; run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass (the web suite compiles against the extended fixture).

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src packages/shared/src apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): summarise each employee's salary history in the detail response" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: History tab with the step chart, ranges, summary and figures

**Files:**
- Create: `apps/web/src/features/employees/history-chart.ts`, `history-chart.test.ts`, `salary-history-chart.tsx`, `salary-history-tab.tsx`
- Modify: `apps/web/src/features/employees/employee-detail.tsx`, `employee-detail.test.tsx`

**Interfaces:**
- Consumes: `EmployeeDetail`, `SalaryHistoryEntry`, `HistorySummary` (shared); `formatMoney`, `formatMoneyCompact`, `formatChangeBp` (`lib/money.ts`); `formatDate`, `useFxAsOfLabel` (`features/reference/use-reference.ts`); `REASON_LABELS` (`features/insights/recent-changes-panel.tsx`); `SegmentedControl`; `SalaryHistoryList` (unchanged).
- Produces (`history-chart.ts`, pure):
  ```ts
  export type HistoryRange = '3y' | '5y' | '10y' | 'all';
  export const HISTORY_RANGES: { value: HistoryRange; label: string }[]; // 3Y, 5Y, 10Y, All
  export const DEFAULT_HISTORY_RANGE: HistoryRange = 'all';
  export const REASON_COLORS: Record<SalaryHistoryEntry['reason'], string>; // hire var(--text-primary), raise var(--positive), promotion var(--series-promotion), relocation var(--text-secondary), correction var(--warning)
  export interface HistoryChartPoint { time: number; date: string; amountMinor: number; entry: SalaryHistoryEntry | null } // entry null for the range's edge points
  export interface HistoryChart { startDate: string; endDate: string; currencyCode: string; points: HistoryChartPoint[]; changeCount: number }
  export function rangeStartDate(range: HistoryRange, endDate: string, hireDate: string): string; // N calendar years before endDate (29 Feb → 28 Feb), never before hireDate; 'all' → hireDate
  export function historyChart(employee: EmployeeDetail, range: HistoryRange, today: string): HistoryChart;
  export function promotionLabel(entry: SalaryHistoryEntry): string | null;  // promotions only: "L4 +15%", or "L4" without a %
  export function chartLabel(range: HistoryRange, convertedToUsd: boolean): string;
  export function historySummaryText(employee: EmployeeDetail): { headline: string; counts: string | null };
  export function timeSinceText(fromDate: string, toDate: string): string;
  ```
  `historyChart`: `endDate = employee.deactivatedOn ?? today`; rows in date order (ties by id); each point's `amountMinor` is the row's `amountBaseMinor` when `historySummary.convertedToUsd`, else `amountMinor`; `currencyCode = historySummary.currencyCode`. Points = an edge point at `startDate` carrying the pay in force then (omitted when a row is dated exactly on `startDate`), every row dated from `startDate` to `endDate`, and an edge point at `endDate` carrying the last pay (omitted when the last row is dated `endDate`). `time = Date.parse(`${date}T00:00:00Z`)`. `changeCount` counts rows in the range whose reason is not `hire`.
  `timeSinceText`: whole calendar months between the dates (`(y2 − y1) × 12 + (m2 − m1)`, minus one when `d2 < d1`): same day → "Today"; 0 months → "Less than a month ago"; under 12 → "1 month ago" / "N months ago"; otherwise "1 year ago" / "N years ago", with ", 1 month" / ", N months" before " ago" when the remainder is not zero.
- Produces (components):
  - `chartLabel` — "Salary over time since hire" for All, otherwise "Salary over time, last 3 years" / "last 5 years" / "last 10 years", with ", in USD" appended when converted.
  - `SalaryHistoryChart({ chart, label }: { chart: HistoryChart; label: string })` — a `div` with `role="img"` and `aria-label={label}`, 200px tall, `ResponsiveContainer` + `LineChart`; `Line type="stepAfter"` in `var(--accent)`, `isAnimationActive={false}`, a custom `dot` that draws nothing for edge points and a 4px circle in `REASON_COLORS[reason]` for rows, plus `promotionLabel` text above promotion dots in `var(--series-promotion)` at 11px; `XAxis type="number" dataKey="time" domain={[start, end]}` with year ticks; `YAxis` with `formatMoneyCompact`; a tooltip with `formatDate`, `formatMoney` and the reason label. Under it a `<ul aria-label="Chart key">` with a dot and the label of each reason present among the points. When `chart.changeCount === 0`, the text "No salary changes in this period." under the chart.
  - `SalaryHistoryTab({ employee, today }: { employee: EmployeeDetail; today: string })` — owns the range (default `DEFAULT_HISTORY_RANGE`); renders the headline (`text-sm font-semibold`) and counts (`text-xs text-text-secondary`), `SegmentedControl label="Range"`, the chart (`label={chartLabel(range, historySummary.convertedToUsd)}`), the USD note when `historySummary.convertedToUsd` (`Shown in USD because this salary moved between currencies. ${fxLabel}.`), a `<dl aria-label="History figures">` with Average yearly growth, Biggest jump, Last change, then `SalaryHistoryList`.
  - Figures: Average yearly growth = `formatChangeBp(bp)` or "—"; Biggest jump = `${formatChangeBp(changeBp)} · ${REASON_LABELS[reason]}, ${formatDate(effectiveDate)}` or "—"; Last change = `timeSinceText(current row's effectiveDate, today)`.
  - `EmployeeDetailView` renders `<SalaryHistoryTab employee={employee} today={today ?? todayUtc()} />` in the History tab.

- [ ] **Step 1: Write the failing helper tests**

`history-chart.test.ts` (`detail` = `employeeDetail()` from fixtures: hire 2021-04-12 ₹45,00,000, raise 2025-04-01 ₹50,00,000):

```ts
it('counts back whole calendar years from the end of the range', () => {
  expect(rangeStartDate('3y', '2026-10-19', '2016-01-01')).toBe('2023-10-19');
  expect(rangeStartDate('5y', '2028-02-29', '2010-01-01')).toBe('2023-02-28');
  expect(rangeStartDate('all', '2026-10-19', '2021-04-12')).toBe('2021-04-12');
});

// Review Focus 4
it('never starts a range before the hire date', () => {
  expect(rangeStartDate('10y', '2026-10-19', '2024-05-01')).toBe('2024-05-01');
  const recent = employeeDetail({ hireDate: '2024-05-01', history: [{ ...employeeDetail().history[1]!, effectiveDate: '2024-05-01' }] });
  expect(historyChart(recent, '10y', '2026-10-19').points.map((p) => [p.date, p.entry?.reason ?? null]))
    .toEqual([['2024-05-01', 'hire'], ['2026-10-19', null]]);
});

it('steps from the hire through each change to today', () => {
  const chart = historyChart(employeeDetail(), 'all', '2026-10-19');
  expect(chart.points.map((p) => [p.date, p.amountMinor, p.entry?.reason ?? null])).toEqual([
    ['2021-04-12', 450_000_000, 'hire'], ['2025-04-01', 500_000_000, 'raise'], ['2026-10-19', 500_000_000, null],
  ]);
  expect(chart).toMatchObject({ startDate: '2021-04-12', endDate: '2026-10-19', currencyCode: 'INR', changeCount: 1 });
});

// Review Focus 3
it('draws a flat line at the pay in force when the range holds no change', () => {
  const chart = historyChart(employeeDetail(), '3y', '2029-10-19');
  expect(chart.points.map((p) => [p.date, p.amountMinor, p.entry])).toEqual([
    ['2026-10-19', 500_000_000, null], ['2029-10-19', 500_000_000, null],
  ]);
  expect(chart.changeCount).toBe(0);
});

it('ends an inactive employee\'s chart on the day they were deactivated', () => {
  expect(historyChart(employeeDetail({ deactivatedOn: '2026-03-01' }), 'all', '2026-10-19').endDate).toBe('2026-03-01');
});

// Review Focus 2
it('plots the USD amounts when the pay moved between currencies', () => {
  const moved = relocatedDetail(); // hire IN ₹10,00,000 (base 1_198_000) on 2020-01-01, relocation US $60,000 on 2023-01-01, convertedToUsd true
  expect(historyChart(moved, 'all', '2026-10-19').points.map((p) => p.amountMinor)).toEqual([1_198_000, 6_000_000, 6_000_000]);
  expect(historyChart(moved, 'all', '2026-10-19').currencyCode).toBe('USD');
});

it('labels a promotion with its new level and change', () => {
  const entry = { ...employeeDetail().history[0]!, reason: 'promotion' as const, levelCode: 'L4', changeBp: 1500 };
  expect(promotionLabel(entry)).toBe('L4 +15%');
  expect(promotionLabel(employeeDetail().history[0]!)).toBeNull();
});

it('names the chart for its range and currency', () => {
  expect(chartLabel('all', false)).toBe('Salary over time since hire');
  expect(chartLabel('5y', true)).toBe('Salary over time, last 5 years, in USD');
});

it('words the time since a change in months and years', () => {
  expect(timeSinceText('2026-10-19', '2026-10-19')).toBe('Today');
  expect(timeSinceText('2026-10-01', '2026-10-19')).toBe('Less than a month ago');
  expect(timeSinceText('2026-09-19', '2026-10-19')).toBe('1 month ago');
  expect(timeSinceText('2026-04-20', '2026-10-19')).toBe('5 months ago');
  expect(timeSinceText('2024-10-19', '2026-10-19')).toBe('2 years ago');
  expect(timeSinceText('2025-04-01', '2026-10-19')).toBe('1 year, 6 months ago');
});

it('sums up the history since hire, or says there has been no change', () => {
  expect(historySummaryText(employeeDetail())).toEqual({
    headline: '₹45,00,000.00 → ₹50,00,000.00 since hire (+11.11%)', counts: '0 promotions · 1 raise',
  });
  expect(historySummaryText(newHireDetail())).toEqual({
    headline: 'Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since.', counts: null,
  });
});
```

Add to `apps/web/src/test/fixtures.ts`, next to `employeeDetail()`: `relocatedDetail()` (US country, `history` newest first: relocation id 2 `{ amountMinor: 6_000_000, currencyCode: 'USD', amountBaseMinor: 6_000_000, effectiveDate: '2023-01-01', reason: 'relocation', countryCode: 'US', changeBp: 40083 }`, hire id 1 `{ amountMinor: 100_000_000, currencyCode: 'INR', amountBaseMinor: 1_198_000, effectiveDate: '2020-01-01', countryCode: 'IN', changeBp: null }`; `hireDate: '2020-01-01'`; `historySummary: { currencyCode: 'USD', convertedToUsd: true, hireAmountMinor: 1_198_000, currentAmountMinor: 6_000_000, sinceHireBp: 40083, averageYearlyGrowthBp: 2671, biggestJump: { historyId: 2, changeBp: 40083, effectiveDate: '2023-01-01', reason: 'relocation' }, promotionCount: 0, raiseCount: 0 }`) and `newHireDetail()` (only the fixture's hire row, `historySummary` with `hireAmountMinor` and `currentAmountMinor` 450_000_000, `sinceHireBp`, `averageYearlyGrowthBp` and `biggestJump` null, counts 0).

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- history-chart`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `history-chart.ts`; run to verify pass**

Pluralisation: "1 promotion", "0 promotions", "2 raises". The headline omits the bracketed % when `sinceHireBp` is null.

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- history-chart`
Expected: PASS.

- [ ] **Step 4: Write the failing component tests**

In `employee-detail.test.tsx` (`renderDetail` and `showTab` as today; `today` is `2026-10-19`). Change the end of `labels the history tab with the number of changes and shows the % change on each row` to `expect(within(history).getAllByText(/%/)).toHaveLength(1);`, and add:

```ts
it('sums up the whole history above the chart and gives its figures below', async () => {
  renderDetail();
  await screen.findByRole('heading', { name: 'Asha Rao' });
  showTab('History (2)');
  expect(screen.getByText('₹45,00,000.00 → ₹50,00,000.00 since hire (+11.11%)')).toBeDefined();
  expect(screen.getByText('0 promotions · 1 raise')).toBeDefined();
  const figures = screen.getByLabelText('History figures');
  expect(within(figures).getByText('+1.93%')).toBeDefined();
  expect(within(figures).getByText('+11.11% · Raise, 1 Apr 2025')).toBeDefined();
  expect(within(figures).getByText('1 year, 6 months ago')).toBeDefined();
  expect(within(screen.getByRole('list', { name: 'Chart key' })).getByText('Raise')).toBeDefined();
});

it('offers 3Y, 5Y, 10Y and All, starting on All', async () => {
  renderDetail();
  await screen.findByRole('heading', { name: 'Asha Rao' });
  showTab('History (2)');
  const range = screen.getByRole('radiogroup', { name: 'Range' });
  expect(within(range).getAllByRole('radio').map((r) => r.textContent)).toEqual(['3Y', '5Y', '10Y', 'All']);
  expect(within(range).getByRole('radio', { name: 'All' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByRole('img', { name: 'Salary over time since hire' })).toBeDefined();
  fireEvent.click(within(range).getByRole('radio', { name: '3Y' }));
  expect(screen.getByRole('img', { name: 'Salary over time, last 3 years' })).toBeDefined();
});

// Review Focus 2
it('shows a relocated employee in USD and says why', async () => {
  renderDetail({ 'GET /api/employees/1': () => Response.json(relocatedDetail()) });
  await screen.findByRole('heading', { name: 'Asha Rao' });
  showTab('History (2)');
  expect(screen.getByText('$11,980.00 → $60,000.00 since hire (+400.83%)')).toBeDefined();
  expect(await screen.findByText('Shown in USD because this salary moved between currencies. FX rates as of 15 Jan 2026.')).toBeDefined();
  expect(within(screen.getByRole('list', { name: 'Salary history' })).getByText('₹10,00,000.00')).toBeDefined();
});

// Review Focus 1
it('describes a new hire with no changes yet', async () => {
  renderDetail({ 'GET /api/employees/1': () => Response.json(newHireDetail()) });
  await screen.findByRole('heading', { name: 'Asha Rao' });
  showTab('History (1)');
  expect(screen.getByText('Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since.')).toBeDefined();
  expect(within(screen.getByLabelText('History figures')).getAllByText('—')).toHaveLength(2);
  expect(screen.getByText('No salary changes in this period.')).toBeDefined();
});

// Review Focus 3
it('says when the chosen range has no salary change', async () => {
  renderDetail({ 'GET /api/employees/1': () => {
    const detail = employeeDetail();
    return Response.json({ ...detail, history: detail.history.map((h) => (h.id === 2 ? { ...h, effectiveDate: '2022-01-01' } : h)) });
  } });
  await screen.findByRole('heading', { name: 'Asha Rao' });
  showTab('History (2)');
  expect(screen.queryByText('No salary changes in this period.')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: '3Y' }));
  expect(screen.getByText('No salary changes in this period.')).toBeDefined();
});
```


- [ ] **Step 5: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employee-detail`
Expected: FAIL (the new tests; the existing ones still pass).

- [ ] **Step 6: Implement the chart, the tab and the wiring; run to verify pass**

Jsdom gives `ResponsiveContainer` no size, so the SVG is not drawn in tests; the `role="img"` wrapper, the key and the empty-range text are plain markup outside it. Layout: `flex flex-col gap-4`; figures as a `grid grid-cols-1 gap-2 sm:grid-cols-3` of `dt` (11px uppercase `text-text-secondary`) and `dd` (`text-sm font-medium tabular-nums`). The chart keeps the full width and 200px height in the full-screen drawer below `md`.

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employee-detail history-chart`
Expected: PASS.

- [ ] **Step 7: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/employees apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): chart an employee's salary history with ranges, a summary and figures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Re-measure on the fuller seed and check the History tab in the running app

**Files:**
- Modify: `apps/api/src/perf/measure-latency.ts`, `docs/performance.md`, `README.md`; `Dockerfile` only if Step 3 says so

**Interfaces:**
- Consumes: everything above. Produces measured figures only.

- [ ] **Step 1: Add the employee detail to the latency cases**

Add `` `/api/employees/${EMPLOYEE_ID}` `` to `GET_URLS`. If employee 1 is inactive in the new seed (check after Step 2 with `GET /api/employees/1` or the CLI output), set `EMPLOYEE_ID` to the lowest active id and keep its comment true.

- [ ] **Step 2: Seed the perf database and measure latency**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && mkdir -p apps/api/data && rm -f apps/api/data/perf.db* && DATABASE_PATH=./data/perf.db SEED_RNG_SEED=42 SEED_REFERENCE_DATE=2026-10-22 HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run db:seed -w @acme/api && DATABASE_PATH=./data/perf.db HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run perf:latency -w @acme/api; rm -f apps/api/data/perf.db*
```
Expected: the seed line "Seeded 10000 employees, N salary history rows and M revision batches (reference date 2026-10-22, RNG seed 42) in S s."; one latency row per case, every p95 below 300 ms; no `perf.db*` left.

- [ ] **Step 3: Update `docs/performance.md` and the README**

- Seed time row: S s, N `salary_history` rows, M revision batches, reference date 2026-10-22, measured 2026-10-22 (drop the old outlier clause; the seed tests assert the outlier share).
- Replace every figure in the latency table with the new run, add the `GET /api/employees/1` row (detail with its history summary), and change the method paragraph's date and reference date to 2026-10-22, saying the dataset now carries ten years of history.
- README: replace "about 15 seconds" (twice) with the measured seed time, rounded to 5 s. If S is above 60 s, raise the `Dockerfile` `HEALTHCHECK --start-period` to at least twice S and say so in the commit message.

- [ ] **Step 4: Measure the test-suite runtime**

Run three times: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && time npm test`
Expected: all pass each time. Update the "Full test-suite runtime" row with the median wall-clock time, the three runs, the API and web test counts and the date 2026-10-22.

- [ ] **Step 5: Check the History tab in the running app (on a scratch database)**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && DATABASE_PATH=./data/check.db npm run dev` (the first start seeds `check.db` with today's date; `app.db` is not touched). Sign in with the HR login from `apps/api/.env`. Open, from the list or from Insights' recent changes: an employee hired 8+ years ago with a promotion (dots coloured by reason, "L4 +15%"-style label, 3Y/5Y/10Y/All), a relocated employee (USD summary and the note), the newest hire (sort by Hired, descending: "Hired at … No changes since."), and an inactive employee (status filter Inactive: the chart ends on the deactivation date). Repeat one of them at a 390px-wide window. Stop the server, then `rm -f apps/api/data/check.db*`.
Expected: each behaves as `docs/design.md` §5 "History tab" says; no console errors; no `check.db*` left.

- [ ] **Step 6: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src/perf docs/performance.md README.md Dockerfile
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "docs: re-measure seed time, latency and test runtime on ten years of history" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
