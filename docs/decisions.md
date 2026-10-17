# Decisions

A short log of non-obvious trade-offs: what was chosen, what the alternative was, and why. `docs/architecture.md` describes what was built; this document explains the calls that weren't forced by the requirements alone.

## Outlier detection: Tukey's IQR fences, not a fixed threshold

**Alternative considered**: flag anyone more than ±40% from their peer-group median.

**Chosen**: flag anyone outside `p25 - 1.5×IQR` .. `p75 + 1.5×IQR` for their country+level peer group.

**Why**: a fixed ±40% is an arbitrary number with no justification beyond "it seemed reasonable." IQR fences are a standard statistical method, and the insights endpoint already computes p25/p75 for the distribution feature (FR-6), so this reuses existing output instead of introducing a new threshold parameter to pick and defend.

## Auth: JWT, no refresh token

**Alternative considered**: server-side session with an httpOnly cookie.

**Chosen**: JWT (`{ sub: userId }`, 1-hour expiry), held client-side in memory, no refresh token.

**Why**: a single HR user with no RBAC doesn't need session invalidation machinery. Re-login on expiry is simpler to build, test, and explain than refresh-token rotation, for a tool used in short, infrequent sessions (see the usage pattern below).

## Current salary: denormalized cache, not a derived query

**Alternative considered**: keep `current_amount_minor` purely derived — a window function or correlated subquery finding each employee's latest `salary_history` row at read time.

**Chosen**: cache `current_amount_minor` / `current_currency_code` / `current_effective_date` / `current_reason` directly on `employees`, written transactionally by the single service function that writes `salary_history`.

**Why**: this system is designed to hold up at 100,000+ employees (`docs/requirements.md` §6), not just the seeded 10,000. A derived "latest row per employee" query re-aggregates on every list and insights request; a denormalized, indexed column turns that into a plain read. The cost is a second place the value lives, mitigated by funneling every write through exactly one service function (`docs/architecture.md` §1) — there is no second code path that could let it drift from `salary_history`, which remains the append-only source of truth.

**Revisit if**: a future requirement needs the "current" salary to be computed differently per caller (e.g. as-of an arbitrary past date for every list view, not just the detail/history view) — at that point the cache stops being a correct shortcut and the derived query comes back, likely behind the same read path.

## Pagination: offset, not cursor

**Chosen**: standard offset/limit pagination on indexed, filtered/sorted columns.

**Why**: stays fast through 100,000 rows, which is the scale this architecture targets, and is simpler to build, test, and explain than cursor-based pagination.

**Revisit if**: the employee count grows into the millions, or UI usage patterns start requiring very deep pages (offset pagination degrades specifically on large offsets, not on large tables with shallow access patterns).

## Insights statistics: computed in application memory

**Chosen**: fetch the filtered set of current salaries and compute distribution/percentiles in the Node process (`computeDistribution`), rather than in SQL.

**Why**: SQLite has no percentile functions. At the scale this system targets (100,000 rows), sorting an array in memory is on the order of milliseconds — not a real cost.

**Revisit if**: the target scale grows by another order of magnitude (millions of rows). At that point, either a SQLite percentile extension or pre-aggregated rollup tables would be needed instead of fetching the full filtered set per request.

## Bulk salary revision: percentage with per-row override, not exact-amount-only

**Context**: salary revisions happen a few times a year, applied to groups of employees at once (an increment cycle), not one employee at a time. It surfaced while designing the UX around how often each feature is actually used.

**Alternative considered**: bulk action that only supports setting the exact same new amount for every selected employee.

**Chosen**: a single percentage increase computed per employee, with the resulting amount editable per row before confirming.

**Why**: a flat percentage is what an increment cycle actually is ("everyone in this group gets 7%"), and the per-row override avoids forcing a second workflow for the inevitable exceptions (one person in the group needs a different number) without building a second bulk-edit feature.

## Deployment platform: deferred, not decided

**Status**: open. The architecture assumes a single Docker image (`docs/architecture.md` §11); the specific host (Render/Railway/Fly.io) is an operational choice made during the deployment phase, not an architectural one. Will be recorded here once chosen, with the reason.
