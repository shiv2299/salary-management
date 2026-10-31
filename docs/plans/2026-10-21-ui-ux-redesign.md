# UI/UX Redesign: Overview Plan

> **For agentic workers:** this is the phase map. Each phase has its own detailed task plan (linked below), written just before that phase starts so it is grounded in the code the previous phase left behind. Execute a phase plan with superpowers:subagent-driven-development.

**Goal:** Deliver the redesign in `docs/plans/2026-10-21-ui-ux-redesign-design.md` in four phases, each shippable on its own.

**Spec:** `docs/plans/2026-10-21-ui-ux-redesign-design.md` (binding). Product docs: `docs/requirements.md`, `docs/architecture.md`, `docs/design.md`, `docs/decisions.md`. Conventions: `AGENTS.md`.

**Branch:** `feat/ui-ux-redesign` (one branch for all four phases; the repository owner reviews the final result).

## Global Constraints (apply to every phase and task)

- Use Node 24. Prefix shell commands with `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" &&`. The default `node` is v20, and the test runner crashes under it.
- Commands are run from the repo root: `npm test`, `npm run lint`, `npm run typecheck`, `npm run format:check` (`npm run format` to fix). All four must pass at the end of every task.
- Follow `AGENTS.md`:
  - routes → services → repositories;
  - pure `domain/` with no clock or RNG calls;
  - money as integer minor units plus an ISO code;
  - Zod at the API boundary;
  - server-side pagination;
  - plain-sentence test names;
  - injected clock and RNG in tests.
- The browser never converts currencies and never applies a percentage to money. Integer subtraction or summing within one currency is allowed.
- Docs first: a task that changes behaviour covered by `docs/design.md`, `docs/requirements.md`, `docs/architecture.md` or `docs/decisions.md` updates that doc in the same task. Decision entries use the existing "Alternatives considered / Chosen / Why" form.
- Repository text (docs, comments, commit messages) reads as a real product's own documentation: it describes the product and its decisions, never the circumstances of its development.
- Conventional Commits, small commits. Each commit message ends with the trailer line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, force-push or rewrite history.
- Add a dependency only with a stated reason in the commit message.
- The visual language is "Refined classic" (spec §4). Reuse shared building blocks rather than restyling per screen.

## Phases

| # | Phase | Detailed plan | Depends on |
|---|---|---|---|
| 1 | Style foundation, login and Employees list + drawer (spec §4, §5, §6 except the history chart, §9, §11, §12) | `2026-10-21-redesign-phase-1-style-and-employees.md` | — |
| 2 | Bulk revision screen (spec §7) | `2026-10-21-redesign-phase-2-bulk-revision.md` | 1 |
| 3 | Seed data and data model, then the drawer history chart (spec §10, §6 History tab) | `2026-10-22-redesign-phase-3-seed-and-history.md` | 1 |
| 4 | Insights rebuild and attention filters (spec §8) | `2026-10-21-redesign-phase-4-insights.md` | 1, 3 |

### Phase 1 — Style and Employees

Deliverables:
- `docs/design.md` rewritten for the new visual language and Employees/drawer/login patterns.
- Theme tokens and shared UI building blocks, for use by later phases:
  - avatar;
  - country flag with code fallback;
  - level badge;
  - chip;
  - checkbox group with counts;
  - stat tile;
  - card;
  - segmented control (restyled).
- Top bar with the underline active state.
- Login page: dark panel containing only the logo and chart pattern.
- Export dropdown made non-modal (the scroll-lock fix), with other dropdowns audited.
- API:
  - multi-value `country` / `department` / `level` on list, export and bulk-preview filters;
  - new sort keys `jobTitle`, `department`, `level`, `country`;
  - facet-counts endpoint.
- Employees page:
  - collapsible left filter panel (bottom sheet below `md`);
  - chips;
  - TanStack Table (`@tanstack/react-table`) with server-side sort and pagination, column visibility and page size 25/50/100;
  - row click opens the drawer.
- Drawer:
  - header and summary strip with peer context;
  - tabs;
  - salary change form with pre-fill, quick-% via the API, the comparison box and the reason segmented control;
  - the History tab keeps today's list, restyled, with the % change per row.

### Phase 2 — Bulk revision

Deliverables:
- Dedicated route and screen with steps, left setup and right live review.
- Preview response gains USD amounts and an outside-peer-range flag.
- A summary endpoint that accepts overrides and drives the tiles.
- Formatted editable cells with undo, and quick filters.
- Confirmation dialog and success state.
- Mobile stacking.
- Docs and decision updates.

### Phase 3 — Seed, data model, history chart

Deliverables:
- `employees.deactivated_on`: migration, writer and reactivate behaviour.
- `db:reset` command, plus a README note.
- Seed changes:
  - full history from the hire date, with a yearly cycle across 10 years;
  - skipped raises (3–5% of active employees for 2+ years);
  - compression groups;
  - promotions at 10–20%;
  - dated deactivations;
  - tests for each pattern.
- Re-measured seed time in `docs/performance.md`.
- Drawer History tab: step chart with 3Y / 5Y / 10Y / All, summary line and stats.

### Phase 4 — Insights

Deliverables:
- Domain calculations (pure, tested):
  - payroll snapshot at a date;
  - payroll change by cause, whose parts reconcile with the snapshot difference;
  - raise statistics by year;
  - level bands with step ratios and overlap;
  - attention rules (outside peer range, no raise in 24 months, compression), with thresholds in one module.
- Endpoints for headline tiles, trend, by-cause, raises, level bands and attention counts. Range and year parameters on recent changes.
- `attention` filter on the employee list and its facet.
- Insights page with question cards, answer sentences, "View as table", the full-breakdown expander (FR-6) and the all-changes page.
- `docs/requirements.md` FR updates and acceptance criteria. Architecture and decisions updates.

## Cross-phase interfaces

Later phases rely on these names. Phase plans must keep them.

- The list query schema in `packages/shared/src/employees.ts`:
  - `country`, `department` and `level` become arrays (`string[]`, `number[]`, `number[]`), accepting repeated query params;
  - `sortBy` adds `jobTitle | department | level | country`.
  - Phase 4 adds `attention: ('outlier-above' | 'outlier-below' | 'no-raise-2y' | 'compression')[]`.
- Shared UI building blocks live in `apps/web/src/components/ui/` (one file per block). Phases 2–4 import from there.
- The peer-group statistics used by the drawer (phase 1) come from one service function. The bulk outside-peer-range flag (phase 2) and the attention rules (phase 4) reuse it.
- `employees.deactivated_on` (phase 3) is read by payroll snapshots (phase 4).
