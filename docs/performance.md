# Performance

Measured numbers, not estimates (`docs/spec.md` §2).

Target: list and insights endpoints respond in under 300 ms (p95) on the full 10,000-employee dataset.

## Environment

| | |
|---|---|
| Machine | local development laptop (macOS) |
| Node version | 24.22.0 |
| Dataset | 10,000 employees (seed, fixed RNG seed) |

## Endpoint latency (p50 / p95)

Measured in-process with Fastify `app.inject` (so network and the Next.js rewrite are excluded) by `npm run perf:latency`: 5 warm-up and 40 timed requests per case, nearest-rank percentiles, file-backed SQLite seeded with RNG seed 42 and reference date 2026-10-28, measured on 2026-10-28. Every row was measured in that one run. The dataset carries ten years of history. The database file was `apps/api/data/perf.db` (git-ignored), seeded fresh for the run and deleted afterwards. `GET /api/employees/1` is the detail with its history summary; `peer-context` and the salary-change preview use employee 1; the bulk preview and summary take every active employee at 7%, the preview also reading peer groups and converting to USD. The `department` rows use the default status; the deepest-page row is `status=all`, `offset=9000`. The export rows include the response body, collected in memory by `app.inject`. The bulk preview's body is about 3.0 MB. The history endpoints (payroll trend, payroll change, raises, recent changes) read every `salary_history` row once per request. Distribution by department or level is within 1 ms of the country row shown, since every distribution reads the same active-employee set. The facet counts and the attention filter resolve the attention sets (peer groups, last raise and recent-hire medians) on every request, which is why they cost tens of milliseconds where the plain list costs a few.

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | 4.3 ms | 4.8 ms |
| `GET /api/employees?sortBy=salary&sortOrder=desc&country=IN&level=3` | 2.2 ms | 2.5 ms |
| `GET /api/employees?search=ann` | 10.2 ms | 10.5 ms |
| `GET /api/employees?sortBy=jobTitle&sortOrder=desc` | 1.1 ms | 1.3 ms |
| `GET /api/employees?sortBy=department&sortOrder=desc` | 4.5 ms | 5.3 ms |
| `GET /api/employees?sortBy=level&sortOrder=desc` | 4.8 ms | 5.1 ms |
| `GET /api/employees?sortBy=country&sortOrder=desc` | 4.7 ms | 5.0 ms |
| `GET /api/employees?status=all&sortBy=department&offset=9000` | 12.8 ms | 13.5 ms |
| `GET /api/employees?country=IN&country=DE&level=3&level=4` | 5.6 ms | 5.8 ms |
| `GET /api/employees?attention=no-raise-2y` | 66.3 ms | 69.1 ms |
| `GET /api/employees/facets` | 76.7 ms | 77.6 ms |
| `GET /api/employees/facets?search=ann&country=IN` | 78.6 ms | 79.8 ms |
| `GET /api/employees/facets?attention=compression` | 71.6 ms | 72.2 ms |
| `GET /api/insights/distribution?groupBy=country` | 28.6 ms | 29.4 ms |
| `GET /api/insights/payroll-trend` | 96.2 ms | 101.5 ms |
| `GET /api/insights/payroll-change` | 90.3 ms | 98.4 ms |
| `GET /api/insights/raises` | 128.1 ms | 138.4 ms |
| `GET /api/insights/level-bands?country=IN` | 6.1 ms | 8.3 ms |
| `GET /api/insights/attention` | 64.8 ms | 65.8 ms |
| `GET /api/insights/recent-changes?range=5y` | 28.8 ms | 29.3 ms |
| `GET /api/insights/recent-changes?range=all` | 40.1 ms | 41.3 ms |
| `GET /api/insights/recent-changes?year=2024&reason=raise` | 11.8 ms | 12.1 ms |
| `GET /api/employees/1` (detail with its history summary) | 0.4 ms | 0.5 ms |
| `GET /api/employees/1/peer-context` | 0.9 ms | 1.1 ms |
| `POST /api/employees/1/salary-changes/preview` | 1.1 ms | 1.4 ms |
| `GET /api/employees/export?scope=all` (full stream, 1.4 MB) | 35.8 ms | 48.8 ms |
| `GET /api/employees/export?scope=filtered&country=IN&level=3` | 3.9 ms | 4.7 ms |
| `POST /api/employees/bulk-salary-changes/preview` (all active employees at 7%, with peer ranges and USD amounts, 3.0 MB) | 67.2 ms | 83.4 ms |
| `POST /api/employees/bulk-salary-changes/summary` (all active employees at 7%) | 46.6 ms | 47.7 ms |

## Build effort

| Measure | Value |
|---|---|
| Seed time (10,000 employees) | 15.6 s (median of 3 runs: 15.4, 15.6, 15.6 s) on Node 24, file-backed SQLite, RNG seed 42, reference date 2026-10-28 (measured 2026-10-28): 60,847 `salary_history` rows, 210 revision batches |
| Full test-suite runtime | 32.0 s wall clock for `npm test` (median of 3 runs: 32.3, 32.0, 31.8 s) for all 859 tests (510 API, 349 web), Node 24 (measured 2026-10-28). Three full runs started at once on the same machine all pass, in about 76 s |
