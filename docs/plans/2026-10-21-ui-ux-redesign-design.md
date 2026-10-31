# UI/UX Redesign: Design

Date: 2026-10-21. Status: draft for approval.

## 1. Intent

The app works, but it looks and behaves like a first draft. Every screen is plain text on white with identical boxes, the important numbers hide in small grey subtitles, and the HR Manager has to infer everything from grids. That makes it no more useful than the spreadsheet it replaces.

The redesign has two aims:

1. **Look clean, modern and intuitive**, in a single consistent style across every screen.
2. **Help the HR Manager interpret the data, not just display it.** The Insights page answers the questions leadership actually asks about pay, in sentences, with charts as evidence and a link to act on each answer. A chart that only shows numbers someone must decode, such as the current box-plot with p25/p75 labels, fails this aim even if it is accurate.

## 2. Goals, non-goals, anti-goals

**Goals**

- One visual style ("Refined classic", §4) applied to every screen: login, Insights, Employees, the employee drawer and bulk revision.
- Employees list: a collapsible left filter panel with multi-select checkboxes and counts, filter chips, every column sortable, column visibility and page size, built on TanStack Table.
- Employee drawer: salary pre-filled with quick-% buttons and a live before/after comparison, peer context, tabs, and a salary history chart with a 3Y / 5Y / 10Y / All range.
- Insights rebuilt around leadership's questions: headline numbers with year-over-year change, payroll trend, what drove payroll growth, raises over time, pay by level, and "who needs attention" cards that open a filtered employee list.
- Bulk revision as its own screen, with setup and live review side by side and cost shown before confirming.
- Seed data realistic enough that every insight shows something meaningful (§10).
- Fix the export menu scroll-lock bug.

**Non-goals**

- Dark mode.
- A separate mobile build. The responsive rules carry over (§11).
- New personas, roles or permissions.
- Market salary benchmarks, gender pay analysis or performance-linked pay. The data needed doesn't exist, and `docs/requirements.md` §4 deliberately leaves demographic analysis out.
- Excel import.
- E2E tests (`AGENTS.md`).

**Anti-goals.** The work fails, even if it technically works, if:

- A chart needs statistical vocabulary (p25, IQR, percentile) to be understood at first glance. That vocabulary may appear only as a secondary hint, such as a small "median" under "Typical pay".
- An insight shows a number without saying what it means, or offers no way to act on it.
- Any insight shows an empty or zero state on the seeded demo data because the seed lacks the pattern.
- The UI looks like a marketing site. The login panel carries no pitch copy (§9).
- Rules in `AGENTS.md` are bypassed, such as browser-side currency conversion or money rounding, or unpaginated lists.

## 3. Constraints

All of `AGENTS.md` applies. The points this work leans on most:

- **`docs/design.md` is binding, so update it first.** This redesign contradicts it in several places: the inline filter row, the box-plot distribution chart, the list-only salary changes view, and the 3/5-year window. The first commit of each phase updates `docs/design.md` (and `docs/requirements.md`, `docs/architecture.md`, `docs/decisions.md` where affected) before code changes. Decisions go in `docs/decisions.md` in its existing "Alternatives considered / Chosen / Why" form.
- Layering stays `routes -> services -> repositories`; new calculations are pure functions in `domain/` with injected clock.
- The browser never converts currencies or rounds money. Integer subtraction or summing within one currency is fine (existing decision). Anything else, such as a % applied to a salary or a USD equivalent, comes from the API.
- Lists stay server-side paginated and sorted. 10,000 rows today, designed for 100,000+.
- Insights read active employees only, except where history is the point (§8).
- Performance target unchanged: list and insights endpoints p95 < 300 ms locally on the full seed. Re-measure and update `docs/performance.md`.
- Repository docs read as a real product's docs.
- Each new dependency is added with a stated reason (§12).

## 4. Visual language: "Refined classic"

Chosen from three mockups. It keeps today's top bar and blue accent, made tighter and more deliberate, and stays dense like a spreadsheet.

- **Palette.** The existing tokens in `docs/design.md` §2 stay, including the blue-700 accent that is never used for "pay went up". Additions:
  - a page canvas of `#F9FAFB` on Insights, behind white cards;
  - light accent tints (`#EFF6FF` fill, `#BFDBFE` border) for selected chips and filter state;
  - a light-blue secondary chart series (`#93C5FD`);
  - a purple series colour for promotions on history charts. Verify it meets the AA rule like the other tokens.
  No gradients.
- **Top bar.** App mark (small blue square) plus name, nav links whose active state is a 2px blue underline (not a filled pill), user menu on the right.
- **Typography.** Inter, tabular numbers everywhere a number appears. Headline numbers are large (about 22px, weight 650). The answer sentences on Insights are about 15px, weight 600.
- **Shape.** 4px radius on controls, 6px on cards. Unchanged.
- **People and places.**
  - People get an initials avatar.
  - Countries show flag + full name, not just the code.
  - Levels are a small outlined badge.
  - Local salary is the main figure, with the USD equivalent in small grey text beside it (omitted when the currency is already USD).
- **Every screen** is built from the same small set of parts: card, headline number tile, segmented control, chip, checkbox group, data table and chart card. Don't improvise new ones per screen.

## 5. Employees list

Layout: top bar, then a left filter panel and the main area (title row, toolbar, table, pagination).

**Filter panel (left, collapsible)**

- Groups: Status, Country, Department, Level, plus a "Needs attention" group (§8.6). Each option is a checkbox with a count.
- Multi-select within a group (for example India + Germany), AND across groups.
- Status options are Active and Inactive. Ticking both means all, ticking neither means the default (active).
- *Builder's call:* counts reflect the current search and the *other* groups' selections (standard faceted counts), so they show how many rows ticking an option would give.
- The panel collapses to give the table full width. The collapsed state is remembered per browser.
- Filter state lives in the URL as today. Multi-values are repeated query params or comma lists.
- **Below `md`:** the panel opens as a bottom sheet from a "Filters (n)" button, as today.

**Toolbar**

- Search box (debounced, as today).
- Active filters as removable chips (`India ×`, `L3 ×`) plus "Clear all".
- Result count ("2,914 of 9,577").
- "Columns" menu to show or hide columns.
- Export split button and "New employee" in the title row.

**Table (TanStack Table, headless)**

- Server-side sorting and pagination (`manualSorting`, `manualPagination`). TanStack holds column definitions, sort state, column visibility and row selection. It is not used for client-side data processing.
- Columns:
  - Employee: avatar, name, and job title in grey.
  - Department.
  - Level badge.
  - Country: flag and name.
  - Hired.
  - Salary: local amount, with the USD amount beside it.
- **Every column is sortable**: name, job title, department, level (by rank), country, hire date and salary (by USD).
- Sort indicators on every header, with the active one in accent blue.
- Page size: 25, 50 or 100. Default 50, matching `DEFAULT_PAGE_SIZE`.
- Clicking anywhere on a row opens the drawer. The checkbox cell and name link keep their own behaviour. Keyboard access is kept.
- Inactive rows keep the inactive colour and badge.
- Bulk selection behaves as today ("N selected · Select all N matching · Clear · Apply % increase"), restyled. "Apply % increase" now opens the bulk revision screen (§7).

**Export.** It stays a split button. Fix: the Radix dropdown currently runs in modal mode, which locks page scroll and removes the scrollbar (shifting the layout 15px) while it is open. Make the menu non-modal. Audit every other dropdown for the same problem.

**API changes**

- `country`, `department` and `level` accept multiple values on `GET /api/employees` and the export endpoint. The bulk preview filter does too, since it shares the schema.
- `sortBy` gains `jobTitle`, `department`, `level` and `country`.
- A facet-counts endpoint, for example `GET /api/employees/facets?<same filters>`.
- The "Needs attention" filter values (§8.6).
- Any new sort keys need indexes so the < 300 ms target holds.

## 6. Employee drawer

Opens from the right over the list, as today (full-screen below `md`). The full-page fallback route renders the same component.

**Header**

- Avatar, name, and "Job title · Department · Level · flag Country".
- Close button. Deactivate and Reactivate move into a "⋯" menu.

**Summary strip**

- Current salary (large), its USD equivalent, and "since <date>".
- Peer context: the typical range (middle half) and median for same-country, same-level active peers, in local currency. The same peer definition as outliers.
- If the person is an outlier, say so in words ("Above the usual range for India L3").

**Tabs:** Change salary (default for active employees), Details, History (n). Inactive employees default to Details, and Change salary shows the existing "reactivate first" message.

**Change salary**

- Reason is a segmented control: Raise | Promotion | Relocation | Correction.
- **Fields per reason.**
  - Promotion adds the higher-level picker.
  - Relocation adds the country picker and keeps the converted pre-fill and its FX note.
  - Correction adds the optional level.
- **Amount field.**
  - Pre-filled with the current salary, except relocation, which is pre-filled with the converted amount.
  - Quick-% buttons under it: Raise +3 / +5 / +10 / +15%, Promotion +10 / +15 / +20%, plus "Custom %".
  - Typing an amount by hand highlights Custom.
  - The proposed amount for a % comes from the API using the domain's rounding. Reuse the bulk preview with one employee id, or add a small endpoint. The browser does not multiply money.
- **Live comparison box:** current, new and change. The change is integer subtraction in local currency, plus % and USD per year from the API. Add one line of peer context, such as "Still inside the typical range for India L3".
- Effective date defaults to today and can't be in the future, as today.
- The submit button names the action ("Record raise"). Add a Reset.
- Validation rules unchanged. A raise still must exceed the current amount, and the pre-filled current amount must not pass as a raise.

**History tab**

- **Step chart of salary over time.** Each change is a dot coloured by reason. Promotions are labelled with the new level and % jump.
- Range 3Y / 5Y / 10Y / All (All = since hire).
- Above the chart: "<hire amount> → <current amount> since hire (+x%)", and counts of promotions and raises.
- Below the chart: average yearly growth, biggest jump, time since last change.
- *Builder's call:* if the employee was relocated, plot in USD for continuity and say so. Otherwise use local currency.
- Below that, the full change list with the % change on every row, and bulk changes marked.

**Details tab:** the existing inline-edit fields, restyled.

## 7. Bulk revision

Becomes a dedicated screen (its own route under `/employees`), not a panel replacing the list. A step indicator reads Choose people ✓ → Set increase & review → Confirm, with "← Back to employees" that keeps the list's filters.

**Left column: setup**

- *Who:* headcount ("1,010 people, active only"), the filter chips that produced the selection, and a breakdown by department.
- *Increase:* % input with quick buttons 3 / 4 / 5 / 8 / 10%.
- Effective date.
- Note (shown in history).
- A reminder of the last bulk revision (date, %, note, headcount).

**Right column: live review**

- **Headline tiles:**
  - Added to annual payroll: per currency when mixed, plus a USD total.
  - Typical pay after vs before.
  - Rows overridden.
  - People already outside their peer range.
- **Table:** employee, department, current, new salary, change %.
  - New salary is an editable, properly formatted cell. Today it shows raw `1982182.62`.
  - Overridden cells are highlighted with an "edited · undo" tag.
- Search, plus "All / Overridden (n) / Outside peer range (n)" quick filters. Paginated with overrides kept across pages, as today.

**Footer**

- "Nothing is saved until you confirm…" and Cancel.
- "Review & confirm N changes →" opens a confirmation dialog summarising: % applied, N people, effective date, annual cost.

**After confirming:** a success state with links to the Employees list and Insights. The 409 stale-preview behaviour is unchanged: toast, reload, keep overrides for unaffected rows.

**API changes**

- The preview response adds each row's USD current and proposed amounts and an outside-peer-range flag.
- **The tiles follow overrides live (my call).** A server-side summary endpoint takes the selection, the %, and the current overrides, and returns the tile figures: added payroll per currency and in USD, typical pay before and after, and the overridden count. The page re-posts to it, debounced, after each edit. The browser never converts an overridden amount itself.
- These changes supersede the "bulk-revision total shown per currency" decision; update that entry.

Below `md`: the setup stacks above the review, and the review becomes stacked editable rows (as `docs/design.md` §7 says today).

## 8. Insights

Page structure: title, a meta line ("Active employees · USD at FX rates of <date>"), a row of headline tiles, then question cards on a two-column grid that becomes one column below `md`.

**Every question card follows the same pattern:**

1. The question as a small uppercase label ("WHAT ARE WE GIVING IN RAISES?").
2. **The answer as a plain-English sentence** built from the data ("This year's average raise, 3.8%, is the lowest in five years.").
3. The chart as evidence, with a one-line caption saying what it plots.
4. Where it applies, a link to act ("View these people →") that opens the Employees list with the matching filters.
5. *Builder's call:* a "View as table" toggle per chart, for accessibility and for users who prefer the numbers.

The API returns the figures each sentence needs, such as growth %, ratios and counts. The frontend fills sentence templates and formats them; it does not compute the figures. *Builder's call:* exact wording and template variants, such as how to phrase a rise versus a fall.

**Conversion rule for trends: constant currency.** Historical amounts convert to USD at the current static FX rates, so trends show real pay changes rather than currency movements. Record this in `docs/decisions.md` and show it in the meta line.

### 8.1 Headline tiles

**Time windows (my call):** tiles and answer sentences use trailing 12-month windows, compared with the 12 months before that. They never use a partial calendar year. This avoids partial-year comparisons, such as promotions always "falling" in March. It also means the seed's yearly increment cycle at `referenceDate − 60 days` always falls inside the current window. Charts by year (§8.2, §8.4) use calendar years, with the current year labelled "year to date".

Each tile is compared with the same point a year ago (year-over-year):

- **Annual payroll:** USD, with % change vs 12 months ago.
- **Active headcount:** with change vs 12 months ago.
- **Average raise, last 12 months:** vs the 12 months before. Raise reason only, same-currency rows only.
- **Promotions, last 12 months:** vs the 12 months before.
- **Paid outside peer range:** count and % of active employees.

Arrows and colours: up/down arrows always paired with the word or number. Positive and negative colours apply only where direction has a clear meaning for pay. Payroll growth is neutral information, not "good".

### 8.2 How is payroll changing? (replaces the payroll-by-country and payroll-by-department charts)

- Payroll at each year end, plus today, as bars, with a headcount line. Segmented control: Total | Country | Department, where the last two are stacked bars.
- Range: 3Y / 5Y / 10Y / All.
- **The current year's bar is FR-9's "payroll by country and department".** Keep those exact totals available in "View as table".
- Payroll at a past date includes employees hired on or before that date and not yet deactivated, each at the salary in force on that date. This needs `deactivated_on` (§10).

### 8.3 What added to payroll in the last 12 months?

- Horizontal bars by cause: new hires, raises, promotions, relocations, corrections, and people who left (negative).
- **Acceptance rule:** the parts sum exactly to payroll today minus payroll 12 months ago, as defined in §8.2. Test it as a domain property.
- Example answer: "New hires added more than raises and promotions combined."

### 8.4 What are we giving in raises? (also absorbs the yearly cost chart)

- Per year:
  - average raise % (raise reason, same currency);
  - number of raises;
  - payroll added by raises and by promotions (USD, constant currency).
  These are per calendar year. The current year is marked "year to date", and the answer sentence uses the trailing 12-month figure (§8.1).
- A switch between **Average %** (line, with count bars behind it) and **$ cost** (stacked bars: raises and promotions).
- Range: 3Y / 5Y / 10Y / All.
- Segmented: All | Country | Department.
- Clicking a year sets the "What changed recently?" card (§8.7) to that year.

### 8.5 Do levels mean consistent pay? (replaces the distribution box-plot)

- A country picker, since pay is only comparable within one currency. For each level, a bar spans where the middle half of people sit, a tick marks typical pay, and the median is labelled. Local currency.
- Example answers: the pay step between adjacent levels ("each level pays 1.6–1.8× the one below"); whether levels overlap ("38% of L2s earn more than the typical L3"); and the level with the widest spread.
- **FR-6 is preserved:** a "Full breakdown" expander underneath shows the distribution statistics table by country, department or level. Its columns use plain names: People, Lowest, Bottom quarter earn under, Typical pay *(median)*, Average, Top quarter earn over, Top 10% earn over, Highest.

### 8.6 Who needs attention?

Three action cards. Each has a count, a one-line meaning, and a link to the Employees list filtered by the matching "Needs attention" value (§5):

- **Outside peer range.** The existing FR-8 rule (Tukey fences, country + level, minimum group of 10), split into above and below.
- **No raise in over 2 years.** Active employees whose latest increase (a raise or promotion) took effect more than 24 months ago, or who were hired more than 24 months ago and never had one.
- **New hires paid more than long-tenured peers.** Country + level groups where the median current pay of people hired in the last 12 months exceeds that of people with 3+ years' tenure. *Builder's call:* a minimum of 5 in each subgroup. The filter returns the long-tenured people in those groups, since they are the ones at risk.

The thresholds (24 months, 12 months, 3 years, 5 people) are product rules. Put them in one place in `domain/` and record them in `docs/decisions.md`.

The outliers table is no longer on the Insights page. "Review outliers →" opens the Employees list with the outlier filter. The peer range and direction show in the drawer (§6).

### 8.7 What changed recently? (FR-10)

- A card listing the latest 5 changes, plus "See all changes →". Bulk revisions show as one row ("1,233 people · +3.57% · Annual increment 2026").
- **"See all" goes to a full page** with the paginated list, range 3Y / 5Y / 10Y / All (default 3Y), a reason filter, and the year filter from §8.4.
- Inactive employees stay included and marked, as today.

**API.** New or changed insights endpoints for: headline tiles, payroll trend, payroll change by cause, raise statistics by year, level bands per country, attention counts, and the range and year parameters on recent changes. *Builder's call:* exact endpoint shapes and whether to merge some of them.

## 9. Login

- **Left (about 55%):** dark navy panel (`#0B1F4D`, solid, no gradient) with only the app mark and name at the top and a faint bar-chart pattern in one corner. **No headline, pitch or feature list.**
- **Right:** "Sign in", a short subline, email, password with a Show/Hide toggle, a full-width Sign in button, and the small note "Sessions last a working day."
- Below `md`: the panel collapses to a slim header band with the logo, and the form fills the screen.
- This is the only dark surface in the app. State it as an exception in `docs/design.md`.

## 10. Seed data and data model

**Data model**

- Add `employees.deactivated_on` (date, nullable).
- Deactivate sets it to today (injected clock); reactivate clears it.
- **Existing databases are wiped and re-seeded, not upgraded in place** (decided by the repository owner; every database is demo data). Add a reset command, such as `npm run db:reset -w @acme/api`, that drops the data, migrates and re-seeds. Document it in the README. The boot-time seed stays a no-op when employees exist. There is no `updated_at` backfill and no automatic wipe.

**Seed changes.** Keep `seed({ rngSeed, referenceDate })`, so output stays deterministic and relative to the reference date.

- **Full history from the hire date.** One company-wide increment cycle per year as bulk revisions, for the full 10-year span, not just the last 5. Today someone hired in 2017 shows flat pay until 2022.
- **Skipped raises.** About 3–5% of active employees miss increments for 2+ years, so "no raise in over 2 years" has real people.
- **Pay compression.** A few country + level groups where recent hires come in above long-tenured staff, so the compression card is non-empty.
- **Realistic promotions.** 10–20% uplift. Today it is about 50%.
- **Deactivations.** Spread over time, each with a `deactivated_on` date.
- **Keep the existing properties:** about 1–2% outliers, and the FR-12 acceptance criteria. Add seed tests asserting each new pattern exists in the expected proportion.
- Re-measure seed time in `docs/performance.md`. History grows from about 40–50k rows to roughly double.

## 11. Responsive

`docs/design.md` §7 rules carry over with these mappings:

- the filter panel becomes a bottom sheet;
- the drawer is full-screen;
- Insights cards stack;
- bulk revision stacks setup above review;
- tables become compact rows where they already do;
- touch targets stay at least 44px.

## 12. Dependencies

- `@tanstack/react-table`: headless table state (sorting, visibility, selection) for the employee and bulk review tables. Requested explicitly, and it removes hand-rolled header and selection logic.
- Country flags: *Builder's call.* A small SVG flag package such as `country-flag-icons`, because emoji flags don't render on Windows. Fall back to the country code when a flag is missing.
- Recharts stays for charts.

## 13. Documents to update

- `docs/design.md`: rewrite §2–§7 for this design.
- `docs/requirements.md`:
  - FR-1: multi-select filters, all sort keys, attention filters.
  - FR-6: delivered via §8.5.
  - FR-9: delivered via §8.2.
  - FR-10: 3/5/10/All, plus the all-changes page.
  - New FRs for payroll trend, payroll change by cause, raise statistics, level bands, attention cards and the per-employee history chart.
  - Acceptance criteria for each.
- `docs/architecture.md`: §2 (`deactivated_on`), §5 (new insight calculations), §6 (seed), §7 (API), §8 (routes: bulk revision screen, all-changes page).
- `docs/decisions.md`: new entries for left filter panel vs inline, multi-select, TanStack Table, constant-currency trends, attention thresholds, `deactivated_on` and its backfill, the history ranges, the login panel, and seed realism. Update the bulk-total entry.
- `docs/performance.md`: re-measured numbers.

## 14. Phasing

Each phase ships on its own, with its doc updates first and tests alongside:

1. **Style and Employees:**
   - visual language and top bar;
   - login;
   - export fix;
   - filter panel, multi-select, facets and sorting (API and UI);
   - TanStack table;
   - drawer with salary quick-% and peer context.
   The history chart comes in phase 3, once history exists back to hire.
2. **Bulk revision screen**, including the preview API additions.
3. **Seed and data model:** `deactivated_on`, full history, skipped raises, compression, promotion uplift, deactivation dates. Then the drawer history chart.
4. **Insights rebuild:** §8 in full, the attention filters on the Employees list, and the all-changes page.

## 15. Current state worth knowing

- The working tree has uncommitted changes to `apps/web/src/features/insights/distribution-panel.tsx` (a layout-matched skeleton), `use-insights.ts` (`keepPreviousData`) and `docs/design.md` (skeleton wording). Phase 4 replaces the distribution panel, so **drop these changes** before phase 1 starts (decided by the repository owner).
- Mockups from the design conversation are in `.superpowers/brainstorm/` (not committed; add `.superpowers/` to `.gitignore`).
