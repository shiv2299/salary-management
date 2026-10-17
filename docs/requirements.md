# Employee Salary Management: Requirements

## 1. Overview

Replace ACME's Excel-based salary management for 10,000 employees across multiple countries with a web application. The system lets an HR Manager maintain salary data reliably and answer "how do we pay people?" without building spreadsheets by hand.

## 2. User

**HR Manager** — the only persona. Today they maintain employee and salary data in Excel and manually build pivot tables to answer compensation questions for leadership. The application succeeds if it lets them manage employee/salary records directly and answer those questions on demand, without spreadsheet work.

## 3. Functional Requirements

### Employee records

- **FR-1**: Maintain a searchable, filterable, sortable, paginated list of employees (server-side).
- **FR-2**: Create, edit, and deactivate (soft delete) employee records. Deactivation preserves salary history; employees are never hard-deleted.

### Compensation

- **FR-3**: Record salary as effective-dated history (reasons: hire, raise, promotion, correction), not a mutable snapshot — so past pay is never lost.
- **FR-4**: Export current employee and salary data as CSV.

### Insights (the HR Manager's core compensation questions)

- **FR-5**: Show pay distribution (headcount, min, max, mean, median, p25/p75/p90) by country, department, and level.
- **FR-6**: Compare pay across countries in a single base currency, using a static FX table.
- **FR-7**: Flag employees whose current pay is a statistical outlier against same-country, same-level peers.
- **FR-8**: Show total payroll cost by country and by department.
- **FR-9**: Show recent salary changes within a trailing time window (what changed, when, from what to what).

### Access

- **FR-10**: The single HR user authenticates (login) before accessing any employee or insights data.

### Data

- **FR-11**: Seed the system with a deterministic 10,000-employee dataset spanning 3 countries, 7 departments, and 6 levels, for development, testing, and demo purposes.

## 4. Out of Scope

| Item | Why excluded |
|---|---|
| Payroll processing, tax, payslips | A different, compliance-heavy problem with its own regulatory requirements per country. |
| Bonus, allowances, equity | Base pay only keeps the data model and statistics unambiguous. The schema stores a single amount per salary record, leaving room to add components later without a redesign. |
| Live FX rates | A static, dated FX table keeps conversions deterministic and removes an external dependency and failure mode. |
| Role-based access control / SSO / multi-user | One persona only. The service layer accepts an unused visibility-scope parameter so country/department-restricted access can be added later without a rewrite. |
| Excel import | The seed script supplies the data, so import isn't required to use the app. It's the natural first follow-up, and would reuse the same validation and bulk-create path the seed script already uses. |
| Org chart / reporting hierarchy | None of the FR-5..FR-9 insights require it, and a believable reporting tree in seed data adds complexity with no analytical payoff here. |
| Approval workflows and notifications | State machines that don't serve any requirement above. |
| Demographic pay-equity analysis (e.g. by gender) | Sensitive data that needs a policy decision outside the scope of this exercise. |

## 5. Assumptions

Where a product decision was not fully specified, this document records the assumption made and proceeds on it.

- Salary means annual base pay only (no bonus/equity/allowances).
- Cross-country comparison uses a static, dated FX table, converting to a common base currency for insights.
- Full effective-dated salary history is tracked, not just a current snapshot.
- FR-5..FR-9 are the product's own answer to "what should HR be able to ask," derived from the problem statement.
- Single HR user; no role/country/department-based access restriction, but the service layer is structured so this can be added later.
- No Excel import; CSV export only.

## 6. Non-Functional Requirements & Acceptance Criteria

- **Correctness**: core calculations (money arithmetic, FX conversion, distribution statistics, outlier detection, seed data generation) have unit tests.
- **Performance**: list and insights endpoints respond within a measured, stated latency on the full 10,000-row dataset — see `docs/performance.md` for actual numbers once measured.
- **Data integrity**: monetary amounts are stored as integer minor units with an ISO currency code, never floats; salary history is append-only.
- **Observability of build effort**: seed time and full test-suite runtime are measured and recorded, not estimated.
