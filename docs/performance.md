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

Measured in-process with Fastify `app.inject` (so network and the Next.js rewrite are excluded), 40 requests each, file-backed SQLite seeded with RNG seed 42. The list rows were measured on 2026-10-19: `country=IN&level=3` for the filtered salary sort, `search=ann` (425 matches) for search. The insights, export and bulk-preview rows were measured on 2026-10-19 with the same method (reference date 2026-10-19; the export and preview include the response body, collected in memory by `app.inject`). Distribution by department or level and payroll by country are within 1 ms of the rows shown, since every insight reads the same active-employee set. `recent-changes?years=3` takes 14.0 ms at p50, and the deepest 5-year page (`limit=200&offset=2000`) 21.8 ms. A search that matches nothing takes 7.5 ms and the deepest page (`offset=9000`, `status=all`, hire-date sort) 12.0 ms at p50.

The list sorts, multi-value filters and facet counts were measured on 2026-10-21 with `npm run perf:latency` (the same in-process `app.inject` method, 5 warm-up and 40 timed requests per case, nearest-rank percentiles, RNG seed 42, reference date 2026-10-21). The database file was `apps/api/data/perf.db` (git-ignored), seeded fresh for the run. The `department` rows use the default status; the last sort row is the deepest page (`status=all`, `offset=9000`).

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | 4.2 ms | 6.1 ms |
| `GET /api/employees` (salary sort, filtered) | 2.4 ms | 2.9 ms |
| `GET /api/employees?search=…` | 10.2 ms | 11.1 ms |
| `GET /api/employees?sortBy=jobTitle&sortOrder=desc` | 1.1 ms | 1.2 ms |
| `GET /api/employees?sortBy=department&sortOrder=desc` | 4.4 ms | 5.5 ms |
| `GET /api/employees?sortBy=level&sortOrder=desc` | 5.0 ms | 5.7 ms |
| `GET /api/employees?sortBy=country&sortOrder=desc` | 4.8 ms | 4.9 ms |
| `GET /api/employees?status=all&sortBy=department&offset=9000` | 12.6 ms | 13.4 ms |
| `GET /api/employees?country=IN&country=DE&level=3&level=4` | 5.6 ms | 9.9 ms |
| `GET /api/employees/facets` | 9.5 ms | 9.6 ms |
| `GET /api/employees/facets?search=ann&country=IN` | 13.0 ms | 13.3 ms |
| `GET /api/insights/distribution?groupBy=country` | 27.0 ms | 28.1 ms |
| `GET /api/insights/outliers` | 27.4 ms | 28.4 ms |
| `GET /api/insights/payroll?groupBy=department` | 26.4 ms | 29.0 ms |
| `GET /api/insights/recent-changes?years=5` | 20.2 ms | 21.1 ms |
| `GET /api/employees/export?scope=all` (full stream, 1.4 MB) | 34.1 ms | 49.3 ms |
| `GET /api/employees/export?scope=filtered&country=IN&level=3` | 4.1 ms | 4.9 ms |
| `POST /api/employees/bulk-salary-changes/preview` (all active employees, 2.0 MB) | 40.1 ms | 51.0 ms |

## Build effort

| Measure | Value |
|---|---|
| Seed time (10,000 employees) | 12.7 s on Node 24, file-backed SQLite, RNG seed 42, reference date 2026-10-19 (measured 2026-10-19): 47,310 `salary_history` rows, 105 revision batches, 1.7% of active employees outside their country + level fences |
| Full test-suite runtime | 14.5 s wall clock (median of 3 runs: 13.9, 14.5, 14.9 s) for all 396 tests (307 API, 89 web), Node 24 (measured 2026-10-19) |
