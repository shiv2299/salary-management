# Employee Salary Management: Requirements

## 1. Overview

Replace ACME's Excel-based salary management for 10,000 employees across multiple countries with a web application. The system lets an HR Manager maintain salary data reliably and answer "how do we pay people?" without building spreadsheets by hand.

## 2. User

**HR Manager** — the only persona. Today they maintain employee and salary data in Excel and manually build pivot tables to answer compensation questions for leadership. The application succeeds if it lets them manage employee/salary records directly and answer those questions on demand, without spreadsheet work.

## 3. Functional Requirements

### Employee records

- **FR-1**: Maintain a searchable, filterable, sortable, paginated list of employees (server-side). Search matches the term anywhere in an employee's full name, email, or job title (substring, case-insensitive), not just at the start. Sorting by salary compares amounts in the base currency, so employees paid in different currencies sort correctly against each other. The country, department, and level filters each accept several values (OR within a filter, AND across filters), and each option shows how many employees match it under the search and the other groups' selections. The list sorts by name, job title, department, level (by rank), country, hire date, or salary. The list shows active employees by default; the status filter can switch to inactive or all. A "Needs attention" filter selects active employees paid outside their peer range (above or below), with no raise or promotion in over 24 months, or paid less than recent hires in their country and level (FR-18). It combines with the other filters like any group, and applies to export and bulk selection.
- **FR-2**: Create, edit, deactivate (soft delete), and reactivate employee records. Deactivation preserves salary history; employees are never hard-deleted. Country and level are not edited directly — they change only through a relocation or promotion (FR-3), because both affect pay. Deactivating records the date it happened; reactivating clears it.

### Compensation

- **FR-3**: Record salary as effective-dated history, not a mutable snapshot — so past pay is never lost. Each change has exactly one reason:
  - **hire** — the initial salary, created with the employee.
  - **raise** — a pay increase with no change of level.
  - **promotion** — a move to a higher level together with its new salary, recorded as one change.
  - **relocation** — a move to another country. The new salary is in the new country's currency; the form pre-fills it with the current salary converted at the static FX rate, and the HR Manager can change it before saving.
  - **correction** — fixes a previously entered amount (and, if it was wrong, the level).

  Effective dates cannot be in the future. Changes cannot be recorded for an inactive employee.
- **FR-4**: Apply a salary revision to a group of employees at once (a filtered selection, e.g. "all L3 Engineers in India") as a single percentage increase, with the option to hand-override the computed amount for any individual employee before confirming. This reflects how revisions actually happen (a few times a year, across many people at once), not one employee at a time. Only active employees are included; each resulting change has reason **raise**. Before confirming, the HR Manager sees what the revision adds to annual payroll (per currency and in USD), the typical pay before and after, and who is already outside their peer range.
- **FR-5**: Export employee and salary data as CSV, with two options: **export current result** (exactly the rows matching the list's current search and filters) or **export all** (every employee, active and inactive, with a status column).
- **FR-13**: Show each employee's pay over time since hire as a step chart, with a 3, 5 or 10-year or all-time range, the change since hire, the counts of promotions and raises, average yearly growth, the biggest increase and the time since the last change. An employee whose pay moved between currencies is shown in USD at the static FX rates.

### Insights (the HR Manager's core compensation questions)

Insights about the present cover **active employees only** — deactivated employees are no longer paid, so including them would overstate payroll and distort pay bands. Insights built from history (FR-14..FR-16 and the salary changes list) also include employees who have since left, for the time they were paid.

- **FR-6**: Show pay distribution (headcount, min, max, mean, median, p25/p75/p90) by country, department, and level. Shown as the "Full breakdown" under the level bands (FR-17).
- **FR-7**: Compare pay across countries in a single base currency, using a static FX table.
- **FR-8**: Flag employees whose current pay is a statistical outlier against same-country, same-level peers. Counted and filtered through FR-18.
- **FR-9**: Show total payroll cost by country and by department. Shown as today's point of the payroll trend (FR-14).
- **FR-10**: Show salary changes newest first: the latest five on Insights, and every change on a paginated page with a range of 3, 5 or 10 years or all time (default 3), a reason filter and a calendar-year filter. Each shows who, what changed (from → to), why, and when it took effect. A change counts by the date it took effect, not the date it was typed in. Changes applied together as one bulk revision (FR-4) are shown as one grouped entry. The list is historical, so it also includes changes for employees who have since been deactivated (marked as inactive).
- **FR-14**: Show annual payroll at each calendar year end and today, with headcount, in total or by country or department, over 3, 5 or 10 years or all time. Past payrolls count everyone employed on that date at the pay then in force, converted at today's FX rates (constant currency).
- **FR-15**: Show what changed annual payroll over the last 12 months, by cause: new hires, raises, promotions, relocations, corrections and people who left. The parts add up exactly to the change.
- **FR-16**: Show raises per calendar year: the average raise %, the number of raises, and the payroll added by raises and by promotions, in total or by country or department, with the last 12 months against the 12 before.
- **FR-17**: For one country at a time, show each level's typical pay and middle half in local currency, the pay step from the level below, how many people earn more than the typical pay of the level above, and the level with the widest spread.
- **FR-18**: Count and list the active employees who need attention: paid outside their peer range (FR-8, split above and below); no raise or promotion in over 24 months (or hired over 24 months ago with none); and long-tenured staff (3+ years) in country + level groups where the median pay of people hired in the last 12 months is more than 5% above theirs (at least 5 people on each side), listing only those paid less than that recent-hire median.

### Access

- **FR-11**: The single HR user authenticates (login) before accessing any employee or insights data. A login lasts a working day and survives page refreshes, new tabs, and bookmarked URLs.

### Data

- **FR-12**: Seed the system with a 10,000-employee dataset spanning 3 countries, 7 departments, and 6 levels, for development, testing, and demo purposes. Given the same RNG seed and the same reference date, the seed produces identical data; salary-change dates are generated relative to the reference date (today when the app seeds itself, a fixed date in tests), so every view has realistic data across the full 10-year span: a yearly company-wide increment cycle recorded as bulk revisions from the earliest hire onward, individual raises, promotions of 10–20% and relocations, a few people whose raises stopped more than two years ago, a few country + level groups where recent hires are paid more than long-tenured staff, and leavers deactivated on dates spread over the years.

## 4. Deliberately Left Out

| Item | Why excluded |
|---|---|
| Payroll processing, tax, payslips | A different, compliance-heavy problem with its own regulatory requirements per country. |
| Bonus, allowances, equity | Base pay only keeps the data model and statistics unambiguous. The schema stores a single amount per salary record, leaving room to add components later without a redesign. |
| Live FX rates | A static, dated FX table keeps conversions deterministic and removes an external dependency and failure mode. |
| Role-based access control / SSO / multi-user | One persona only. If country/department-restricted access is ever needed, it belongs in the service layer as a scope applied to every repository query; nothing is pre-built for it now. |
| Future-dated salary changes | Changes take effect on or before the day they're entered. Supporting scheduled changes would mean "current salary" depends on the date it's read, which the denormalized current-salary design deliberately avoids (`docs/decisions.md`). |
| Excel import | The seed script supplies the data, so import isn't required to use the app. It's the natural first follow-up, and would reuse the same service-layer bulk-create function the seed script already uses. |
| Org chart / reporting hierarchy | None of the FR-6..FR-10 or FR-14..FR-18 insights require it, and a believable reporting tree in seed data adds complexity with no analytical payoff here. |
| Approval workflows and notifications | State machines that don't serve any requirement above. |
| Demographic pay-equity analysis (e.g. by gender) | Sensitive data that needs a policy decision outside the scope of this product. |

## 5. Assumptions

Product decisions that shape the scope above, and the choice made for each. The reasoning behind the less obvious ones is in `docs/decisions.md`.

- Salary means annual base pay only (no bonus/equity/allowances).
- Cross-country comparison uses a static, dated FX table, converting to a common base currency (USD) for insights. Outlier peer groups stay within one country (see `docs/decisions.md`).
- Full effective-dated salary history is tracked, not just a current snapshot.
- Insights trends convert past pay at today's static FX rates, so they show changes in pay rather than in exchange rates.
- FR-6..FR-10 and FR-14..FR-18 are the product's own answer to "what should HR be able to ask," chosen as the compensation questions an HR Manager most often has to answer for leadership.
- Single HR user; no role/country/department-based access restriction.
- No Excel import; CSV export only.

## 6. Non-Functional Requirements

- **Correctness**: core calculations (money arithmetic and rounding, FX conversion, distribution statistics, outlier detection, bulk-revision amounts, seed data generation) have unit tests.
- **Performance**: list and insights endpoints respond in under 300 ms (p95, measured locally) on the full 10,000-row dataset. Actual numbers are recorded in `docs/performance.md`.
- **Data integrity**: monetary amounts are stored as integer minor units with an ISO currency code, never floats; salary history is append-only.
- **Measured, not estimated**: seed time and full test-suite runtime are measured and recorded in `docs/performance.md`.
- **Scalability**: the system is built and measured for 10,000 employees, and designed so it can grow to 100,000+ without a rework — see `docs/architecture.md` §12. The data model and the list, detail and distribution reads hold at that size as they are; the history-based insights and the attention lists would first need the cache described there. This is an architectural property, not something demonstrated with a 100k seed in this build.
- **UI/UX**: the interface follows `docs/design.md` — a single, binding reference so the visual and interaction design stays consistent regardless of which session or tool implements a given screen.

## 7. Acceptance Criteria

Each FR is done when the behavior below is covered by tests at the layer named in `docs/architecture.md` §10.

| FR | Accepted when |
|---|---|
| FR-1 | Searching "ann" matches "Joanne", "ann@acme.test", and "Channel Manager"; salary sort places a $90,000 employee above a ₹50,00,000 one (≈ $60,000); inactive employees are hidden unless the status filter includes them. Filtering by India and Germany at L3 returns exactly the L3 employees of both countries; sorting by level orders by rank; each filter option's count equals the rows that option alone matches under the search and the other groups' selections. Filtering by "No raise in over 2 years" and India returns exactly the flagged Indian employees, export returns the same rows, and each attention option's count follows the other groups' selections. |
| FR-2 | A deactivated employee keeps their full salary history, disappears from the default list and from insights about the present (level bands, attention), while insights built from history keep the pay they were paid, and can be reactivated. Editing country or level directly is rejected. Deactivating on 1 Feb 2026 records that date, deactivating again while inactive keeps it, and reactivating clears it. |
| FR-3 | A promotion that doesn't raise the level is rejected; a relocation stores the new salary in the new country's currency and updates the employee's country in the same transaction; a future effective date is rejected; a correction dated the same day as the row it fixes becomes the current salary. |
| FR-4 | Confirming a 7% revision for N previewed employees writes exactly N rows sharing one batch, applies overrides exactly as entered, and is rejected entirely (no rows written) if any employee's salary changed after the preview. The added payroll shown before confirming equals, per currency, the sum of new minus current amounts including hand edits, and its USD total equals each currency's sum converted once at the documented rate. |
| FR-5 | "Export current result" returns exactly the rows the list currently matches (all pages); "export all" includes inactive employees with a status column. |
| FR-6 | Distribution stats for a fixed fixture match hand-computed values, including interpolated percentiles. |
| FR-7 | Every insights figure is in USD, converted with the documented rate and rounding rule. |
| FR-8 | A fixture employee outside the peer group's IQR fences is flagged; one inside is not; peer groups under the minimum size are not evaluated. |
| FR-9 | Payroll totals per group equal the sum of the group's current USD salaries. |
| FR-10 | A bulk revision appears as one entry with headcount and percentage; a change dated 4 years ago appears with the 5-year range but not the 3-year one; the year 2024 returns only changes effective in 2024; the reason "promotion" returns only promotions. |
| FR-11 | Every data endpoint returns 401 without a valid session; a page refresh keeps the user logged in. |
| FR-12 | Two seed runs with the same RNG seed and reference date produce byte-identical data; ~1–2% of employees fall outside their peer-group fences; 3–5% of active employees have had no raise or promotion for over two years; every promotion raises pay by 10–20%; recent hires out-earn long-tenured peers in each planted country + level group and in at most five groups in all; every inactive employee has a deactivation date after their last salary change. |
| FR-13 | For an employee hired at $100,000.00 on 22 Oct 2016 and paid $148,024.43 on 22 Oct 2026, the change since hire is +48.02% and average yearly growth +4%; a relocated employee's summary and chart are in USD; an employee with only the hire row has no growth figures. |
| FR-14 | Payroll on a date counts someone deactivated on 1 Jan 2025 in the 2024 year end but not someone deactivated on 31 Dec 2024; a relocated employee counts under their country of the time; today's point equals the sum of active employees' current USD pay, per country and department (FR-9). |
| FR-15 | Over generated histories the six causes always sum to payroll today minus payroll a year ago; a raise from $100,000 to $110,000 adds $10,000 to raises; a leaver paid $70,000 takes $70,000 off. |
| FR-16 | Raises of 3% and 5% in one year average 4%; a raise that changes currency counts in the number and the payroll added but not the average; promotions add the USD difference each one made. |
| FR-17 | For L1 and L2 medians of 1,450 and 2,450, the step is 1.69×; two of ten L1s above the L2 median is a 20% overlap; a level under 10 people has no band and breaks no step. |
| FR-18 | A last raise 24 months and a day ago is flagged and exactly 24 months ago is not; a group whose recent hires' median is 6% above its long-tenured median is flagged and lists its long-tenured staff paid less than the recent hires' median (not those at or above it), 5% is not, and 4 recent hires is not evaluated; the outside-peer-range counts equal the FR-8 rule. |
