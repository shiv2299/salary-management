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

Measured in-process with Fastify `app.inject` (so network and the Next.js rewrite are excluded), 40 requests each, file-backed SQLite seeded with RNG seed 42. The list rows were measured on 2026-10-19: `country=IN&level=3` for the filtered salary sort, `search=ann` (425 matches) for search. A search that matches nothing takes 7.5 ms and the deepest page (`offset=9000`, `status=all`, hire-date sort) 12.0 ms at p50.

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | 4.2 ms | 6.1 ms |
| `GET /api/employees` (salary sort, filtered) | 2.4 ms | 2.9 ms |
| `GET /api/employees?search=…` | 10.2 ms | 11.1 ms |
| `GET /api/insights/distribution?groupBy=country` | — | — |
| `GET /api/insights/outliers` | — | — |
| `GET /api/insights/payroll?groupBy=department` | — | — |
| `GET /api/insights/recent-changes?years=5` | — | — |
| `GET /api/employees/export?scope=all` (full stream) | — | — |

## Build effort

| Measure | Value |
|---|---|
| Seed time (10,000 employees) | 12.7 s on Node 24, file-backed SQLite, RNG seed 42, reference date 2026-10-19 (measured 2026-10-19): 47,310 `salary_history` rows, 105 revision batches, 1.7% of active employees outside their country + level fences |
| Full test-suite runtime | 6.8 s wall clock for all 145 tests (API and web), Node 24 (measured 2026-10-19) |
