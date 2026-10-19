# Performance

Measured numbers, not estimates (`docs/requirements.md` §6). Filled in once the features exist; until then every value is "not yet measured".

Target: list and insights endpoints respond in under 300 ms (p95) on the full 10,000-employee dataset.

## Environment

| | |
|---|---|
| Machine | not yet measured |
| Node version | not yet measured |
| Dataset | 10,000 employees (seed, fixed RNG seed) |

## Endpoint latency (p50 / p95)

| Endpoint | p50 | p95 |
|---|---|---|
| `GET /api/employees` (default sort, page 1) | — | — |
| `GET /api/employees` (salary sort, filtered) | — | — |
| `GET /api/employees?search=…` | — | — |
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
