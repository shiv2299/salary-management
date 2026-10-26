# Redesign Phase 4: Insights and Attention Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Insights page around the questions leadership asks about pay (spec §8). It gets headline tiles and question cards with plain-English answers, and charts as evidence. It adds a "Needs attention" filter to the Employees list and a full page of salary changes.

**Architecture:**
- **Domain modules.** Pure modules in `domain/` hold every figure:
  - `payroll.ts`: payroll on a date, and the change between two dates by cause;
  - `increases.ts`: raise and promotion figures;
  - `level-bands.ts`: pay bands per level;
  - `attention-rules.ts`: the three "needs attention" rules and their thresholds.
- **History figures.** A service loads every employee and every salary history row once per request. It converts each row to USD at today's static rates (constant currency) and passes them to the domain.
- **Current-state figures.** These read active employees, as today. The attention filter is resolved on the server to a set of employee ids, which the list, facets, export and bulk-selection queries AND with their other filters.
- **Web.** The Insights page and the new `/insights/changes` page only pick, filter by date and format the figures the API returns. They fill sentence templates.

**Tech Stack:** Fastify 5, Drizzle ORM + better-sqlite3, Zod 4 (`packages/shared`), Next.js 16 App Router, TanStack Query 5, Recharts 3, Tailwind 4, Vitest + React Testing Library. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-21-ui-ux-redesign-design.md` (binding). The relevant sections:
- the whole of §8;
- §5 for the "Needs attention" filter group;
- §13 and §14 item 4;
- §2, §3, §4 and §11.

Overview plan: `docs/superpowers/plans/2026-10-21-ui-ux-redesign.md` ("Phase 4" and "Cross-phase interfaces"). Earlier phase plans, for the names this phase builds on, are in `docs/superpowers/plans/` (phases 1–3).

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

- The commit trailer names the model that authored the commit, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **Never run `db:reset`, `db:seed`, `npm run dev` or anything else that writes to the database against `apps/api/data/app.db`.** Tests use in-memory databases. A manual check sets `DATABASE_PATH=./data/check.db`, or the perf recipe's `./data/perf.db`, on the command line; that takes precedence over `apps/api/.env`. Delete `apps/api/data/check.db*` and `perf.db*` afterwards.
- The wording rule above applies to test names, comments and UI copy too.
- **Payroll rule.** A payroll on date D counts an employee when:
  - `hire_date <= D`; and
  - either `status = 'active'`, or `deactivated_on` is not null and later than D.

  The pay counted is the salary history row in force on D: the latest `effective_date <= D`, with the highest `id` breaking a tie. It is converted to USD at the latest static rates. An inactive employee with no `deactivated_on` is in no payroll.
- **Trailing windows.** "The last 12 months" is the dates after `trailingWindowStart(today, 1)` up to and including today. "The 12 months before" is the dates after `trailingWindowStart(today, 2)` up to and including `trailingWindowStart(today, 1)`. Charts by year use calendar years, and the current year is "year to date".
- **Population.** Figures built from history (payroll trend, change by cause, raise statistics, recent changes) include employees who have since left, for the time they were paid. Figures about the present (level bands, attention, tiles about today) read active employees only.
- The attention values keep exactly the names `outlier-above`, `outlier-below`, `no-raise-2y` and `compression` (cross-phase interface).
- Every figure that converts currency, divides money or computes a percentage, ratio, median or share comes from the API. The web only picks figures, filters by date or year, counts or subtracts integers, and formats.
- Test commands use `npm test -w @acme/api -- <file filter>` or `npm test -w @acme/web -- <file filter>`. "PASS" means Vitest reports that every selected file passed.
- UI copy in this plan is exact (labels, messages, aria-labels, sentence templates). Tests query by it.
- API tests run with `FIXED_NOW = 2026-01-15T10:00:00.000Z` (`src/test/test-db.ts`), so "today" is `2026-01-15`, a year ago is `2025-01-15` and two years ago is `2024-01-15`.

## Review Focus

1. **An employee who leaves inside the last 12 months after a raise.** Their raise counts under Raises and their departure under People who left, and the six causes still add up exactly to payroll today minus payroll a year ago. The property test in Task 2 and the endpoint test in Task 4 cover this.
2. **Boundaries of the attention rules.** For "no raise in over 2 years":
   - a last increase exactly 24 months ago is not flagged; one day earlier is;
   - someone hired 23 months ago with no raise is not flagged.

   For compression:
   - a group whose recent-hire median is exactly 5% above the long-tenured median is not flagged;
   - a group with only 4 recent hires is not evaluated.

   Tests in Task 5.
3. **An attention filter combined with other filters and status.** Inactive status with any attention value returns no rows. Attention plus a country returns the intersection. Facet counts for the other groups shrink to the attention set. "Export current result" and "Select all matching" on such a view take exactly the listed people. Tests in Tasks 6 and 9.
4. **A country where some levels have fewer than 10 people.** Those levels read "Too few people" and get no band. Steps and overlaps skip a missing neighbour and never divide by zero. A country with no level bands at all says "Too few people in Germany to compare levels." Tests in Tasks 7 and 11.
5. **Recent changes with a year that has no changes, or a year combined with a reason.** The card and the page show "No salary changes match these filters.", and the year chip clears back to the default range. A bulk revision still shows as one row when the reason is Raise. Tests in Tasks 8 and 12.

---

## File structure

API (`apps/api/src`):
- `domain/payroll.ts` (create) + test: `PayRow`, `PayrollPerson`, `isOnPayroll`, `payInForce`, `payrollAt`, `payrollChangeByCause`.
- `domain/increases.ts` (create) + test: `increaseEvents`, `summariseIncreases`.
- `domain/trailing-window.ts` (modify) + test: `trailingYear`, `previousTrailingYear`, `isWithin`.
- `domain/attention-rules.ts` (create) + test: thresholds, `hasNoRecentIncrease`, `compressionGroups`.
- `domain/level-bands.ts` (create) + test: `levelBands`.
- `repositories/employees.ts` (modify):
  - `listPayrollEmployees`;
  - `EmployeeListFilter.employeeIds`.
- `repositories/salary-history.ts` (modify):
  - `listAllSalaryHistory`;
  - `listLastIncreaseDates`;
  - `listChangeEntries` with an optional start and reasons;
  - `listChangeYears`.
- `services/insights-history.ts` (create) + test: `getPayrollTrend`, `getPayrollChange`, `getRaiseStats`.
- `services/attention.ts` (create) + test: `getAttentionSets`, `attentionEmployeeIds`, `withAttention`, `getAttention`.
- `services/level-bands.ts` (create) + test: `getLevelBands`.
- `services/employee-list.ts`, `employee-facets.ts`, `employee-export.ts`, `bulk-revision.ts`, `recent-changes.ts` (modify) + tests.
- `services/insights.ts` (modify, Task 12): `getPayroll` and `getOutliers` removed.
- `routes/insights.ts`, `routes/employees.ts` (modify) + tests.
- `perf/measure-latency.ts` (modify).

Shared (`packages/shared/src`): `employees.ts`, `insights.ts`, `bulk-revision.ts` (modify).

Web (`apps/web/src`):
- `app/globals.css` (modify): `--series-1` … `--series-7`.
- `components/ui/chart-card.tsx` (create) + test.
- `features/employees/attention-labels.ts` (create); `list-filters.ts`, `employee-filter-panel.tsx` (modify) + tests.
- `features/insights/`:
  - `use-insights.ts`, `answers.ts` (+ test), `chart-data.ts` (+ test), `insights-page.tsx` (+ test);
  - `headline-tiles.tsx`, `payroll-trend-card.tsx`, `payroll-change-card.tsx`, `raises-card.tsx`, `level-bands-card.tsx`, `full-breakdown.tsx`, `attention-card.tsx`, `recent-changes-card.tsx`, `change-entry.tsx`;
  - `changes-page.tsx` (+ test).
  - Deleted in Task 12: `distribution-panel.tsx`, `outliers-panel.tsx`, `payroll-panel.tsx`, `recent-changes-panel.tsx`, `panel.tsx`. Their skeleton and error helpers move into `chart-card.tsx`.
- `app/(app)/insights/changes/page.tsx` (create).
- `test/fixtures.ts` (modify).

Docs: `docs/design.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/decisions.md` (Task 1, then kept true by later tasks). `docs/performance.md` (Task 13).

---

### Task 1: Product docs for the Insights rebuild, the attention filter and the changes page

**Files:**
- Modify: `docs/design.md`, `docs/requirements.md`, `docs/architecture.md`, `docs/decisions.md`

**Interfaces:**
- Produces the binding text for Tasks 2–13. Names fixed here:
  - endpoints `GET /api/insights/payroll-trend`, `/payroll-change`, `/raises`, `/level-bands?country=`, `/attention`, `/recent-changes?range=&year=&reason=`;
  - attention values `outlier-above | outlier-below | no-raise-2y | compression`;
  - page `/insights/changes`;
  - tokens `series-1` … `series-7`.

- [ ] **Step 1: Update `docs/design.md`**

- §2 colour table: add seven rows after `series-promotion`. Each is "Categorical chart series, in this fixed order; slot 1 is `accent`":
  - `series-1` `#1D4ED8`;
  - `series-2` `#EB6834`;
  - `series-3` `#1BAF7A`;
  - `series-4` `#EDA100`;
  - `series-5` `#E87BA4`;
  - `series-6` `#6250D6`;
  - `series-7` `#0891B2`.

  Add this paragraph under the table: "Categorical series take `series-1` onward in a fixed order and keep their colour when a filter hides another series. The seven were checked for colour-blind separation between neighbours. `series-3`, `series-4` and `series-5` are under 3:1 against white, so a chart that uses them always has a legend and a "View as table" view. Charts never use `positive`/`negative` for a series, and never put two value axes on one chart."
- §3: append "The Insights pages (`/insights`, `/insights/changes`) sit on `canvas`."
- §4: after `/insights` add "**`/insights/changes`** is the full list of salary changes, reached from "See all changes →" on Insights. Its range, reason, year and page live in the URL."
- §5 "Building blocks": add "chart card (`chart-card.tsx`)" to the list.
- §5: replace the "Charts (Insights page)" bullet with the "**Insights page**" bullet below, and add the "**Salary changes page**" bullet after it:
  - **Insights page** (`/insights`):
    - **Header.** The title "Insights", then the meta line "Active employees · USD at FX rates of <date> · Past years use the same rates".
    - **Headline tiles.** Five tiles, two per row below `sm`, three from `sm` and five from `xl`:
      - Annual payroll ("$612.4M", hint "↑ 6.2% vs 12 months ago");
      - Active headcount ("9,577", hint "↑ 312 vs 12 months ago");
      - Average raise, last 12 months ("4.4%", hint "↓ from 4.6% the 12 months before");
      - Promotions, last 12 months ("412", hint "↑ from 380 the 12 months before");
      - Paid outside peer range ("187", in `warning` when above zero, hint "1.95% of active employees").

      An arrow always sits next to its number. Payroll and headcount growth are neutral information, so they are never coloured. A change of zero reads "No change vs 12 months ago" or "Same as the 12 months before". A missing figure is "—".
    - **Question cards.** They sit in two columns from `md` and one below. Every card is a chart card:
      - the question as a section label;
      - the answer as a sentence (15px, weight 600);
      - its controls;
      - the chart;
      - a one-line caption saying what the chart plots;
      - where it applies, a link in `accent` that opens the Employees list filtered to the people meant ("View these people →");
      - a "View as table" button in the card header (it reads "View as chart" while the table shows) that swaps the chart for a table of the same figures.

      While a card loads, it shows a line-shaped skeleton for the answer and an axis-shaped skeleton for the chart. A failed card shows the server's message in `negative` with "Retry", inside the card.
    - **How is payroll changing?**
      - Controls: "Range" 3Y | 5Y | 10Y | All (default 5Y) and "Group" Total | Country | Department.
      - Chart: a bar for payroll at each year end, labelled with the year, plus a last bar "Today". Bars are `accent` for Total, or stacked one segment per country or department in the categorical series with a legend.
      - Under it, a 64px strip chart "Headcount" plots the number of people at the same points. The strip is a separate chart, not a second axis.
      - 3Y means the last three year ends and today.
      - Caption: "Annual payroll at each year end and today, in USD at today's FX rates."
      - The table has Year, Payroll and Headcount, plus a column per country or department when grouped. Its "Today" row is the payroll by country and by department.
    - **What added to payroll in the last 12 months?**
      - Chart: horizontal bars in `accent` for New hires, Raises, Promotions, Relocations, Corrections and People who left, in that order. A bar extends right for an addition and left for a reduction, and is labelled with its signed amount ("+$15.2M").
      - Caption: "Change in annual payroll from <date a year ago> to today, by cause. The bars add up to the total change."
      - Table: Cause, Change, and People or changes.
    - **What are we giving in raises?**
      - Controls: "Show" Average % | $ cost, "Range" 3Y | 5Y | 10Y | All (default 5Y), and "Group" All | Country | Department. 3Y means this year and the two before it. The current year is labelled "2026 (YTD)".
      - Average %, All: a line of the year's average raise in `accent`, with a 64px strip chart "Number of raises" under it.
      - Average %, grouped: one line per country or department with a legend, and no strip.
      - $ cost, All: stacked bars of payroll added by raises (`series-1`) and promotions (`series-2`).
      - $ cost, grouped: one stacked segment per country or department, covering raises and promotions together.
      - Choosing a year, by clicking its bar or point or its "Show changes" button in the table, sets "What changed recently?" to that year.
      - Captions: "Average raise per calendar year; raises within one currency only." and "Payroll added each calendar year by raises and promotions, in USD at today's FX rates."
    - **Do levels mean consistent pay?**
      - Control: "Country", a segmented control with the country names.
      - Chart: one row per level, L1 at the top. Each row has a bar from the bottom quarter to the top quarter of pay in `series-secondary`, a tick at the median in `accent`, and the median written beside it, in local currency. A level with fewer than 10 people reads "Too few people".
      - Caption: "Each bar spans the middle half of people at that level, in <currency>; the tick marks typical pay (median)."
      - Table: Level, People, Bottom quarter, Typical (median), Top quarter, and Step from level below ("1.35×").
      - Under the card, a "Full breakdown" button (with `aria-expanded`) opens the distribution table. A "Group" segmented control (Country | Department | Level) selects the rows. Columns: Group, People, Lowest, Bottom quarter earn under, Typical pay *(median)*, Average, Top quarter earn over, Top 10% earn over, Highest, in USD.
    - **Who needs attention?** Three rows, each with a count in 22px, a title, a one-line meaning, and "View these people →" (left out when the count is 0):
      - "Outside peer range": "Paid well above or below others at the same level in the same country.", with "142 above · 45 below".
      - "No raise in over 2 years": "Active employees whose last raise or promotion took effect more than 24 months ago."
      - "Paid less than new hires": "Long-tenured staff in groups where people hired in the last year are paid more: India L2, India L3." It reads "No country and level where new hires are paid more." when there are none.

      This card has no chart, so it has no "View as table".
    - **What changed recently?**
      - The latest five changes, as on the salary changes page, then "See all changes →".
      - A year chosen in the raises card shows as a chip "2024 ×", and removing the chip returns the card to the last three years.
  - **Salary changes page** (`/insights/changes`):
    - Header: "← Back to insights" and the title "Salary changes".
    - Controls:
      - "Range" 3Y | 5Y | 10Y | All (default 3Y);
      - a "Reason" select: All reasons, Hire, Raise, Promotion, Relocation, Correction;
      - a "Year" select: Any year, then the years with changes, newest first.

      Choosing a year replaces the range control with "In 2024" and a "Clear year" button.
    - Rows: 25 per page, newest first, with the shared pagination. Each row shows:
      - the reason badge;
      - the name, linked to the employee;
      - an "Inactive" badge for someone who has left;
      - from → to, with the new amount in `positive` when it went up in the same currency;
      - the date.

      A bulk revision is one row with a "Bulk revision" badge: "1,233 people · +3.57% · Annual increment 2026".
    - No match: "No salary changes match these filters." with a "Clear filters" link.
- §5 "Filter panel": the groups become Status, Country, Department, Level and Needs attention. Needs attention has these options:
  - "Paid above peer range" (`outlier-above`);
  - "Paid below peer range" (`outlier-below`);
  - "No raise in over 2 years" (`no-raise-2y`);
  - "Paid less than new hires" (`compression`).

  Each option counts active employees only.
- §7: replace "Insights charts stack in a single column, each full-width." with "Insights cards stack in a single column, each full-width, and the tiles run two per row; the salary changes page's controls wrap above the list."

- [ ] **Step 2: Update `docs/requirements.md`**

- FR-1: append "A "Needs attention" filter selects active employees paid outside their peer range (above or below), with no raise or promotion in over 24 months, or paid less than recent hires in their country and level (FR-18). It combines with the other filters like any group, and applies to export and bulk selection."
- FR-6: append "Shown as the "Full breakdown" under the level bands (FR-17)."
- FR-8: append "Counted and filtered through FR-18."
- FR-9: append "Shown as today's point of the payroll trend (FR-14)."
- FR-10: replace with "Show salary changes newest first: the latest five on Insights, and every change on a paginated page with a range of 3, 5 or 10 years or all time (default 3), a reason filter and a calendar-year filter. Each shows who, what changed (from → to), why, and when it took effect. A change counts by the date it took effect, not the date it was typed in. Changes applied together as one bulk revision (FR-4) are shown as one grouped entry. The list is historical, so it also includes changes for employees who have since been deactivated (marked as inactive)."
- Add after FR-10:
  - "**FR-14**: Show annual payroll at each calendar year end and today, with headcount, in total or by country or department, over 3, 5 or 10 years or all time. Past payrolls count everyone employed on that date at the pay then in force, converted at today's FX rates (constant currency)."
  - "**FR-15**: Show what changed annual payroll over the last 12 months, by cause: new hires, raises, promotions, relocations, corrections and people who left. The parts add up exactly to the change."
  - "**FR-16**: Show raises per calendar year: the average raise %, the number of raises, and the payroll added by raises and by promotions, in total or by country or department, with the last 12 months against the 12 before."
  - "**FR-17**: For one country at a time, show each level's typical pay and middle half in local currency, the pay step from the level below, how many people earn more than the typical pay of the level above, and the level with the widest spread."
  - "**FR-18**: Count and list the active employees who need attention: paid outside their peer range (FR-8, split above and below); no raise or promotion in over 24 months (or hired over 24 months ago with none); and long-tenured staff (3+ years) in country + level groups where the median pay of people hired in the last 12 months is more than 5% above theirs (at least 5 people on each side)."
- §5 Assumptions: append "Insights trends convert past pay at today's static FX rates, so they show changes in pay rather than in exchange rates."
- Acceptance table:
  - FR-1: append "Filtering by "No raise in over 2 years" and India returns exactly the flagged Indian employees, export returns the same rows, and each attention option's count follows the other groups' selections."
  - FR-10: replace with "A bulk revision appears as one entry with headcount and percentage; a change dated 4 years ago appears with the 5-year range but not the 3-year one; the year 2024 returns only changes effective in 2024; the reason "promotion" returns only promotions."
  - FR-14 row: "Payroll on a date counts someone deactivated on 1 Jan 2025 in the 2024 year end but not someone deactivated on 31 Dec 2024; a relocated employee counts under their country of the time; today's point equals the sum of active employees' current USD pay, per country and department (FR-9)."
  - FR-15 row: "Over generated histories the six causes always sum to payroll today minus payroll a year ago; a raise from $100,000 to $110,000 adds $10,000 to raises; a leaver paid $70,000 takes $70,000 off."
  - FR-16 row: "Raises of 3% and 5% in one year average 4%; a raise that changes currency counts in the number and the payroll added but not the average; promotions add the USD difference each one made."
  - FR-17 row: "For L1 and L2 medians of 1,450 and 2,450, the step is 1.69×; two of ten L1s above the L2 median is a 20% overlap; a level under 10 people has no band and breaks no step."
  - FR-18 row: "A last raise 24 months and a day ago is flagged and exactly 24 months ago is not; a group whose recent hires' median is 6% above its long-tenured median is flagged and lists its long-tenured staff, 5% is not, and 4 recent hires is not evaluated; the outside-peer-range counts equal the FR-8 rule."

- [ ] **Step 3: Update `docs/architecture.md`**

- §5: replace the endpoint table with one that keeps the distribution and recent-changes rows and adds these:
  - `GET /api/insights/payroll-trend`: payroll and headcount at every calendar year end from the earliest hire year to last year, plus today, with totals by country and department. Built from `payrollAt` (`domain/payroll.ts`) over the full history, converted to USD at the latest static rates.
  - `GET /api/insights/payroll-change`: `payrollChangeByCause` from a year ago to today.
  - `GET /api/insights/raises`: per calendar year, in total and by country and department, from `increaseEvents` and `summariseIncreases` (`domain/increases.ts`), plus the last 12 months against the 12 before.
  - `GET /api/insights/level-bands?country=`: `levelBands` (`domain/level-bands.ts`) over the country's active employees, using the peer-group summary for each level.
  - `GET /api/insights/attention`: the counts behind the attention filter (`services/attention.ts`, rules in `domain/attention-rules.ts`).

  Replace the payroll and outliers rows with these. Add the paragraph: "History-based insights read every employee and every `salary_history` row once per request (about 61,000 rows at the seeded size) and compute in memory, the same way the distribution statistics do. A payroll on date D counts an employee hired on or before D who is active or whose `deactivated_on` is later than D, at the row in force on D. The tiles and answer sentences use the last 12 months against the 12 before; charts by year use calendar years."
- §5 "Peer groups": append "The attention rules and the level bands read it too."
- §7:
  - `GET /api/employees` row: add the `attention` filter, which is multi-valued and active employees only, resolved by `services/attention.ts` to an id set.
  - `GET /api/employees/facets` row: add the `attention` counts.
  - Export and bulk preview/summary rows: note that they take `attention` too.
  - Insights row: replace it with `GET /api/insights/distribution` | `/payroll-trend` | `/payroll-change` | `/raises` | `/level-bands` | `/attention` | `/recent-changes`, "As described in §5".
  - Recent changes: `?range=3y|5y|10y|all&year=&reason=&limit=&offset=` (default `range=3y`; `year` overrides the range with that calendar year up to today; `reason` multi-valued). The response carries `availableYears`.
- §8:
  - Add the routes `(app)/insights/changes/page.tsx  # every salary change: range, reason and year in the URL`.
  - Change the insights line comment to "default landing page post-login: headline tiles and question cards".
  - Add "The Insights page fills sentence templates from API figures (`features/insights/answers.ts`) and slices yearly series by range. It never computes a money figure, percentage or ratio."

- [ ] **Step 4: Update `docs/decisions.md`**

Add these entries (Alternatives considered / Chosen / Why):

1. **"Insights trends: constant currency"**
   - Alternatives: converting each historical amount at the rate of its own date (needs a rate history the product doesn't have, and mixes currency moves into pay trends); local currency per country (no total).
   - Chosen: every past amount converts to USD at the latest static rate, and the meta line says so.
   - Why: the question is how pay changed, and at fixed rates every movement in a trend is a pay movement.
2. **"Insights windows: trailing 12 months for tiles and sentences, calendar years for charts"**
   - Alternatives: calendar year to date for everything (compares a partial year with a full one, so figures always "fall" early in the year); rolling windows on the charts too.
   - Chosen: tiles and answers compare the last 12 months with the 12 before; yearly charts use calendar years with the current year marked "YTD".
   - Why: like-for-like comparisons in the sentences, and familiar years on the axis.
3. **"Payroll change by cause: walk each person's pay through the window"**
   - Alternatives: compare first and last pay per person and attribute the whole difference to the latest reason (hides a raise followed by a correction); sum row deltas (double counts same-day corrections and ignores leavers).
   - Chosen: from a year ago to today, each person's paid amount changes only on the day they join the payroll (New hires, + their pay), the day a salary row takes effect (+ the step, under the reason of the row in force at the end of that day), or the day they leave (People who left, − their pay). The steps telescope, so the parts sum exactly to the payroll difference.
   - Why: an exact reconciliation is the acceptance rule, and this keeps each step under the reason that caused it.
4. **"Needs attention: thresholds in one domain module"**
   - Alternatives: thresholds as API parameters; configuration in the database.
   - Chosen: `domain/attention-rules.ts` holds:
     - `NO_RAISE_YEARS = 2`;
     - `RECENT_HIRE_YEARS = 1`;
     - `LONG_TENURE_YEARS = 3`;
     - `COMPRESSION_MIN_SUBGROUP = 5`;
     - `COMPRESSION_MARGIN_BP = 500`.

     A group is compressed only when its recent hires' median is more than 5% above its long-tenured median.
   - Why: these are product rules, not user settings. A gap of a few percent between two small groups' medians is noise, and the margin keeps the card to groups where recent hires are clearly paid more.
5. **"Attention filter: resolved to ids on the server, ANDed with the other filters"**
   - Alternatives: SQL for each rule (the outlier fences and medians need in-memory statistics anyway); a precomputed flag column (stale after every change and every day that passes).
   - Chosen: `services/attention.ts` computes the four id sets from active employees, today's date and the peer groups. The list, facets, export and bulk selection AND the union of the chosen sets with their other filters, passed to SQLite as one JSON array through `json_each`.
   - Why: one definition serves the list, the counts, the export and the bulk revision, so "export current result" and "select all matching" take exactly the people shown. One bound parameter stays within SQLite's limit at any size.
6. **"Insights endpoints: one per card, history read in full per request"**
   - Alternatives: one endpoint for the whole page (any change reloads everything); pre-aggregated tables (a second write path the single salary writer would have to keep in step).
   - Chosen:
     - payroll trend, payroll change, raises, level bands and attention each have their own endpoint;
     - the tiles read the trend summary, the raises' last 12 months and the attention counts;
     - `GET /api/insights/payroll` and `/outliers` are removed, since today's trend point and the attention filter replace them.
   - Why: each card loads and fails on its own. Reading about 61,000 rows stays within the latency target (`docs/performance.md`). Removing the old endpoints leaves one definition of each figure.
7. **"Charts: one value axis, a strip chart for the second measure"**
   - Alternatives: headcount as a line on a second axis (two scales on one chart invite false comparisons); headcount only in the tooltip.
   - Chosen: payroll bars with a 64px headcount strip beneath, and average raise with a 64px raise-count strip beneath, sharing the years.
   - Why: both measures stay visible without one appearing to cause the other.
8. **"Chart series colours: seven categorical slots"**
   - Alternatives: shades of the accent (unreadable with seven departments); a library default palette (includes the green and red the product reserves for pay going up and down).
   - Chosen: `series-1` … `series-7` (`docs/design.md` §2), in fixed order, starting with the accent, and checked for colour-blind separation between neighbours.
   - Why: departments need seven distinguishable colours that never read as good or bad.
9. **Update "Salary changes view: 3 or 5 years, by effective date"**: rename it to "Salary changes: 3, 5 or 10 years or all, a year and a reason, on their own page". The latest five sit on Insights; the full list is at `/insights/changes` with range (default 3 years), reason and calendar year. A chosen year overrides the range. Keep the effective-date rule and the reasoning that is still true.

- [ ] **Step 5: Check wording and formatting**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run format:check`, and reread every added line against the wording rule.
Expected: Prettier passes, and no added line breaks the wording rule.

- [ ] **Step 6: Commit**

```bash
git add docs/design.md docs/requirements.md docs/architecture.md docs/decisions.md
git commit -m "docs: specify the insights questions, attention filter and salary changes page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Payroll on a date and the change by cause (domain)

**Files:**
- Create: `apps/api/src/domain/payroll.ts`, `apps/api/src/domain/payroll.test.ts`

**Interfaces:**
- Produces:

```ts
export type SalaryReason = 'hire' | 'raise' | 'promotion' | 'relocation' | 'correction';
export interface PayRow {
  id: number;
  effectiveDate: string;
  reason: SalaryReason;
  amountMinor: number;
  currencyCode: string;
  /** The amount in USD at the latest static rates. */
  amountBaseMinor: number;
  /** The country in force from this row onward. */
  countryCode: string;
}
export interface PayrollPerson {
  employeeId: number;
  hireDate: string;
  status: 'active' | 'inactive';
  deactivatedOn: string | null;
  departmentId: number;
  /** In any order. */
  rows: PayRow[];
}
export function isOnPayroll(person: PayrollPerson, date: string): boolean;
export function payInForce(person: PayrollPerson, date: string): PayRow | null;
export interface PayrollGroupTotal { headcount: number; totalBaseMinor: number }
export interface PayrollSnapshot {
  date: string;
  headcount: number;
  totalBaseMinor: number;
  byCountry: Map<string, PayrollGroupTotal>;
  byDepartment: Map<number, PayrollGroupTotal>;
}
export function payrollAt(people: PayrollPerson[], date: string): PayrollSnapshot;
export const PAYROLL_CAUSES = ['hires', 'raises', 'promotions', 'relocations', 'corrections', 'leavers'] as const;
export type PayrollCause = (typeof PAYROLL_CAUSES)[number];
export interface PayrollChange {
  fromTotalBaseMinor: number;
  toTotalBaseMinor: number;
  causes: Record<PayrollCause, { amountBaseMinor: number; count: number }>;
}
/** From the payroll on `from` to the payroll on `to` (from < to). */
export function payrollChangeByCause(people: PayrollPerson[], from: string, to: string): PayrollChange;
```

- [ ] **Step 1: Write the failing tests** in `payroll.test.ts`

Build people with a small `person()` helper. Amounts are in USD minor units, with `amountMinor === amountBaseMinor` unless a test says otherwise. Tests:
- `isOnPayroll`:
  - "counts an employee from their hire date": hire `2025-08-01` is false on `2025-07-31` and true on `2025-08-01`.
  - "stops counting a leaver on their deactivation date": inactive, `deactivatedOn: '2025-03-01'`, is true on `2025-02-28` and false on `2025-03-01`.
  - "never counts an inactive employee without a deactivation date": false on every date.
- `payInForce`:
  - "takes the latest row dated on or before the date": rows `2020-03-01` (10,000,000) and `2025-06-01` (11,000,000) give 10,000,000 on `2025-05-31` and 11,000,000 on `2025-06-01`.
  - "lets the higher id win a same-day tie": ids 7 and 8 both on `2024-05-01` give id 8.
  - "ignores a backdated row with a higher id": id 9 dated `2023-01-01`, read on `2024-06-01`, still gives id 8.
  - "returns null before the first row".
- `payrollAt`:
  - "sums headcount and USD pay of everyone on the payroll": three people give the exact sum, and the inactive person without a date is left out.
  - "counts a relocated employee under the country of the time": hire IN on `2020-01-01`, relocation to US on `2024-01-01`. `byCountry` on `2023-12-31` has IN only; on `2024-01-01` it has US only.
  - "groups by department".
- `payrollChangeByCause`, with from `2025-01-15` and to `2026-01-15`:
  - "puts a raise inside the window under raises": 10,000,000 → 11,000,000 on `2025-06-01` gives raises `{ amountBaseMinor: 1_000_000, count: 1 }`.
  - "counts a new hire at their first pay": hire `2025-08-01` at 5,000,000 gives hires `{ 5_000_000, 1 }`.
  - "takes a leaver's last pay off and keeps their raise": 6,000,000, a raise to 7,000,000 on `2025-04-01`, deactivated `2025-09-01` give raises +1,000,000 and leavers `{ -7_000_000, 1 }`.
  - "attributes a day's step to the row in force at the end of that day": promotion id 7 (10,000,000 → 12,000,000) and correction id 8 (11,800,000), both on `2025-05-01`, give corrections +1,800,000 count 1 and promotions 0 count 0.
  - "ignores someone hired and gone inside the window": every cause has amount 0, except hires +x and leavers −x, which cancel.
  - "sums the causes to the payroll difference over generated histories". This is a property test:
    - 300 people from a seeded linear congruential generator defined in the test (no `Math.random`);
    - hire dates 2018–2026;
    - 0–4 later rows of random reasons;
    - about 15% inactive, some with no date;
    - for windows (`2024-01-15`, `2025-01-15`), (`2025-01-15`, `2026-01-15`) and (`2019-06-30`, `2026-01-15`), the sum of the six amounts equals `toTotalBaseMinor - fromTotalBaseMinor`, and each total equals `payrollAt(...).totalBaseMinor`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/payroll`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `domain/payroll.ts`**

- `payInForce` uses the same order as `selectCurrentRow` (latest date, then highest id) over the rows dated on or before the date.
- `payrollChangeByCause` walks each person from `from` to `to`:
  - The state is the paid amount, or "off payroll".
  - It starts at `isOnPayroll(p, from) ? payInForce(p, from).amountBaseMinor : off`.
  - The event dates are every distinct row date, the hire date and the deactivation date that fall in `(from, to]`, in ascending order.
  - On each date it computes the new state the same way. Off → on adds the new pay to `hires` (count 1). On → off subtracts the old pay from `leavers` (count 1). On → on with a row dated that day adds `new − old` to the cause of `payInForce(p, date).reason` (count 1). Reasons map as `raise→raises`, `promotion→promotions`, `relocation→relocations`, `correction→corrections` and `hire→hires`.
- All six causes are present, even at zero.

- [ ] **Step 4: Run the tests to see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/payroll.ts apps/api/src/domain/payroll.test.ts
git commit -m "feat(api): compute payroll on a date and its change by cause

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Raise and promotion figures, and the trailing year windows (domain)

**Files:**
- Create: `apps/api/src/domain/increases.ts`, `apps/api/src/domain/increases.test.ts`
- Modify: `apps/api/src/domain/trailing-window.ts`, `apps/api/src/domain/trailing-window.test.ts`

**Interfaces:**
- Consumes: `PayRow` from Task 2; `percentChangeBpOrNull` from `domain/revision.ts`; `divideRoundHalfAwayFromZero` from `domain/money.ts`.
- Produces:

```ts
// trailing-window.ts
export interface DateWindow { /** Exclusive. */ after: string; /** Inclusive. */ through: string }
export function trailingYear(today: string): DateWindow;          // after = trailingWindowStart(today, 1), through = today
export function previousTrailingYear(today: string): DateWindow;  // after = trailingWindowStart(today, 2), through = trailingWindowStart(today, 1)
export function isWithin(date: string, window: DateWindow): boolean;

// increases.ts
export interface IncreaseEvent {
  effectiveDate: string;
  reason: 'raise' | 'promotion';
  countryCode: string;
  departmentId: number;
  /** % change from the row before, in bp; null when the currency changed. */
  changeBp: number | null;
  /** USD added to annual pay: this row's amountBaseMinor minus the previous row's. */
  addedBaseMinor: number;
}
export function increaseEvents(person: { departmentId: number; rows: PayRow[] }): IncreaseEvent[];
export interface IncreaseStats {
  raiseCount: number;
  /** Mean of the raises' changeBp (same-currency raises only), half away from zero; null when none. */
  averageRaiseBp: number | null;
  raisesAddedBaseMinor: number;
  promotionCount: number;
  promotionsAddedBaseMinor: number;
  totalAddedBaseMinor: number;
}
export function summariseIncreases(events: IncreaseEvent[]): IncreaseStats;
```

- [ ] **Step 1: Write the failing tests**

`trailing-window.test.ts`:
- "gives the last 12 months as the dates after a year ago through today": `trailingYear('2026-01-15')` is `{ after: '2025-01-15', through: '2026-01-15' }`.
- "gives the 12 months before that": `previousTrailingYear('2026-01-15')` is `{ after: '2024-01-15', through: '2025-01-15' }`.
- "excludes the start and includes the end": `isWithin` is false for `2025-01-15`, and true for `2025-01-16` and `2026-01-15`.
- "moves a 29 February start to 28 February": `trailingYear('2024-02-29').after` is `'2023-02-28'`.

`increases.test.ts`. One person in department 3 with USD rows, all with `countryCode: 'US'`:
- hire `2020-01-01` 1,000,000;
- raise `2022-04-01` 1,030,000;
- raise `2022-10-01` 1,081,500;
- promotion `2023-03-01` 1,243,725;
- correction `2023-06-01` 1,240,000.

Tests:
- "lists raises and promotions with their change and USD added": three events, with `changeBp` 300, 500, 1500 and `addedBaseMinor` 30,000, 51,500, 162,225. The correction and the hire are not events.
- "orders rows by date then id before comparing": the same rows shuffled give the same events.
- "leaves out the average for a raise that changes currency": a raise whose previous row is INR has `changeBp: null`. `addedBaseMinor` is the difference of the two rows' `amountBaseMinor`.
- "averages raises half away from zero": 333 and 334 give 334; 300 and 500 give 400.
- "sums what raises and promotions added": the person's events give `raiseCount 2, averageRaiseBp 400, raisesAddedBaseMinor 81_500, promotionCount 1, promotionsAddedBaseMinor 162_225, totalAddedBaseMinor 243_725`.
- "has no average without raises": `summariseIncreases([])` gives zeros and `averageRaiseBp: null`.

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/increases domain/trailing-window`
Expected: FAIL.

- [ ] **Step 3: Implement both modules**

The previous row is the row before by `(effectiveDate, id)`, the same order `domain/history-change.ts` uses. An event's country is the row's `countryCode`.

- [ ] **Step 4: Run the tests to see them pass**

Same command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/domain/increases.ts apps/api/src/domain/increases.test.ts apps/api/src/domain/trailing-window.ts apps/api/src/domain/trailing-window.test.ts
git commit -m "feat(api): add raise and promotion figures and the trailing year windows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Payroll trend, payroll change and raises endpoints

**Files:**
- Modify: `apps/api/src/repositories/employees.ts`, `apps/api/src/repositories/salary-history.ts`, `apps/api/src/routes/insights.ts`, `apps/api/src/routes/insights.test.ts`, `packages/shared/src/insights.ts`
- Create: `apps/api/src/services/insights-history.ts`, `apps/api/src/services/insights-history.test.ts`

**Interfaces:**
- Consumes: Tasks 2 and 3; `loadLatestFxRates` (`repositories/fx-rates.ts`); `convert`, `BASE_CURRENCY` (`domain/fx.ts`); `listCountries`, `listDepartments`; `percentChangeBpOrNull`.
- Produces, in `repositories/employees.ts`:

```ts
export function listPayrollEmployees(db: DbHandle): {
  id: number; hireDate: string; status: 'active' | 'inactive'; deactivatedOn: string | null; departmentId: number;
}[]; // every employee, any status
```

  In `repositories/salary-history.ts`:

```ts
export function listAllSalaryHistory(db: DbHandle): {
  id: number; employeeId: number; effectiveDate: string; reason: SalaryHistoryRow['reason'];
  amountMinor: number; currencyCode: string; countryCode: string;
}[]; // ordered by employeeId, effectiveDate, id
```

  In `packages/shared/src/insights.ts`, exported with their inferred types:

```ts
export const PAYROLL_CAUSES = ['hires', 'raises', 'promotions', 'relocations', 'corrections', 'leavers'] as const;
const groupTotalSchema = z.object({ key: z.string(), label: z.string(), headcount: z.number().int(), totalBaseMinor: z.number().int() });
export const payrollTrendResponseSchema = z.object({
  baseCurrency: z.string(),
  asOf: z.string(),
  points: z.array(z.object({
    /** yyyy-12-31, or today for the last point. */
    date: z.string(),
    year: z.number().int(),
    isToday: z.boolean(),
    headcount: z.number().int(),
    totalBaseMinor: z.number().int(),
    byCountry: z.array(groupTotalSchema),
    byDepartment: z.array(groupTotalSchema),
  })),
  summary: z.object({
    totalBaseMinor: z.number().int(),
    yearAgoTotalBaseMinor: z.number().int(),
    /** Null when there was no payroll a year ago. */
    changeBp: z.number().int().nullable(),
    headcount: z.number().int(),
    yearAgoHeadcount: z.number().int(),
  }),
});
export const payrollChangeResponseSchema = z.object({
  baseCurrency: z.string(),
  /** A year ago (exclusive) and today. */
  from: z.string(),
  to: z.string(),
  fromTotalBaseMinor: z.number().int(),
  toTotalBaseMinor: z.number().int(),
  changeBaseMinor: z.number().int(),
  /** All six, in PAYROLL_CAUSES order. */
  causes: z.array(z.object({ cause: z.enum(PAYROLL_CAUSES), amountBaseMinor: z.number().int(), count: z.number().int() })),
  /** The cause with the largest positive amount (the earlier in PAYROLL_CAUSES on a tie); null when none is positive. */
  largestAddition: z.enum(PAYROLL_CAUSES).nullable(),
});
export const increaseStatsSchema = z.object({
  raiseCount: z.number().int(),
  averageRaiseBp: z.number().int().nullable(),
  raisesAddedBaseMinor: z.number().int(),
  promotionCount: z.number().int(),
  promotionsAddedBaseMinor: z.number().int(),
  totalAddedBaseMinor: z.number().int(),
});
const groupIncreaseStatsSchema = increaseStatsSchema.extend({ key: z.string(), label: z.string() });
export const raiseStatsResponseSchema = z.object({
  baseCurrency: z.string(),
  asOf: z.string(),
  years: z.array(z.object({
    year: z.number().int(),
    yearToDate: z.boolean(),
    all: increaseStatsSchema,
    byCountry: z.array(groupIncreaseStatsSchema),
    byDepartment: z.array(groupIncreaseStatsSchema),
  })),
  trailing: z.object({
    current: increaseStatsSchema.extend({ after: z.string(), through: z.string() }),
    previous: increaseStatsSchema.extend({ after: z.string(), through: z.string() }),
  }),
});
```

  In `services/insights-history.ts`:
  - `getPayrollTrend(db, today: string)`;
  - `getPayrollChange(db, today: string)`;
  - `getRaiseStats(db, today: string)`.

  Each returns its response shape.

- [ ] **Step 1: Write the failing service tests** in `insights-history.test.ts`

Use `createTestDb`, plus `createEmployees` and `recordSalaryChange`/`applySalaryChanges` as the other service tests do. Deactivate through the employees service, or by updating `status` and `deactivatedOn` directly as `services/insights.test.ts` does. Today is `2026-01-15`. Tests:
- "plots a point at each year end from the earliest hire year, then today": a hire on `2023-05-01` gives dates `2023-12-31`, `2024-12-31`, `2025-12-31`, `2026-01-15`. The last point has `isToday: true` and `year: 2026`.
- "counts a leaver until their deactivation date": `deactivatedOn` `2025-01-01` is in the 2024 point; `2024-12-31` is not.
- "makes today's point the sum of active employees' current USD pay, by country and department": compare with `listActiveEmployeeRows` sums. Every country and department from the reference tables appears, at zero when empty, in reference order, with labels.
- "converts past pay at today's rates": an INR employee's 2024 point equals `convert(amount, 'INR', 'USD', rates)`.
- "summarises the year against a year ago": `summary.changeBp` equals `percentChangeBpOrNull(yearAgo, now)`. It is null with no payroll a year ago.
- "breaks the last 12 months of payroll change into causes that add up": `changeBaseMinor = toTotal − fromTotal = sum(causes)`, and `from` is `'2025-01-15'`. `largestAddition` is the biggest positive cause, or null when every cause is ≤ 0.
- "reports raises per calendar year from the first increase to this year": a raise in 2023 gives years 2023–2026, the last with `yearToDate: true`, and empty years at zero with `averageRaiseBp: null`. `byCountry` and `byDepartment` have every reference row.
- "compares the last 12 months of raises with the 12 before": a raise on `2025-06-01` is in `current` and one on `2024-06-01` is in `previous`. `current.after` is `'2025-01-15'` and `current.through` is `'2026-01-15'`.

- [ ] **Step 2: Write the failing route tests** in `routes/insights.test.ts`

- `GET /api/insights/payroll-trend`, `/payroll-change` and `/raises` return 200 and parse with their response schemas when logged in, and 401 without a session (one test per path).
- "takes today from the injected clock": with `now` set to `2026-03-10`, `asOf` is `'2026-03-10'`.

- [ ] **Step 3: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- insights-history routes/insights`
Expected: FAIL.

- [ ] **Step 4: Implement the schemas, repositories, service and routes**

- **Loader.** `loadHistoryPeople(db)` (not exported) joins `listPayrollEmployees` with `listAllSalaryHistory` by employee id. It converts each row once with `convert(amountMinor, currencyCode, BASE_CURRENCY, loadLatestFxRates(db))` and returns `PayrollPerson[]`. All three service functions call it once.
- **Trend.**
  - Points run from the earliest hire year to `today`'s year − 1, at `${year}-12-31`, then today.
  - With no employees there is only today's point, at zero.
  - Group keys are the country code and the department id as a string. Labels are the country and department names.
- **Raises.**
  - Years run from the first event's year (or today's year when there is none) to today's year.
  - Group by `event.countryCode` and `event.departmentId`.
  - Trailing figures use `isWithin` with `trailingYear` and `previousTrailingYear`.
- **Routes** call the service with `now().toISOString().slice(0, 10)`, as `/recent-changes` does.
- Export the new schemas and types from `packages/shared/src/index.ts`, if it lists names explicitly.

- [ ] **Step 5: Run the tests to see them pass**

Same command, then `npm test -w @acme/api`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src packages/shared/src
git commit -m "feat(api): add payroll trend, payroll change and raise statistics endpoints

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Attention rules and counts

**Files:**
- Create: `apps/api/src/domain/attention-rules.ts` + test, `apps/api/src/services/attention.ts` + test
- Modify: `apps/api/src/repositories/salary-history.ts`, `apps/api/src/routes/insights.ts`, `apps/api/src/routes/insights.test.ts`, `packages/shared/src/employees.ts`, `packages/shared/src/insights.ts`

**Interfaces:**
- Consumes: `trailingWindowStart`; `computeDistribution`; `percentChangeBp`; `getPeerGroups`, `peerGroupKey`, `peerPosition`; `listActiveEmployeeRows`; `listLevels`.
- Produces, in `packages/shared/src/employees.ts` (before `employeeListQuerySchema`):

```ts
export const ATTENTION_VALUES = ['outlier-above', 'outlier-below', 'no-raise-2y', 'compression'] as const;
export const attentionSchema = z.enum(ATTENTION_VALUES);
export type Attention = z.infer<typeof attentionSchema>;
```

  In `packages/shared/src/insights.ts`:

```ts
export const attentionResponseSchema = z.object({
  asOf: z.string(),
  activeHeadcount: z.number().int(),
  outlierAbove: z.number().int(),
  outlierBelow: z.number().int(),
  /** (above + below) ÷ active headcount, in bp; 0 with no one active. */
  outsidePeerRangeShareBp: z.number().int(),
  noRaise2y: z.number().int(),
  compression: z.object({
    /** Long-tenured people in the flagged groups. */
    peopleCount: z.number().int(),
    groups: z.array(z.object({
      countryCode: z.string(), countryName: z.string(), levelId: z.number().int(), levelCode: z.string(),
      recentCount: z.number().int(), tenuredCount: z.number().int(),
      recentMedianBaseMinor: z.number().int(), tenuredMedianBaseMinor: z.number().int(),
      gapBp: z.number().int(),
    })),
  }),
});
```

  In `domain/attention-rules.ts`:

```ts
export const NO_RAISE_YEARS = 2;
export const RECENT_HIRE_YEARS = 1;
export const LONG_TENURE_YEARS = 3;
export const COMPRESSION_MIN_SUBGROUP = 5;
export const COMPRESSION_MARGIN_BP = 500;
/** True when the last raise or promotion (or, with none, the hire) is before trailingWindowStart(today, NO_RAISE_YEARS). */
export function hasNoRecentIncrease(person: { hireDate: string; lastIncreaseOn: string | null }, today: string): boolean;
export interface CompressionMember { employeeId: number; countryCode: string; levelId: number; hireDate: string; amountBaseMinor: number }
export interface CompressionGroup {
  countryCode: string; levelId: number; recentCount: number; tenuredCount: number;
  recentMedianBaseMinor: number; tenuredMedianBaseMinor: number; gapBp: number;
  tenuredEmployeeIds: number[]; // ascending
}
/** Flagged groups, largest gap first (then country code, then level id). */
export function compressionGroups(members: CompressionMember[], today: string): CompressionGroup[];
```

  In `repositories/salary-history.ts`:

```ts
/** The latest raise or promotion date per employee who has one. */
export function listLastIncreaseDates(db: DbHandle): { employeeId: number; lastIncreaseOn: string }[];
```

  In `services/attention.ts`:

```ts
export type AttentionSets = Record<Attention, number[]>; // ids ascending, active employees only
export function getAttentionSets(db: DbHandle, today: string): AttentionSets;
/** The union of the chosen sets, ascending. */
export function attentionEmployeeIds(sets: AttentionSets, values: readonly Attention[]): number[];
export function getAttention(db: DbHandle, today: string): AttentionResponse;
```

  The route is `GET /api/insights/attention`.

- [ ] **Step 1: Write the failing domain tests** in `attention-rules.test.ts` (today `2026-01-15`)

- "flags a last increase more than 24 months ago": `lastIncreaseOn: '2024-01-14'` is true.
- "does not flag a last increase exactly 24 months ago": `'2024-01-15'` is false.
- "falls back to the hire date when there was never an increase": with `lastIncreaseOn: null`, hire `2024-01-14` is true and hire `2024-01-15` is false.
- "does not flag a recent increase after an old hire": hire `2015-01-01`, last `2025-06-01`, is false.
- "flags a group whose recent hires' median is more than 5% above its long-tenured median":
  - IN level 2 has five recent hires (hired after `2025-01-15`) at 106,000 and five tenured (hired on or before `2023-01-15`) at 100,000;
  - the result is one group with `gapBp: 600` and its five tenured ids;
  - someone hired `2024-06-01` (neither recent nor tenured) is in neither count.
- "does not flag a gap of exactly 5%": 105,000 against 100,000.
- "does not evaluate a group with fewer than 5 recent hires": four at 200,000.
- "treats the boundaries as recent after a year ago and tenured on or before three years ago": hire `2025-01-15` is not recent; hire `2023-01-15` is tenured.
- "orders flagged groups by gap, largest first".

- [ ] **Step 2: Write the failing service and route tests**

`services/attention.test.ts`, using `createEmployees` and recorded changes:
- "splits outside-peer-range people into above and below by the FR-8 rule":
  - set up ten US L1 peers (as `services/insights.test.ts` `addTenPeers` does), one paid far above and one far below;
  - the sets hold exactly those ids;
  - `getAttention` gives `outlierAbove: 1, outlierBelow: 1` and `outsidePeerRangeShareBp` equal to `percentage of 2 in activeHeadcount`, computed as `round_half_away(2 × 10000 ÷ headcount)`.
- "does not evaluate peer groups under the minimum size".
- "lists active employees with no raise or promotion in over two years": a correction or relocation does not reset the clock, and inactive employees are never listed.
- "lists the long-tenured staff of compressed groups and describes each group": the group carries the country name and level code.
- "unions the chosen sets": `attentionEmployeeIds(sets, ['outlier-above', 'no-raise-2y'])` is ascending and has no duplicates.

`routes/insights.test.ts`: `GET /api/insights/attention` returns 200 and parses; 401 without a session.

- [ ] **Step 3: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- attention routes/insights`
Expected: FAIL.

- [ ] **Step 4: Implement**

- `compressionGroups`:
  - recent means `hireDate > trailingWindowStart(today, RECENT_HIRE_YEARS)`;
  - tenured means `hireDate <= trailingWindowStart(today, LONG_TENURE_YEARS)`;
  - each side needs at least `COMPRESSION_MIN_SUBGROUP` people;
  - medians come from `computeDistribution(...).median` in USD;
  - a group is flagged when `recentMedian × 10000 > tenuredMedian × (10000 + COMPRESSION_MARGIN_BP)` (exact BigInt or safe-integer arithmetic);
  - `gapBp = percentChangeBp(tenuredMedian, recentMedian)`.
- `getAttentionSets`:
  - reads `listActiveEmployeeRows` once and `getPeerGroups(db)` once;
  - an outlier comes from `peerPosition(...).outlier`, for groups with a summary;
  - "no raise" uses `listLastIncreaseDates` with `hasNoRecentIncrease`;
  - compression is the union of `tenuredEmployeeIds`.

- [ ] **Step 5: Run the tests to see them pass**

Same command, then `npm test -w @acme/api`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src packages/shared/src
git commit -m "feat(api): add the needs-attention rules and their counts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The attention filter on the list, facets, export and bulk selection

**Files:**
- Modify:
  - `packages/shared/src/employees.ts`, `packages/shared/src/bulk-revision.ts`;
  - `apps/api/src/repositories/employees.ts`;
  - `apps/api/src/services/attention.ts`, `employee-list.ts`, `employee-facets.ts`, `employee-export.ts`, `bulk-revision.ts` and their tests;
  - `apps/api/src/routes/employees.ts`, `apps/api/src/routes/employees.test.ts`, `apps/api/src/routes/bulk-revision.test.ts`, `apps/api/src/routes/employee-export.test.ts`;
  - `apps/web/src/test/fixtures.ts`, plus any web test fixture of the facets response.

**Interfaces:**
- Consumes: Task 5's `attentionSchema`, `getAttentionSets` and `attentionEmployeeIds`.
- Produces:
  - **List query schema.** `employeeListQuerySchema` gains `attention: multiValueParam(attentionSchema)`, and with it the export and facets schemas. `multiValueParam` becomes exported.
  - **Facets response.** `employeeFacetsResponseSchema` gains `attention: z.array(z.object({ value: attentionSchema, count: z.number().int() }))`. It always lists all four values, in `ATTENTION_VALUES` order, zero included.
  - **Bulk filter.** `bulkFilterSchema` gains `attention: z.array(attentionSchema).min(1).max(4).optional()`.
  - **Repository filter.** `EmployeeListFilter` gains `employeeIds?: number[]`: only these ids match, and an empty array matches nobody. It is applied as `employees.id in (select value from json_each(?))` with the ids as one JSON string.
  - **`withAttention`.** `services/attention.ts` adds `withAttention(db: DbHandle, filter: EmployeeListFilter, attention: readonly Attention[] | undefined, today: string): EmployeeListFilter`. It returns `filter` unchanged when `attention` is empty or undefined, and otherwise adds `employeeIds`.
  - **Signatures.**
    - `listEmployees(db, query, today: string)`;
    - `getEmployeeFacets(db, filter: EmployeeListFilter & { attention?: Attention[] }, today: string)`;
    - `exportEmployeesCsv(db, query, today: string, options?)`;
    - `previewBulkRevision(db, input, today: string)`;
    - `summariseBulkRevision(db, input, today: string)`.
  - Routes pass `today()`.

- [ ] **Step 1: Write the failing tests**

`services/employee-list.test.ts`:
- "returns only the people the attention filter names, ANDed with the other filters": use an outlier in US and one in IN with `attention: ['outlier-above', 'outlier-below']` and `country: ['US']`; only the US outlier comes back, and `total` is 1.
- "returns nobody for an attention filter with inactive status".
- "matches nobody when an attention set is empty".

`services/employee-facets.test.ts`:
- "counts each attention value under the search and the other groups' selections": with `country: ['US']`, the attention counts cover US people only.
- "narrows the other groups' counts to the chosen attention values": with `attention: ['no-raise-2y']`, the country counts are the flagged people per country.
- "lists all four attention values, zero included".

`services/employee-export.test.ts`: "exports exactly the rows of an attention-filtered list".

`services/bulk-revision.test.ts`: "previews exactly the active people an attention filter names" (preview with `filter: { attention: ['no-raise-2y'] }`).

`routes/employees.test.ts`:
- "accepts attention as repeated or comma-separated values": `?attention=outlier-above&attention=no-raise-2y` and `?attention=outlier-above,no-raise-2y` give the same body.
- "rejects an unknown attention value with 400".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-list employee-facets employee-export bulk-revision routes/employees`
Expected: FAIL.

- [ ] **Step 3: Implement**

- `getEmployeeFacets` computes `getAttentionSets` once per call.
  - Each of the other groups counts under the filter without its own group, with the attention restriction when the filter has `attention`.
  - Attention counts run once per value: `countEmployeeRows` under the filter without `attention`, with `employeeIds: sets[value]`.
  - `statusTotal` stays the status count with no other filter.
- The list, export and bulk services compute the sets only when `attention` is non-empty.
- Update `apps/web/src/test/fixtures.ts` (and any inline facets fixture) so the web tests still parse responses. The attention entries are `{ value, count: 0 }` for all four.

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test`
Expected: PASS (API and web).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src packages/shared/src apps/web/src/test
git commit -m "feat(api): filter employees by needs-attention values in the list, facets, export and bulk selection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Level bands

**Files:**
- Create: `apps/api/src/domain/level-bands.ts` + test, `apps/api/src/services/level-bands.ts` + test
- Modify: `apps/api/src/routes/insights.ts`, `apps/api/src/routes/insights.test.ts`, `packages/shared/src/insights.ts`

**Interfaces:**
- Consumes: `summarisePeerGroup`, `PeerMember` (`domain/peer-groups.ts`); `listActivePeerAmounts`, `listLevels`, `listCountries`; `notFound` (`errors.ts`); `divideRoundHalfAwayFromZero`.
- Produces, in `packages/shared/src/insights.ts`:

```ts
export const levelBandsQuerySchema = z.object({ country: z.string().min(1) });
export const levelBandsResponseSchema = z.object({
  countryCode: z.string(),
  currencyCode: z.string(),
  levels: z.array(z.object({
    levelId: z.number().int(),
    levelCode: z.string(),
    headcount: z.number().int(),
    /** Local minor units; null under the peer-group minimum or with no one paid in the local currency. */
    typical: z.object({ p25: z.number().int(), median: z.number().int(), p75: z.number().int() }).nullable(),
    /** This median ÷ the level below's median × 10,000 (16,900 = 1.69×); null without both. */
    stepFromBelowBp: z.number().int().nullable(),
    /** Local-currency members paid above the next level's median; null without both bands. */
    aboveNextMedianCount: z.number().int().nullable(),
    aboveNextMedianShareBp: z.number().int().nullable(),
  })),
  summary: z.object({
    stepRange: z.object({ minBp: z.number().int(), maxBp: z.number().int() }).nullable(),
    largestOverlap: z.object({ levelCode: z.string(), nextLevelCode: z.string(), shareBp: z.number().int(), count: z.number().int() }).nullable(),
    widestSpread: z.object({ levelCode: z.string(), spreadBp: z.number().int() }).nullable(),
  }),
});
```

  In `domain/level-bands.ts`:

```ts
export function levelBands(
  levels: { levelId: number; levelCode: string; rank: number }[],
  members: (PeerMember & { levelId: number })[],
  currencyCode: string,
): Omit<LevelBandsResponse, 'countryCode' | 'currencyCode'>;
```

  The service is `getLevelBands(db, countryCode: string)`. It throws `notFound('COUNTRY_NOT_FOUND', …)` for an unknown code. The route is `GET /api/insights/level-bands?country=`.

- [ ] **Step 1: Write the failing domain tests** (currency `INR`, `amountBaseMinor` equal to `amountMinor`)

Inputs:
- L1 has ten members: 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 2500, 2600.
- L2 has ten members: 2000 to 2900 in steps of 100.
- L3 has four members.

Tests:
- "gives each level its typical range from the peer-group summary": L1 is `{ p25: 1225, median: 1450, p75: 1675 }` and L2 is `{ 2225, 2450, 2675 }`.
- "computes the step from the level below": L2 `stepFromBelowBp` is 16897 (2450 × 10000 ÷ 1450, half away from zero), and L1's is null.
- "counts people above the next level's median": L1 is count 2, share 2000; L2 is null, because L3 has no band.
- "leaves a level under ten people without a band or step": L3 has `typical: null`, `stepFromBelowBp: null` and headcount 4.
- "summarises the step range, the largest overlap and the widest spread":
  - `stepRange { 16897, 16897 }`;
  - `largestOverlap { L1, L2, 2000, 2 }`;
  - `widestSpread { L1, 3103 }`, where `(1675 − 1225) × 10000 ÷ 1450` is 3103.
- "has no summary figures when no level has a band": all null.
- "lists every level in rank order, empty ones at headcount 0".

- [ ] **Step 2: Write the failing service and route tests**

- "reads the country's active employees in its own currency": a relocated member paid in USD counts in the headcount but not in the local range.
- "rejects an unknown country with 404".
- Route: 200 plus schema parse, 400 without `country`, 401 without a session.

- [ ] **Step 3: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- level-bands routes/insights`
Expected: FAIL.

- [ ] **Step 4: Implement**

- "Next" and "below" are the adjacent levels by `rank` in the full level list.
- A step, overlap or spread is computed only when both bands it needs exist. `largestOverlap` considers only shares above zero.
- Ties go to the lower rank.
- `spreadBp = round_half_away((p75 − p25) × 10000 ÷ median)`.

- [ ] **Step 5: Run the tests to see them pass**

Same command, then `npm test -w @acme/api`. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src packages/shared/src
git commit -m "feat(api): add level bands per country with steps, overlap and spread

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Recent changes by range, year and reason

**Files:**
- Modify:
  - `packages/shared/src/insights.ts`;
  - `apps/api/src/repositories/salary-history.ts`;
  - `apps/api/src/services/recent-changes.ts` + test;
  - `apps/api/src/routes/insights.ts` + test;
  - `apps/api/src/perf/measure-latency.ts`;
  - `apps/web/src/features/insights/use-insights.ts`, `recent-changes-panel.tsx`, `insights-page.test.tsx`.

**Interfaces:**
- Produces:

```ts
export const RECENT_CHANGE_RANGES = ['3y', '5y', '10y', 'all'] as const;
export const recentChangesQuerySchema = z.object({
  range: z.enum(RECENT_CHANGE_RANGES).default('3y'),
  /** A calendar year; overrides the range. */
  year: z.coerce.number().int().min(1900).max(9999).optional(),
  reason: multiValueParam(z.enum(['hire', 'raise', 'promotion', 'relocation', 'correction'])),
  limit: …, offset: …, // unchanged
});
export const recentChangesResponseSchema = z.object({
  range: z.enum(RECENT_CHANGE_RANGES),
  year: z.number().int().nullable(),
  /** Inclusive; null for all time. */
  windowStart: z.string().nullable(),
  windowEnd: z.string(),
  /** Calendar years with at least one change, newest first. */
  availableYears: z.array(z.number().int()),
  total: …, limit: …, offset: …, items: …, // unchanged
});
```

  - `listChangeEntries(db, window: { from: string | null; to: string }, page, reasons?: SalaryHistoryRow['reason'][])`.
  - `listChangeYears(db): number[]`.
  - `getRecentChanges(db, { today, range, year?, reason?, limit, offset })`.
- The window:
  - with `year`: from `${year}-01-01` to the earlier of `${year}-12-31` and today;
  - `3y` / `5y` / `10y`: `trailingWindowStart(today, n)` to today;
  - `all`: no start, to today.

  A window whose start is after its end has no entries.

- [ ] **Step 1: Write the failing tests** (service, today `2026-01-15`)

- "keeps a change dated 4 years ago out of 3y and in 5y" (the existing test, updated).
- "includes a change dated 9 years ago in 10y and every change in all", with `windowStart: null` for `all`.
- "limits a year to its calendar dates up to today": changes on `2024-12-31` and `2025-01-01` with `year: 2024` give just the first. `windowEnd` is `'2024-12-31'`, and for `year: 2026` it is `'2026-01-15'`.
- "filters by reason and keeps a bulk revision as one entry": with `reason: ['raise']`, a batch of three raises is one entry and a promotion is left out.
- "lists the years that have changes, newest first".
- "returns no entries for a year without changes".

Route: "accepts repeated reason values and rejects an unknown range with 400".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- recent-changes routes/insights`
Expected: FAIL.

- [ ] **Step 3: Implement the API**

- `listChangeEntries` builds its condition from an optional `gte` start, an `lte` end, and an `inArray(reason)` when reasons are given.
- `listChangeYears` is `select distinct cast(substr(effective_date, 1, 4) as integer) … order by 1 desc`.
- In the perf script, replace `?years=5` with `?range=5y`.

- [ ] **Step 4: Keep the current web panel working**

`useRecentChanges(range: '3y' | '5y', offset, limit)` sends `range=`. The panel's segmented values become `'3y'` and `'5y'`, with labels unchanged. Update `insights-page.test.tsx`'s stub to the new response fields and request URL. Task 12 replaces this panel.

- [ ] **Step 5: Run the tests to see them pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src packages/shared/src apps/web/src/features/insights
git commit -m "feat(api): filter recent changes by range, calendar year and reason

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: "Needs attention" on the Employees list

**Files:**
- Create: `apps/web/src/features/employees/attention-labels.ts`
- Modify: `apps/web/src/features/employees/list-filters.ts`, `list-filters.test.ts`, `employee-filter-panel.tsx`, `employee-filter-panel.test.tsx`, `employees-page.test.tsx` (if it asserts the chip set)

**Interfaces:**
- Consumes: `Attention`, `ATTENTION_VALUES` (shared); facets `attention` (Task 6).
- Produces:

```ts
// attention-labels.ts
export const ATTENTION_LABELS: Record<Attention, string> = {
  'outlier-above': 'Paid above peer range',
  'outlier-below': 'Paid below peer range',
  'no-raise-2y': 'No raise in over 2 years',
  compression: 'Paid less than new hires',
};
```

  - `ListFilters` gains `attention: Attention[]` (default `[]`), read and written as a repeated `attention` param like `country`.
  - `listApiQuery`, `facetsApiQuery`, `exportHref` and `bulkFilterFrom` all carry it.
  - `filterChips` adds one chip per attention value, after the levels and before status, labelled with `ATTENTION_LABELS`.
  - `activeFilterCount` counts the values.
  - Insights links use `/employees?attention=outlier-above&attention=outlier-below`, `/employees?attention=no-raise-2y` and `/employees?attention=compression`.

- [ ] **Step 1: Write the failing tests**

`list-filters.test.ts`:
- "reads repeated and comma-separated attention values and drops unknown ones": `?attention=no-raise-2y,bogus&attention=compression` gives `['no-raise-2y', 'compression']`.
- "writes attention values back as repeated params".
- "sends attention to the list, facets and export queries".
- "includes attention in the bulk filter".
- "makes a chip per attention value": `Remove filter No raise in over 2 years` drops only that value.

`employee-filter-panel.test.tsx`:
- "shows a Needs attention group with a count per option": the facets fixture `no-raise-2y` count 381 shows as "381".
- "ticking an option reports the new attention selection".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- list-filters employee-filter-panel`
Expected: FAIL.

- [ ] **Step 3: Implement**

The panel adds `<CheckboxGroup legend="Needs attention" …>` last, with options in `ATTENTION_VALUES` order and counts from `facets.attention`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/employees
git commit -m "feat(web): add the Needs attention filter group to the employee list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Insights page shell, chart card, headline tiles and the two payroll cards

**Files:**
- Create:
  - `apps/web/src/components/ui/chart-card.tsx` + `chart-card.test.tsx`;
  - `apps/web/src/features/insights/answers.ts` + `answers.test.ts`;
  - `apps/web/src/features/insights/chart-data.ts` (replacing the existing file) + test;
  - `headline-tiles.tsx`, `payroll-trend-card.tsx`, `payroll-change-card.tsx`.
- Modify:
  - `apps/web/src/app/globals.css` (series tokens);
  - `apps/web/src/features/insights/use-insights.ts`, `insights-page.tsx`, `insights-page.test.tsx`.

**Interfaces:**
- Consumes: the Task 4 and Task 5 schemas; `StatTile`, `SegmentedControl`, `Skeleton`, `Button`; `formatMoneyCompact`, `formatMoney`, `formatPercentageBp`, `formatSignedMoney` (`lib/money.ts`); `formatDate`, `useFxAsOfLabel`.
- Produces:

```tsx
// components/ui/chart-card.tsx
export function ChartCard(props: {
  question: string;                 // shown as an 11px uppercase section label; also the card's accessible name
  answer?: ReactNode;               // the sentence; a skeleton line while undefined and no error
  controls?: ReactNode;
  caption?: string;
  table?: ReactNode;                // when given, the header shows a "View as table" / "View as chart" toggle (aria-pressed)
  action?: { href: string; label: string };
  error?: { message: string; onRetry: () => void };
  pending?: boolean;                // axis-shaped chart skeleton
  children?: ReactNode;             // the chart
  footer?: ReactNode;
}): JSX.Element;
export function ChartSkeleton(...); export function RowsSkeleton(...); // moved from features/insights/panel.tsx, which re-exports them until Task 12 deletes it
```

  Hooks in `use-insights.ts`:
  - `usePayrollTrend()`;
  - `usePayrollChange()`;
  - `useRaiseStats()`;
  - `useAttention()`;
  - `useLevelBands(country: string)`;
  - `useRecentChanges(params: { range, year?, reason?, offset, limit })`.

  The last replaces Task 8's signature, and Task 12 updates its caller.

  In `chart-data.ts`:

```ts
export type YearRange = '3y' | '5y' | '10y' | 'all';
export const RANGE_OPTIONS: { value: YearRange; label: string }[]; // 3Y, 5Y, 10Y, All
/** Year-end points of the last N years plus today ('all' keeps every point). */
export function trendPointsInRange<T extends { year: number; isToday: boolean }>(points: T[], range: YearRange): T[];
/** This year and the N − 1 before it ('all' keeps every year). */
export function yearsInRange<T extends { year: number }>(years: T[], range: YearRange, currentYear: number): T[];
```

  In `answers.ts` (pure; every number is formatted from an API figure):

```ts
export function payrollTrendAnswer(summary: PayrollTrend['summary']): string;
export function payrollChangeAnswer(change: PayrollChange): string;
export const CAUSE_LABELS: Record<PayrollCause, string>; // New hires, Raises, Promotions, Relocations, Corrections, People who left
export function changeVsYearAgo(changeBp: number | null): string;              // tile hints
export function countVsYearAgo(current: number, previous: number): string;
export function averageRaiseVsBefore(current: number | null, previous: number | null): string;
export function countVsBefore(current: number, previous: number): string;
```

- [ ] **Step 1: Write the failing tests**

`answers.test.ts` (exact strings):

- `payrollTrendAnswer`:
  - `{ totalBaseMinor: 61_240_000_000, changeBp: 620, headcount: 9577, yearAgoHeadcount: 9265, … }` → "Payroll is $612.4M a year, up 6.2% on 12 months ago, with 312 more people."
  - A fall of 120 bp with 40 fewer people → "Payroll is $612.4M a year, down 1.2% on 12 months ago, with 40 fewer people."
  - Change 0 and the same headcount → "Payroll is $612.4M a year, the same as 12 months ago, with the same headcount."
  - `changeBp: null` → "Payroll is $612.4M a year."
- `payrollChangeAnswer`:
  - `changeBaseMinor: 2_410_000_000`, `largestAddition: 'raises'` (raises 1,520,000,000) → "Payroll rose $24.1M in the last 12 months. Raises added the most: $15.2M."
  - A negative change → "Payroll fell $3.2M in the last 12 months." plus the cause sentence when one is positive.
  - A change of 0 and `largestAddition: null` → "Payroll is the same as 12 months ago."
- Tile hints:
  - `changeVsYearAgo`: 620 → "↑ 6.2% vs 12 months ago"; −120 → "↓ 1.2% vs 12 months ago"; 0 → "No change vs 12 months ago"; null → "—".
  - `countVsYearAgo(9577, 9265)` → "↑ 312 vs 12 months ago".
  - `averageRaiseVsBefore`: (440, 460) → "↓ from 4.6% the 12 months before"; (460, 460) → "Same as the 12 months before"; (440, null) → "No raises the 12 months before"; (null, 460) → "No raises in the last 12 months".
  - `countVsBefore(412, 380)` → "↑ from 380 the 12 months before".

`chart-data.test.ts`:
- `trendPointsInRange` with year ends 2016–2025 plus today 2026: `'3y'` gives 2023, 2024, 2025 and today.
- `yearsInRange` with 2017–2026 and current year 2026: `'3y'` gives 2024–2026; `'all'` keeps every year.

`chart-card.test.tsx`:
- "names the card by its question and shows the answer".
- "toggles between the chart and the table": the button reads "View as table", `aria-pressed=false`; after a click the table shows and the button reads "View as chart".
- "shows the error with a retry".
- "shows the action link".

`insights-page.test.tsx` (rewrite the stubs for the new endpoints):
- "shows the meta line with the FX date and the constant-currency note".
- "shows the five headline tiles with their values and hints": "$612.4M", "9,577", "4.4%", "412", "187" and "1.95% of active employees".
- "answers how payroll is changing and shows the year table": after clicking "View as table" in that card, the table has a "Today" row whose payroll matches the trend's last point. With Group set to Country, there is a column per country.
- "answers what added to payroll with a row per cause in the table".
- "shows a retry in a card whose request failed, leaving the others".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- answers chart-data chart-card insights-page`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **Tokens.** `globals.css` adds `--series-1` … `--series-7` with the Task 1 values, and `--color-series-N` theme entries like `--color-series-secondary`.
- **Page.** `InsightsPage` renders the `canvas` background, the title and the meta line. The meta line is "Active employees · USD at FX rates of <date> · Past years use the same rates", with the date from `useFxAsOfDate` formatted by `formatDate`. Then come `HeadlineTiles`, then a `md:grid-cols-2` grid of cards.
- **Payroll trend card.**
  - Recharts `BarChart`: Total is one `accent` bar series; grouped, one stacked `Bar` per country or department with `fill="var(--series-N)"` in reference order, a 2px gap and a legend. The x labels are the year, or "Today".
  - The headcount strip is a separate 64px `LineChart` with the same categories, no y-axis, and the value in the tooltip.
  - Axis styling follows the history chart (`var(--text-secondary)` ticks at 11px, `var(--border)` axis lines).
- **Payroll change card.** A horizontal `BarChart` (`layout="vertical"`) with a zero reference line, signed amount labels (`formatSignedMoney` with compact formatting via `formatMoneyCompact` for the label text), and bars in `accent`.
- **Remaining cards.** Until Tasks 11–12, the page keeps rendering the existing distribution, outliers and recent changes panels below the new cards.

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): rebuild the insights header with headline tiles and the payroll question cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Raises, level bands with the full breakdown, and the attention card

**Files:**
- Create: `apps/web/src/features/insights/raises-card.tsx`, `level-bands-card.tsx`, `full-breakdown.tsx`, `attention-card.tsx`
- Modify: `apps/web/src/features/insights/answers.ts` + test, `insights-page.tsx` + test

**Interfaces:**
- Consumes: Task 10's `ChartCard`, hooks, `yearsInRange`, `RANGE_OPTIONS`; `useCountries`; `useDistribution` (existing).
- Produces:
  - `RaisesCard({ onSelectYear }: { onSelectYear: (year: number) => void })`.
  - `InsightsPage` holds `changesYear: number | null`, for Task 12.
  - In `answers.ts`:

```ts
export function raisesAnswer(trailing: RaiseStats['trailing']): string;
export function levelBandsAnswer(bands: LevelBands, countryName: string): string;
export function attentionAnswer(attention: AttentionResponse): string;
/** 13,500 → "1.35×", 16,000 → "1.6×". */
export function formatRatioBp(bp: number): string;
```

- [ ] **Step 1: Write the failing tests**

`answers.test.ts`:

- `raisesAnswer`:
  - current 440, previous 460, current `totalAddedBaseMinor` 2_610_000_000 → "Raises in the last 12 months averaged 4.4%, down from 4.6% the 12 months before. Raises and promotions added $26.1M to annual payroll."
  - Up → "…, up from 4.2% the 12 months before. …"
  - Equal → "…, the same as the 12 months before. …"
  - Previous null → "Raises in the last 12 months averaged 4.4%. …"
  - Current null → "No raises in the last 12 months."
  - The second sentence is left out when `totalAddedBaseMinor` is 0.
- `levelBandsAnswer`:
  - `stepRange { 13500, 14000 }`, `largestOverlap { L2, L3, 1234, 40 }`, `widestSpread { L5 }` → "Each level pays 1.35–1.4× the one below. 12.34% of L2s earn more than the typical L3. Pay varies most within L5."
  - Equal steps → "Each level pays 1.4× the one below." and so on.
  - No overlap → that sentence is left out.
  - `stepRange: null` → "Too few people in Germany to compare levels."
- `attentionAnswer`:
  - above 142, below 45, no raise 381, two groups → "187 people are paid outside their peer range and 381 have had no raise in over 2 years. In 2 country and level groups, new hires are paid more than long-tenured staff."
  - One of each → "1 person is paid outside their peer range and 1 has had no raise in over 2 years. In 1 country and level group, new hires are paid more than long-tenured staff."
  - No groups → the second sentence is left out.
- `formatRatioBp`: 13500 → "1.35×", 16000 → "1.6×", 16897 → "1.69×".

`insights-page.test.tsx`:
- "answers the raises question and switches to the cost view": "Show" is set to "$ cost"; the caption changes to the cost caption.
- "selects a year from the raises table": clicking "Show changes in 2024" (the table's button) calls the recent-changes request with `year=2024` once Task 12's card exists. Until then, assert `onSelectYear` through the page state. Task 12 extends this test.
- "shows level bands for the chosen country with a level too small to band": a level with `typical: null` reads "Too few people". Choosing "Germany" requests `/api/insights/level-bands?country=DE`.
- "opens the full breakdown with plain column names":
  - the button "Full breakdown" has `aria-expanded=false`, then true after a click;
  - the column headers are exactly: Group, People, Lowest, Bottom quarter earn under, Typical pay (median), Average, Top quarter earn over, Top 10% earn over, Highest;
  - Group set to Level requests `groupBy=level`.
- "links each attention row to the filtered employee list":
  - "Outside peer range" → `/employees?attention=outlier-above&attention=outlier-below`;
  - "No raise in over 2 years" → `/employees?attention=no-raise-2y`;
  - "Paid less than new hires" → `/employees?attention=compression`;
  - its meaning lists "India L2, India L3".
  - A zero count has no link.
- "shows the outside-peer-range tile in the warning colour only when above zero".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- answers insights-page`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **Raises card.**
  - Average %, All: a `LineChart` of `averageRaiseBp ÷ 100` used only as a plotting coordinate, with labels and tooltips formatted by `formatPercentageBp`, and a 64px count strip.
  - Average %, grouped: one line per group in `var(--series-N)` with a legend.
  - $ cost: stacked `BarChart`; All uses `raisesAddedBaseMinor` (`series-1`) and `promotionsAddedBaseMinor` (`series-2`), and grouped uses `totalAddedBaseMinor` per group.
  - Chart clicks use Recharts `onClick` with `activeLabel` to call `onSelectYear`.
  - The table rows are Year ("2026 (YTD)" for `yearToDate`), Raises, Average raise, Added by raises, Added by promotions, and a "Show changes in <year>" button.
- **Level bands card.**
  - The country control is a `SegmentedControl` labelled "Country" over `useCountries()`, defaulting to the first country.
  - The chart draws each level's row as a floating bar from `p25` to `p75` (`var(--series-secondary)`) with a median tick (`var(--accent)`) and the median formatted in local currency. A Recharts range bar plus a custom shape, or plain positioned elements on a shared scale, are both acceptable, provided there are labelled axes and the median label.
  - `FullBreakdown` sits in the card's `footer`.
- **Attention card.** It uses `ChartCard` with no chart or table, and the three rows as children.
- **Page.** It now renders the raises, level bands and attention cards. It drops `DistributionPanel` and `OutliersPanel`. The recent changes panel stays until Task 12.

- [ ] **Step 4: Run the tests to see them pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): add the raises, level bands and needs-attention insight cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Recent changes card, the salary changes page, and removing the superseded panels and endpoints

**Files:**
- Create:
  - `apps/web/src/features/insights/change-entry.tsx`, `recent-changes-card.tsx`;
  - `apps/web/src/features/insights/changes-page.tsx` + `changes-page.test.tsx`;
  - `apps/web/src/app/(app)/insights/changes/page.tsx`.
- Modify: `apps/web/src/features/insights/insights-page.tsx` + test, `use-insights.ts`, `answers.ts` + test.
- Delete: `apps/web/src/features/insights/distribution-panel.tsx`, `outliers-panel.tsx`, `payroll-panel.tsx`, `recent-changes-panel.tsx`, `panel.tsx` (whatever is still unused).
- API: remove `GET /api/insights/payroll` and `/outliers`.
  - Delete `getPayroll` and `getOutliers` from `services/insights.ts`, and their tests. Move any FR-8 case not already covered into `services/attention.test.ts`.
  - Remove the route handlers and route tests.
  - Remove the shared schemas `payrollQuerySchema`, `payrollResponseSchema`, `outlierSchema` and `outliersResponseSchema`, and their types.
  - Remove the perf script URLs.
- Docs: `docs/architecture.md` §5 and §7, if Task 1's text still names the removed endpoints anywhere.

**Interfaces:**
- Consumes: Task 8's response, Task 10's `useRecentChanges`, Task 11's `changesYear`.
- Produces:
  - `RecentChangesCard({ year, onClearYear }: { year: number | null; onClearYear: () => void })`;
  - `ChangesPage()`;
  - in `answers.ts`, `recentChangesAnswer(total: number, filter: { year: number | null; range: YearRange }): string`.

- [ ] **Step 1: Write the failing tests**

`answers.test.ts`, for `recentChangesAnswer`:
- (1234, `{ year: null, range: '3y' }`) → "1,234 changes in the last 3 years."
- (1, `{ year: 2024 }`) → "1 change took effect in 2024."
- (0, `{ year: 2024 }`) → "No salary changes match these filters."
- (n, `{ range: 'all' }`) → "1,234 changes in all."

`insights-page.test.tsx`:
- "shows the five latest changes with a bulk revision as one row": "1,233 people · +3.57% · Annual increment 2026" and the "Bulk revision" badge. An inactive employee is marked "Inactive". It requests `range=3y&limit=5&offset=0`.
- "sets the recent changes card to a year chosen in the raises card and clears it with the chip": after "Show changes in 2024", the request has `year=2024` and the chip "Remove year 2024" shows. Clicking it brings back `range=3y`.
- "links to the full list of changes": "See all changes →" points to `/insights/changes`, or `/insights/changes?year=2024` with a year.

`changes-page.test.tsx` (a mocked `next/navigation` router and search params, as the employees page tests do):
- "reads range, reason, year and page from the URL and asks for them": `?range=5y&reason=promotion&page=2` requests `range=5y&reason=promotion&limit=25&offset=25`.
- "defaults to the last 3 years".
- "replaces the range with the chosen year": "Year" set to 2024 shows "In 2024" with "Clear year", and the URL gains `year=2024` and drops `page`.
- "pages through the changes with the shared pagination": "26–50 of 1,234".
- "offers the years that have changes": the "Year" options are "Any year" then the response's `availableYears`.
- "shows the empty state with a way back": "No salary changes match these filters." and "Clear filters" resets to the bare `/insights/changes`.
- "keeps the Insights link active": the top bar's active state uses `startsWith('/insights')` (already true), so no test is needed if the existing top-bar test covers prefixes. Otherwise, add one.

API: remove the deleted endpoints' tests, and add "returns 404 for the removed payroll and outliers endpoints".

- [ ] **Step 2: Run the tests to see them fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- answers insights-page changes-page`
Expected: FAIL.

- [ ] **Step 3: Implement**

- **`ChangeEntry`.** Move it from `recent-changes-panel.tsx` to `change-entry.tsx` unchanged, except that the bulk row text is `${people} · +${pct} · ${note}`, as today.
- **Recent changes card.** Its answer comes from `recentChangesAnswer`, and its chip uses the shared `Chip` with remove label "Remove year 2024".
- **Changes page.**
  - Layout: `canvas`, a back link to `/insights`, the controls, the list, then `Pagination` from `components/pagination.tsx` with `pageSize` 25 and no size options.
  - The "Reason" and "Year" selects are native `<select>` elements with visible labels, styled like the pagination's select.
  - URL updates use `router.replace` with the same query helpers pattern as the employees page. Changing any filter drops `page`.

- [ ] **Step 4: Run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src apps/api/src packages/shared/src docs
git commit -m "feat(web): add the recent changes card and the salary changes page, and drop the superseded insights panels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Measure the new endpoints and reconcile the docs

**Files:**
- Modify: `apps/api/src/perf/measure-latency.ts`, `docs/performance.md`, and any of `docs/architecture.md`, `docs/design.md` or `docs/requirements.md` whose text no longer matches the code

**Interfaces:**
- Consumes: every endpoint from Tasks 4–8.

- [ ] **Step 1: Add the perf cases**

Add these to `GET_URLS`:
- `/api/insights/payroll-trend`;
- `/api/insights/payroll-change`;
- `/api/insights/raises`;
- `/api/insights/level-bands?country=IN`;
- `/api/insights/attention`;
- `/api/insights/recent-changes?range=all`;
- `/api/insights/recent-changes?year=2024&reason=raise`;
- `/api/employees?attention=no-raise-2y`;
- `/api/employees/facets?attention=compression`.

- [ ] **Step 2: Measure on a scratch database**

Run from the repo root, following the perf recipe in `docs/performance.md`:

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && cd apps/api && DATABASE_PATH=./data/perf.db npm run db:seed && DATABASE_PATH=./data/perf.db npm run perf:latency; rm -f ./data/perf.db*
```

If `db:seed` or `perf:latency` take their path differently, use the way the existing perf recipe states. Never touch `data/app.db`.

Expected: every list and insights endpoint has p95 under 300 ms. If a history endpoint exceeds it, stop and report the figures rather than tuning blind.

- [ ] **Step 3: Update `docs/performance.md`**

- Replace the rows for the removed endpoints with the new rows, and refresh every row measured in this run.
- Update the date, and the method paragraph's list of re-run rows.
- Re-measure the full test-suite runtime (median of 3 `npm test` runs) and update its row with the new test counts.

- [ ] **Step 4: Reconcile the docs with the code**

Reread `docs/architecture.md` §5, §7 and §8, `docs/design.md` §5 (Insights and Salary changes page) and the new requirements against the implemented names, copy and behaviour. Fix any drift in the doc, or in the code where the doc is the decided behaviour. Reread every line this phase added to `docs/` (`git diff 3ff4a48 -- docs`) against the wording rule.

Expected: the docs describe what the code does, and no added line breaks the wording rule.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all PASS.

```bash
git add apps/api/src/perf docs
git commit -m "docs: measure the insights endpoints and the attention filter

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
