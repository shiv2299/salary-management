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
| Seed time (10,000 employees) | — |
| Full test-suite runtime | — |
