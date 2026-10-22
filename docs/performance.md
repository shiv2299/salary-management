# Performance

Measured numbers, not estimates (`docs/requirements.md` §6). Filled in once the features exist; until then every value is "not yet measured".

Target: list and insights endpoints respond in under 300 ms (p95) on the full 10,000-employee dataset.

## Environment

| | |
|---|---|
| Machine | local development laptop (macOS) |
| Node version | 24.22.0 |
| Dataset | 10,000 employees (seed, fixed RNG seed) |

## Endpoint latency (p50 / p95)

Measured in-process with Fastify `app.inject` (so network and the Next.js rewrite are excluded) by `npm run perf:latency`: 5 warm-up and 40 timed requests per case, nearest-rank percentiles, file-backed SQLite seeded with RNG seed 42 and reference date 2026-10-22, measured on 2026-10-22. The dataset now carries ten years of history. The database file was `apps/api/data/perf.db` (git-ignored), seeded fresh for the run and deleted afterwards. `GET /api/employees/1` is the detail with its history summary; `peer-context` and the salary-change preview use employee 1; the bulk preview and summary take every active employee at 7%, the preview also reading peer groups and converting to USD. The `department` rows use the default status; the last sort row is the deepest page (`status=all`, `offset=9000`).

Four rows were not re-run in the latest pass and keep their figures from 2026-10-19: the filtered salary sort (`country=IN&level=3`), the search list row (`search=ann`, 425 matches) and the two export rows (the export includes the response body, collected in memory by `app.inject`). The bulk preview's body is about 3.0 MB. Distribution by department or level and payroll by country are within 1 ms of the rows shown, since every insight reads the same active-employee set.

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | 4.2 ms | 4.8 ms |
| `GET /api/employees` (salary sort, filtered) | 2.4 ms | 2.9 ms |
| `GET /api/employees?search=…` | 10.2 ms | 11.1 ms |
| `GET /api/employees?sortBy=jobTitle&sortOrder=desc` | 1.1 ms | 1.3 ms |
| `GET /api/employees?sortBy=department&sortOrder=desc` | 4.4 ms | 4.6 ms |
| `GET /api/employees?sortBy=level&sortOrder=desc` | 4.8 ms | 5.5 ms |
| `GET /api/employees?sortBy=country&sortOrder=desc` | 4.8 ms | 5.0 ms |
| `GET /api/employees?status=all&sortBy=department&offset=9000` | 12.7 ms | 13.4 ms |
| `GET /api/employees?country=IN&country=DE&level=3&level=4` | 5.5 ms | 5.7 ms |
| `GET /api/employees/facets` | 9.5 ms | 9.9 ms |
| `GET /api/employees/facets?search=ann&country=IN` | 12.7 ms | 13.1 ms |
| `GET /api/insights/distribution?groupBy=country` | 28.8 ms | 29.6 ms |
| `GET /api/insights/outliers` | 37.8 ms | 38.3 ms |
| `GET /api/insights/payroll?groupBy=department` | 28.5 ms | 29.3 ms |
| `GET /api/insights/recent-changes?years=5` | 20.4 ms | 21.2 ms |
| `GET /api/employees/1` (detail with its history summary) | 0.4 ms | 0.5 ms |
| `GET /api/employees/1/peer-context` | 0.9 ms | 1.1 ms |
| `POST /api/employees/1/salary-changes/preview` | 1.1 ms | 1.2 ms |
| `GET /api/employees/export?scope=all` (full stream, 1.4 MB) | 34.1 ms | 49.3 ms |
| `GET /api/employees/export?scope=filtered&country=IN&level=3` | 4.1 ms | 4.9 ms |
| `POST /api/employees/bulk-salary-changes/preview` (all active employees at 7%, with peer ranges and USD amounts, 3.0 MB) | 66.5 ms | 82.6 ms |
| `POST /api/employees/bulk-salary-changes/summary` (all active employees at 7%) | 45.7 ms | 47.1 ms |

## Build effort

| Measure | Value |
|---|---|
| Seed time (10,000 employees) | 16.8 s on Node 24, file-backed SQLite, RNG seed 42, reference date 2026-10-22 (measured 2026-10-22): 60,847 `salary_history` rows, 210 revision batches |
| Full test-suite runtime | 31.5 s wall clock (median of 3 runs: 31.5, 31.2, 31.5 s) for all 675 tests (409 API, 266 web), Node 24 (measured 2026-10-22). The web run (18.4 s) is set by the bulk revision screen's tests, about 17 s on their own, because they wait on the real 400 ms pauses before the preview and totals are asked |
