# AI Workflow

How AI coding agents were used to build this, what kept them on track, and where their output was corrected.

## Tools

- **Claude Code** for the code and most doc edits. Every AI-assisted commit carries a `Co-Authored-By` trailer naming the model: Claude Sonnet 5.5 on most commits, Claude Opus 5.5 and Claude Sonnet 5 on the rest.
- **The superpowers plugin** for the larger pieces of work: brainstorm a design, write it down as a spec, break it into a step-by-step plan, then implement the plan task by task with tests first.

## The contract: docs first, then `AGENTS.md`

The agent never started from a blank prompt. Before any code (`26c4a30` to `0ba3db6`), the product was written down as requirements (now `docs/requirements.md` and the detailed `docs/spec.md`), `docs/architecture.md`, `docs/design.md` and `docs/decisions.md`. `AGENTS.md` then turns those into rules every session follows: the layering, money as integer minor units, the single salary writer, Zod at the boundary, injected clock and RNG, and "record an ambiguous call in `decisions.md` rather than guess silently".

Because the rules live in the repo, a new session or a different model gets the same constraints, and a review can check code against a written rule instead of against taste.

## Prompts, by phase

| Phase | What the agent was given |
|---|---|
| Docs | Requirements, architecture and design were written and argued through in conversation, then reviewed, with the findings resolved in one commit (`0ba3db6`). |
| Scaffold | `docs/prompts/initial.md`: scaffolding only, verify every package version, small commits that each pass lint, typecheck and tests, never `any` or `@ts-ignore` to get past an error. |
| Features | Work by functional requirement from `docs/spec.md`. Each FR has an acceptance criterion that names the behaviour its tests must show. |
| Redesign | A brainstormed UI spec, then one plan per phase (employees, bulk revision, seed and history, insights), each executed and reviewed before the next. The resulting rules live in `design.md`, `architecture.md` and `decisions.md`; the spec and plan files were working notes and were removed afterwards (`bbd752a` removed them, and its parent still has them). |

## Where AI output was wrong, and what changed

- **Auth bypass** (`0da7855`). The first guard checked `request.url.startsWith('/api/')`. The router decodes the path, so `/%61pi/employees` reached a protected route without a session. The guard now keys off the matched route pattern and denies anything unmatched.
- **Unbounded money sums** (`308c268`, `8c78326`). A typed amount near 9×10¹⁵ pushed a payroll total past `Number.MAX_SAFE_INTEGER` and the endpoint answered 500. Every salary amount the API accepts now has a documented limit (`decisions.md` "Salary amounts").
- **Bulk confirm race** (`c4c7453`). The confirm could send a new percentage with the previous percentage's amounts while the preview was still loading. Apply now waits for the preview that matches the chosen percentage.
- **Same-day changes miscounted** (`c14d207`). Payroll change by cause booked a raise and a promotion on the same day as one promotion. Each row now adds its own step, and a test over generated histories checks that the causes always sum to the total change.
- **Non-atomic reset** (`6735eaa`). A database reset dropped the tables and then ran Drizzle's migrator in its own transaction, so a failed migration left the database empty. Dropping, migrating and restoring the users now happen in one transaction, and a test with a deliberately broken migration checks that the original data survives.

## How output was checked

- Every commit is expected to pass lint, typecheck and tests (`AGENTS.md`, `docs/prompts/initial.md`), and CI runs all three.
- Domain figures are tested against hand-computed values (percentiles, FX rounding, payroll causes), not against the code's own output.
- Layering rules are checked by grepping imports (no repository imports in routes, no Drizzle in services or `domain/`).
- Latency, seed time and suite time are measured and recorded in `docs/performance.md` rather than estimated.
