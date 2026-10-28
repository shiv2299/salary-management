# AGENTS.md

This file is the single source of project conventions. Every session working in this repo — scaffolding, domain logic, UI, tests — follows it. If something in the code conflicts with it, the code is wrong, or the doc needs updating first; conventions don't drift silently.

## Required reading

Before writing any feature code (not required for pure scaffolding with no domain logic):

1. `docs/requirements.md` — one page: the goal, the user, the scope and what is deliberately left out.
2. `docs/spec.md` — the numbered functional requirements, quality targets and acceptance criteria the code is built and tested against.
3. `docs/architecture.md` — data model, module boundaries, API surface, testing strategy.
4. `docs/design.md` — binding visual and interaction rules for anything the HR Manager sees or clicks. UI work follows this exactly; it is not a style suggestion.
5. `docs/decisions.md` — trade-offs already made and why, so they aren't re-litigated or accidentally reversed.

`docs/performance.md` holds measured latency, seed time, and test runtime.

## Backend conventions

- Layering is `routes -> services -> repositories`. Routes never call repositories directly. Services never touch the Drizzle query builder directly.
- `domain/` contains pure functions only — no I/O, no database, no clock/RNG calls — so it stays fast and deterministic to test.
- Money is always an integer minor-unit amount plus an ISO 4217 currency code. Never a float.
- Exactly one service function (`applySalaryChanges`) writes `salary_history`, and in the same transaction it writes the employee's denormalized `current_*` columns and, for promotions/relocations, `level_id` / `country_code`. No other code path touches any of these, apart from an FX-rate migration recomputing `current_amount_base_minor` (see `docs/architecture.md` §1, §3, §12).
- Effective dates are never in the future; FX conversion and all money rounding (half away from zero, once) live in `domain/` (see `docs/architecture.md` §3).
- Validate all input at the API boundary with Zod. Inner layers trust validated data.
- Lists are paginated server-side (offset-based; see `docs/decisions.md` for why and its limits).

## Frontend conventions

- Next.js App Router. Server Components for static shell only; anything interactive or data-driven is a Client Component using TanStack Query through the same-origin `/api` rewrite. Add `'use client'` only where actually needed.
- All visual and interaction decisions — color, typography, layout, component conventions, responsive behavior — follow `docs/design.md`. Don't improvise a pattern it doesn't cover; extend the doc instead.

## Testing

- Tests are fast, deterministic, and named as plain sentences.
- Clock and RNG are injected wherever a test needs determinism — never a real `Date.now()` or unseeded random in a test path.
- Follow the testing strategy in `docs/architecture.md` §10: on the API, every rule is tested in `domain/` or against an in-memory database in the service layer, with route tests for the HTTP contract only; on the web, component tests cover interaction and state. No E2E in this build.

## Working habits

- Conventional Commits, small commits. Never force-push or rewrite shared history.
- Add a dependency only with a stated reason. No speculative abstractions or scope beyond the current task.
- Never commit secrets, `.env` files, or real employer/client data — this repository may be made public.
- If a requirement or design point is genuinely ambiguous, choose the simpler option, record it in `docs/decisions.md`, and keep moving; only stop and ask if truly blocked.

## Commands

Once scaffolded: `npm run dev` (both apps), `build`, `lint`, `typecheck`, `test`, `format` / `format:check`, run from the repo root via npm workspaces.
