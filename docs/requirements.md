# Salary Management: Requirements

## Goal

Replace ACME's Excel-based salary management for 10,000 employees across multiple countries with a web application. The HR Manager can maintain salary data reliably and answer "how do we pay people?" without building spreadsheets by hand.

## User and key questions

One persona: the HR Manager. Every feature in this document exists to answer one of these five questions:

1. How is pay distributed (headcount, min, median, mean, p25/p75/p90, max) by country, department and level? → Insights: distribution
2. How does pay compare across countries in one currency? → Insights: distribution, computed in a common base currency
3. Who is paid unusually high or low against their peers? → Insights: outliers (IQR-based, peer group = same country + level)
4. What is total payroll cost by country and department? → Insights: payroll totals
5. What changed, when, and from what to what? → Insights: recent changes, backed by salary history

## In scope

- Employee list with server-side search, filter, sort and pagination
- Create, edit and deactivate (soft delete) employees
- Salary changes recorded as effective-dated history (hire, raise, promotion, correction)
- Insights dashboard answering the five questions above
- Login for a single HR user (JWT-based)
- CSV export of current employee + salary data
- Deterministic seed script: 10,000 employees across 3 countries (India/INR, United States/USD, Germany/EUR), 7 departments, 6 levels
- Unit, service, API and frontend component tests
- Deployed, fully functional application and a demo video

## Deliberately out, and why

- **Payroll processing, tax, payslips** — a different, compliance-heavy problem with its own regulatory requirements per country.
- **Bonus, allowances, equity** — base pay only keeps the data model and statistics unambiguous. The schema stores a single `amount_minor` per salary record, leaving room to add components later without a redesign.
- **Live FX rates** — a static, dated FX table keeps conversions deterministic and removes an external dependency and failure mode.
- **Role-based access control / SSO / multi-user** — one persona only. The service layer accepts an unused visibility-scope parameter so country/department-restricted access can be added later without a rewrite.
- **Excel import** — the seed script supplies the data, so import isn't required to use the app. It's the natural first follow-up, and would reuse the same validation and bulk-create path the seed script already uses.
- **Org chart / reporting hierarchy** — none of the five HR questions above require it, and a believable reporting tree in seed data adds complexity with no analytical payoff here.
- **Approval workflows and notifications** — state machines that don't answer any of the five questions.
- **Demographic pay-equity analysis (e.g. by gender)** — sensitive data that needs a policy decision outside the scope of this exercise.

## Assumptions

The company was asked about salary components, cross-country currency comparison, history vs. snapshot, HR's own priority questions, access scoping, and Excel import/template format. No reply was received before the build started, so the defaults below were used and are recorded here rather than guessed silently:

- Salary = annual base pay only (no bonus/equity/allowances).
- Cross-country comparison uses a static, dated FX table, converting to a common base currency (USD) for insights.
- Full effective-dated salary history is tracked, not just a current snapshot.
- The five HR questions above are the product's own answer to "what should HR be able to ask," informed by the problem statement.
- Single HR user, no role/country/department-based access restriction, but the service layer is structured so this can be added later.
- No Excel import; CSV export only.

## Success criteria

- Core calculations (money arithmetic, FX conversion, distribution statistics, IQR outlier detection, seed data generation) have unit tests.
- List and insights endpoints respond within a measured, stated latency on the full 10,000-row dataset — see `docs/performance.md` for actual numbers once measured.
- Seed time and full test-suite runtime are measured and recorded, not estimated.
