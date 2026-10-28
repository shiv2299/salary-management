# Employee Salary Management: Requirements

## 1. Overview

Replace ACME's Excel-based salary management for 10,000 employees across multiple countries with a web application. The system lets an HR Manager maintain salary data reliably and answer "how do we pay people?" without building spreadsheets by hand.

## 2. User

**HR Manager**: the only persona. Today they keep employee and salary data in Excel and build pivot tables by hand to answer compensation questions for leadership. The application succeeds if they can manage records directly and answer those questions on demand.

## 3. Scope

Each item is a numbered functional requirement in `docs/spec.md`, with the test that accepts it.

- **Manage employees** (FR-1, FR-2, FR-5): a searchable, filterable, sortable list of 10,000 employees; create, edit, deactivate and reactivate; CSV export of the current result or of everyone.
- **Manage pay** (FR-3, FR-4, FR-13): salary as effective-dated history with one reason per change (hire, raise, promotion, relocation, correction); a percentage revision for a whole group at once, previewed with its cost before confirming; each employee's pay over time.
- **Answer pay questions** (FR-6..FR-10, FR-14..FR-18): pay distribution by country, department and level; cross-country comparison in USD; outliers against same-country, same-level peers; payroll cost and its trend; what changed payroll in the last year; raises per year; level bands; and who needs attention.
- **Access and data** (FR-11, FR-12): a single HR login; a deterministic 10,000-employee seed spanning 3 countries and 10 years of history.

Quality targets (`docs/spec.md` §2): list and insights responses under 300 ms p95 on the full dataset, money as integer minor units, append-only salary history, and unit-tested calculations.

## 4. Deliberately Left Out

| Item | Why excluded |
|---|---|
| Payroll processing, tax, payslips | A different, compliance-heavy problem with its own rules in each country. |
| Bonus, allowances, equity | Base pay only keeps the data model and statistics unambiguous. A salary record stores one amount, leaving room to add components later. |
| Live FX rates | A static, dated FX table keeps conversions deterministic and removes an external dependency. |
| Role-based access / SSO / multi-user | One persona only. Restricted access would be a scope applied in the service layer (`docs/decisions.md`). |
| Future-dated salary changes | Scheduled changes would make "current salary" depend on when it is read, which the current-salary design avoids (`docs/decisions.md`). |
| Excel import screen | Day-one data would come in through a one-off migration script in the CSV export's layout, reusing the API's validation and create functions (`docs/decisions.md`). An import screen with row-by-row errors is the first follow-up. |
| Policy pay ranges, compa-ratio, raise budgets | They need a compensation-policy decision: what each level should pay and what a cycle may spend. The level bands here describe actual pay. A bulk revision already shows its cost before confirming, which is where a budget check would go. |
| Org chart / reporting hierarchy | No insight needs it, and a believable reporting tree in seed data adds complexity with no analytical payoff. |
| Approval workflows and notifications | State machines that serve no requirement above. |
| Demographic pay-equity analysis | Sensitive data that needs a policy decision outside this product. |

## 5. Assumptions

- Salary means annual base pay.
- Insights compare countries in USD at a static, dated FX rate; outlier peer groups stay within one country.
- Trends convert past pay at today's rates, so they show changes in pay rather than in exchange rates.
- The insights answer six chosen questions rather than offering a report builder. `docs/insights.md` says which and why.

The reasoning behind each is in `docs/decisions.md`.

## 6. Which Pay Questions, and Why

The six Insights cards each answer a question that leads to a decision someone makes regularly, using data the app already keeps. `docs/insights.md` maps each one to who asks it and the decision it drives, and lists the questions considered and dropped.
