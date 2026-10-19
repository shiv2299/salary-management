# Employee Salary Management: Requirements

## 1. Overview

Replace ACME's Excel-based salary management for 10,000 employees across multiple countries with a web application. The system lets an HR Manager maintain salary data reliably and answer "how do we pay people?" without building spreadsheets by hand.

## 2. User

**HR Manager** — the only persona. Today they maintain employee and salary data in Excel and manually build pivot tables to answer compensation questions for leadership. The application succeeds if it lets them manage employee/salary records directly and answer those questions on demand, without spreadsheet work.

## 3. Functional Requirements

### Employee records

- **FR-1**: Maintain a searchable, filterable, sortable, paginated list of employees (server-side). Search matches the term anywhere in an employee's full name, email, or job title (substring, case-insensitive), not just at the start. Sorting by salary compares amounts in the base currency, so employees paid in different currencies sort correctly against each other. The list shows active employees by default; the status filter can switch to inactive or all.
- **FR-2**: Create, edit, deactivate (soft delete), and reactivate employee records. Deactivation preserves salary history; employees are never hard-deleted. Country and level are not edited directly — they change only through a relocation or promotion (FR-3), because both affect pay.

### Compensation

- **FR-3**: Record salary as effective-dated history, not a mutable snapshot — so past pay is never lost. Each change has exactly one reason:
  - **hire** — the initial salary, created with the employee.
  - **raise** — a pay increase with no change of level.
  - **promotion** — a move to a higher level together with its new salary, recorded as one change.
  - **relocation** — a move to another country. The new salary is in the new country's currency; the form pre-fills it with the current salary converted at the static FX rate, and the HR Manager can change it before saving.
  - **correction** — fixes a previously entered amount (and, if it was wrong, the level).

  Effective dates cannot be in the future. Changes cannot be recorded for an inactive employee.
- **FR-4**: Apply a salary revision to a group of employees at once (a filtered selection, e.g. "all L3 Engineers in India") as a single percentage increase, with the option to hand-override the computed amount for any individual employee before confirming. This reflects how revisions actually happen (a few times a year, across many people at once), not one employee at a time. Only active employees are included; each resulting change has reason **raise**.
- **FR-5**: Export employee and salary data as CSV, with two options: **export current result** (exactly the rows matching the list's current search and filters) or **export all** (every employee, active and inactive, with a status column).

### Insights (the HR Manager's core compensation questions)

All insights cover **active employees only** — deactivated employees are no longer paid, so including them would overstate payroll and distort pay bands.

- **FR-6**: Show pay distribution (headcount, min, max, mean, median, p25/p75/p90) by country, department, and level.
- **FR-7**: Compare pay across countries in a single base currency, using a static FX table.
- **FR-8**: Flag employees whose current pay is a statistical outlier against same-country, same-level peers.
- **FR-9**: Show total payroll cost by country and by department.
- **FR-10**: Show salary changes that took effect in the last 3 or 5 years (the HR Manager picks; default 3), newest first: who, what changed (from → to), why, and when it took effect. A change counts as "recent" by the date it took effect, not the date it was typed in. Changes applied together as one bulk revision (FR-4) are shown as a single grouped entry, not one row per employee. This list is historical, so it also includes changes for employees who have since been deactivated (marked as inactive).

### Access

- **FR-11**: The single HR user authenticates (login) before accessing any employee or insights data. A login lasts a working day and survives page refreshes, new tabs, and bookmarked URLs.

### Data

- **FR-12**: Seed the system with a 10,000-employee dataset spanning 3 countries, 7 departments, and 6 levels, for development, testing, and demo purposes. Given the same RNG seed and the same reference date, the seed produces identical data; salary-change dates are generated relative to the reference date (today when the app seeds itself, a fixed date in tests), so the salary-changes view always has realistic data spread across the full 5-year window, including a yearly company-wide increment cycle recorded as bulk revisions.

## 4. Deliberately Left Out

| Item | Why excluded |
|---|---|
| Payroll processing, tax, payslips | A different, compliance-heavy problem with its own regulatory requirements per country. |
| Bonus, allowances, equity | Base pay only keeps the data model and statistics unambiguous. The schema stores a single amount per salary record, leaving room to add components later without a redesign. |
| Live FX rates | A static, dated FX table keeps conversions deterministic and removes an external dependency and failure mode. |
| Role-based access control / SSO / multi-user | One persona only. If country/department-restricted access is ever needed, it belongs in the service layer as a scope applied to every repository query; nothing is pre-built for it now. |
| Future-dated salary changes | Changes take effect on or before the day they're entered. Supporting scheduled changes would mean "current salary" depends on the date it's read, which the denormalized current-salary design deliberately avoids (`docs/decisions.md`). |
| Excel import | The seed script supplies the data, so import isn't required to use the app. It's the natural first follow-up, and would reuse the same service-layer bulk-create function the seed script already uses. |
| Org chart / reporting hierarchy | None of the FR-6..FR-10 insights require it, and a believable reporting tree in seed data adds complexity with no analytical payoff here. |
| Approval workflows and notifications | State machines that don't serve any requirement above. |
| Demographic pay-equity analysis (e.g. by gender) | Sensitive data that needs a policy decision outside the scope of this product. |

## 5. Assumptions

Product decisions that shape the scope above, and the choice made for each. The reasoning behind the less obvious ones is in `docs/decisions.md`.

- Salary means annual base pay only (no bonus/equity/allowances).
- Cross-country comparison uses a static, dated FX table, converting to a common base currency (USD) for insights. Outlier peer groups stay within one country (see `docs/decisions.md`).
- Full effective-dated salary history is tracked, not just a current snapshot.
- FR-6..FR-10 are the product's own answer to "what should HR be able to ask," chosen as the compensation questions an HR Manager most often has to answer for leadership.
- Single HR user; no role/country/department-based access restriction.
- No Excel import; CSV export only.

## 6. Non-Functional Requirements

- **Correctness**: core calculations (money arithmetic and rounding, FX conversion, distribution statistics, outlier detection, bulk-revision amounts, seed data generation) have unit tests.
- **Performance**: list and insights endpoints respond in under 300 ms (p95, measured locally) on the full 10,000-row dataset. Actual numbers are recorded in `docs/performance.md`.
- **Data integrity**: monetary amounts are stored as integer minor units with an ISO currency code, never floats; salary history is append-only.
- **Measured, not estimated**: seed time and full test-suite runtime are measured and recorded in `docs/performance.md`.
- **Scalability**: the data model and query patterns are designed to hold up at 100,000+ employees, not just the seeded 10,000 — see `docs/architecture.md` §12. This is an architectural property, not something demonstrated with a 100k seed in the submitted build.
- **UI/UX**: the interface follows `docs/design.md` — a single, binding reference so the visual and interaction design stays consistent regardless of which session or tool implements a given screen.

## 7. Acceptance Criteria

Each FR is done when the behavior below is covered by tests at the layer named in `docs/architecture.md` §10.

| FR | Accepted when |
|---|---|
| FR-1 | Searching "ann" matches "Joanne", "ann@acme.test", and "Channel Manager"; salary sort places a $90,000 employee above a ₹50,00,000 one (≈ $60,000); inactive employees are hidden unless the status filter includes them. |
| FR-2 | A deactivated employee keeps their full salary history, disappears from the default list and from insights, and can be reactivated. Editing country or level directly is rejected. |
| FR-3 | A promotion that doesn't raise the level is rejected; a relocation stores the new salary in the new country's currency and updates the employee's country in the same transaction; a future effective date is rejected; a correction dated the same day as the row it fixes becomes the current salary. |
| FR-4 | Confirming a 7% revision for N previewed employees writes exactly N rows sharing one batch, applies overrides exactly as entered, and is rejected entirely (no rows written) if any employee's salary changed after the preview. |
| FR-5 | "Export current result" returns exactly the rows the list currently matches (all pages); "export all" includes inactive employees with a status column. |
| FR-6 | Distribution stats for a fixed fixture match hand-computed values, including interpolated percentiles. |
| FR-7 | Every insights figure is in USD, converted with the documented rate and rounding rule. |
| FR-8 | A fixture employee outside the peer group's IQR fences is flagged; one inside is not; peer groups under the minimum size are not evaluated. |
| FR-9 | Payroll totals per group equal the sum of the group's current USD salaries. |
| FR-10 | A bulk revision appears as one entry with headcount and percentage; a change dated 4 years ago appears with the 5-year window but not the 3-year one. |
| FR-11 | Every data endpoint returns 401 without a valid session; a page refresh keeps the user logged in. |
| FR-12 | Two seed runs with the same RNG seed and reference date produce byte-identical data; ~1–2% of employees fall outside their peer-group fences. |
