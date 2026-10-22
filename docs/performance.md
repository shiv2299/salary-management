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

Measured in-process with Fastify `app.inject` (so network and the Next.js rewrite are excluded), 40 requests each, file-backed SQLite seeded with RNG seed 42. The list rows were measured on 2026-10-19: `country=IN&level=3` for the filtered salary sort, `search=ann` (425 matches) for search. The insights and export rows were measured on 2026-10-19 with the same method (reference date 2026-10-19; the export includes the response body, collected in memory by `app.inject`). Distribution by department or level and payroll by country are within 1 ms of the rows shown, since every insight reads the same active-employee set. `recent-changes?years=3` takes 14.0 ms at p50, and the deepest 5-year page (`limit=200&offset=2000`) 21.8 ms. A search that matches nothing takes 7.5 ms and the deepest page (`offset=9000`, `status=all`, hire-date sort) 12.0 ms at p50.

The list sorts, multi-value filters, facet counts, the insight reads (outliers, distribution, payroll, recent changes), peer context, the salary-change preview and the bulk revision preview and summary were re-measured on 2026-10-21 with `npm run perf:latency` (the same in-process `app.inject` method, 5 warm-up and 40 timed requests per case, nearest-rank percentiles, RNG seed 42, reference date 2026-10-21). The database file was `apps/api/data/perf.db` (git-ignored), seeded fresh for the run. The insight rows replace the 2026-10-19 figures above; the outlier read is slower than it was because its implementation changed. `peer-context` and the salary-change preview use employee 1; the bulk preview and summary take every active employee at 7%, the preview now also reading peer groups and converting to USD. The `department` rows use the default status; the last sort row is the deepest page (`status=all`, `offset=9000`).

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | 4.3 ms | 4.9 ms |
| `GET /api/employees` (salary sort, filtered) | 2.4 ms | 2.9 ms |
| `GET /api/employees?search=…` | 10.2 ms | 11.1 ms |
| `GET /api/employees?sortBy=jobTitle&sortOrder=desc` | 1.1 ms | 1.2 ms |
| `GET /api/employees?sortBy=department&sortOrder=desc` | 4.4 ms | 5.5 ms |
| `GET /api/employees?sortBy=level&sortOrder=desc` | 5.0 ms | 5.7 ms |
| `GET /api/employees?sortBy=country&sortOrder=desc` | 4.7 ms | 5.1 ms |
| `GET /api/employees?status=all&sortBy=department&offset=9000` | 12.6 ms | 13.5 ms |
| `GET /api/employees?country=IN&country=DE&level=3&level=4` | 5.5 ms | 5.8 ms |
| `GET /api/employees/facets` | 9.5 ms | 11.9 ms |
| `GET /api/employees/facets?search=ann&country=IN` | 12.9 ms | 15.1 ms |
| `GET /api/insights/distribution?groupBy=country` | 27.6 ms | 28.3 ms |
| `GET /api/insights/outliers` | 36.2 ms | 38.0 ms |
| `GET /api/insights/payroll?groupBy=department` | 27.1 ms | 27.7 ms |
| `GET /api/insights/recent-changes?years=5` | 20.1 ms | 20.7 ms |
| `GET /api/employees/1/peer-context` | 1.3 ms | 1.5 ms |
| `POST /api/employees/1/salary-changes/preview` | 1.5 ms | 1.6 ms |
| `GET /api/employees/export?scope=all` (full stream, 1.4 MB) | 34.1 ms | 49.3 ms |
| `GET /api/employees/export?scope=filtered&country=IN&level=3` | 4.1 ms | 4.9 ms |
| `POST /api/employees/bulk-salary-changes/preview` (all active employees at 7%, with peer ranges and USD amounts) | 59.9 ms | 74.3 ms |
| `POST /api/employees/bulk-salary-changes/summary` (all active employees at 7%) | 39.4 ms | 40.8 ms |

## Build effort

| Measure | Value |
|---|---|
| Seed time (10,000 employees) | 12.7 s on Node 24, file-backed SQLite, RNG seed 42, reference date 2026-10-19 (measured 2026-10-19): 47,310 `salary_history` rows, 105 revision batches, 1.7% of active employees outside their country + level fences |
| Full test-suite runtime | 17.2 s wall clock (median of 3 runs: 16.8, 17.2, 18.7 s) for all 563 tests (362 API, 201 web), Node 24 (measured 2026-10-21) |
