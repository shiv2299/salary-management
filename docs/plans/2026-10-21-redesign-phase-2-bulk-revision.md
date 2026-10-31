# Redesign Phase 2: Bulk Revision Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the inline bulk-revision panel with a dedicated screen at `/employees/revisions/new` (spec §7): a step indicator, a left setup column, a right live review whose headline figures come from a server summary that follows hand edits, a confirmation dialog and a success state.

**Architecture:** The API's bulk preview rows gain USD amounts, a per-row change in basis points and an outside-peer-range flag (from phase 1's `getPeerGroups` + `peerPosition`). A pure `domain/bulk-summary.ts` computes the added payroll per currency, its USD total and the typical (median) pay before and after; `POST /api/employees/bulk-salary-changes/summary` wraps it for a selection, a percentage and the current overrides, and `GET /api/employees/bulk-salary-changes/latest` returns the last batch. The web app gets a `features/bulk-revision/` folder: the selection travels in the screen's query string (the list's own query plus `select=all` or `ids=…`), TanStack Query holds the preview and the debounced summary, and the page is split into setup, review, amount cell, confirm dialog and figure-text helpers. The old panel is deleted once the screen is complete.

**Tech Stack:** Fastify 5, Drizzle ORM + better-sqlite3, Zod 4 (`packages/shared`), Next.js 16 App Router, TanStack Query 5, Radix (`radix-ui`) dialog, Tailwind 4, Vitest + React Testing Library. No new dependencies.

**Spec:** `docs/plans/2026-10-21-ui-ux-redesign-design.md` (binding; §7, with §3, §4 and §11). Overview plan: `docs/plans/2026-10-21-ui-ux-redesign.md`. Phase 1 plan (names this phase builds on): `docs/plans/2026-10-21-redesign-phase-1-style-and-employees.md`.

## Global Constraints

Copied verbatim from the overview plan (apply to every task):

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

Phase-specific:

- The commit trailer names the model that authored the commit, for example `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. The commit commands below show the Opus line; swap in the authoring model's name.
- The screen's route is `/employees/revisions/new` (`BULK_REVISION_PATH`). Never a one-segment child such as `/employees/bulk-revision`: the drawer's intercepting route `@drawer/(.)employees/[id]` compiles to the rewrite source `/employees/:id` and would swallow every soft navigation to it.
- The selection lives only in the query string: the list's own params, plus `select=all` (everyone active matching the list's search/country/department/level) or `ids=3,12` (ascending, comma-joined, unencoded, at most `MAX_PICKED_IDS = 1000`). No `localStorage`/`sessionStorage`.
- Outside-peer-range uses `getPeerGroups` (`services/peer-groups.ts`) and `peerPosition` (`domain/peer-groups.ts`) on the employee's current pay; `outsidePeerRange` is `position.outlier` (`'above' | 'below' | null`; `null` for a group without a summary). No second rule.
- Every figure that converts or applies a % comes from the API: per-row USD and `changeBp` from the preview; added payroll, typical pay, the overridden count and each edit's `changeBp` from the summary. The browser only counts rows, compares integers, filters names and formats.
- Debounce: the typed percentage and the summary's override list each wait `400` ms (`useDebouncedValue` from `apps/web/src/hooks/use-debounced-value.ts`, on a string so the effect stays stable).
- Preview and summary queries use `staleTime: Infinity` and `refetchOnWindowFocus: false`: the review never changes under the user except after a 409.
- Do not import from, edit or depend on the internals of `apps/web/src/features/employees/salary-change-form.tsx` (another change is in flight there).
- Test commands use `npm test -w @acme/api -- <file filter>` or `npm test -w @acme/web -- <file filter>`; "PASS" means Vitest reports every selected file passed.
- UI copy in this plan is exact (labels, button names, messages). Tests query by it.

## Review Focus

1. **Percentage changes answered out of order** (choose 3%, then 10% while the 3% preview is still in flight; the 3% response arrives last): the table and tiles show the 10% figures. Test added in Task 8.
2. **A missing, malformed or oversized selection in the URL** (bookmark of `/employees/revisions/new`, `ids=abc`, `ids=1,x`, 1,001 ids): the screen says no one is selected, links back to the list, and sends no preview or summary request. Tests added in Tasks 6 and 7.
3. **A selection with no active employees left** (everyone picked was deactivated since): the review says so, the tiles do not render, and the confirm button stays disabled. Test added in Task 8.
4. **The summary request fails** (network error, server down) after an edit: the tiles area says the totals could not be updated, offers Retry, and the dialog's Apply stays disabled so nobody confirms against a stale cost. Test added in Task 8.
5. **Hand edits typed the way people type money** (`19,82,182.62` for an Indian salary, `110000` with no separators, a value equal to the proposed one): each parses, a valid edit is re-shown formatted on blur, an edit equal to the proposed amount stops counting as an edit, and invalid text still blocks the confirm and shows under "Overridden". Tests added in Tasks 6 and 8.

---

## File structure

API (`apps/api/src`):
- `domain/bulk-summary.ts` (create) + test: `bulkRevisionFigures` — added payroll per currency and in USD, typical pay before/after.
- `services/bulk-revision.ts` (modify): preview row additions; `summariseBulkRevision`; `getLatestBulkRevision`; one private `selectedRows` for both reads.
- `repositories/salary-revision-batches.ts` (modify): `findLatestSalaryRevisionBatch`.
- `routes/employees.ts` (modify): `POST /api/employees/bulk-salary-changes/summary`, `GET /api/employees/bulk-salary-changes/latest`.
- `perf/measure-latency.ts` (modify): POST cases.

Shared (`packages/shared/src`): `bulk-revision.ts`, `index.ts` (modify).

Web (`apps/web/src`):
- `app/(app)/employees/revisions/new/page.tsx` (create): the route.
- `components/ui/step-indicator.tsx` (create): the step indicator building block.
- `lib/money.ts` (modify): `formatInputAmount`.
- `features/bulk-revision/` (create):
  - `selection.ts` — URL ⇄ selection, back link, default note;
  - `bulk-state.ts` (moved from `features/employees/`) — override resolution, review filtering, confirm body;
  - `figures-text.ts` — tile and dialog wording for the summary figures;
  - `use-bulk-revision.ts` — query and mutation hooks;
  - `bulk-revision-page.tsx` — state, header, steps, layout, footer, success;
  - `bulk-setup.tsx` — left column;
  - `bulk-review.tsx` — right column (tiles, toolbar, table / stacked rows, pagination);
  - `amount-cell.tsx` — the editable new-salary cell;
  - `confirm-dialog.tsx` — the confirmation dialog.
- `features/employees/employees-page.tsx` (modify): "Apply % increase" navigates to the screen.
- `features/employees/bulk-revision-panel.tsx` + test (delete in Task 10).
- `test/fixtures.ts` (modify): `bulkPreviewItem()`, `bulkSummary()`.

---

### Task 1: Product docs for the bulk revision screen

**Files:**
- Modify: `docs/design.md` (§4, §5 "Building blocks" and "Bulk-revision flow", §7), `docs/architecture.md` (§7 table, §8 tree and bullets), `docs/decisions.md`, `docs/requirements.md` (FR-4 and its acceptance row)

**Interfaces:**
- Produces: the binding text for Tasks 2–10. Names fixed here: route `/employees/revisions/new`; endpoints `POST /api/employees/bulk-salary-changes/summary`, `GET /api/employees/bulk-salary-changes/latest`; preview row fields `currentAmountBaseMinor`, `proposedAmountBaseMinor`, `changeBp`, `outsidePeerRange`; building block `step-indicator.tsx`.

- [ ] **Step 1: Update `docs/design.md`**

§4: add a bullet "**`/employees/revisions/new`** is the bulk revision screen, reached from the list's selection bar. Its query string carries the list's own query plus the selection (`select=all` or `ids=…`), so refresh, back and a copied link show the same screen."

§5 "Building blocks": add step indicator (`step-indicator.tsx`).

§5: replace the "Bulk-revision flow" bullet with a "Bulk revision screen" bullet and sub-bullets that pin:
- Header: "← Back to employees" (to the list with its filters, sort and page), the title "Bulk salary revision", and a step indicator "Choose people ✓ → Set increase & review → Confirm" (the second step current; the third while the dialog is open; all done after confirming).
- Left column, on `surface`: section labels "Who", "Increase", "Effective date", "Note", "Last bulk revision". Who = "N people, active only", the list's filter chips (read-only; a search shows as a `Search: ann` chip; the status chip is left out because only active people are revised), "Picked by hand from this list." for a hand-picked selection, "Everyone active" when nothing narrows it, and the headcount per department (largest first). Increase = a % input plus quick buttons 3 / 4 / 5 / 8 / 10%; no percentage is pre-chosen. Effective date defaults to today and cannot be in the future. Note is pre-filled from the selection ("Engineering, L3, India") and "Shown in each person's salary history." Last bulk revision = "1 Apr 2026 · 4% · 1,233 people" and its note, or "No bulk revision yet."
- Right column, white: until a percentage is chosen, "Choose an increase to see the review." Then four stat tiles in a row: Added to annual payroll (one currency: that amount, with the USD equivalent as the hint unless it is USD; several currencies: the USD total, with each currency's sum as the hint), Typical pay (median after, hint "up from <before> · median", plus ", in USD" when the selection spans currencies), Rows overridden ("of N"), Outside peer range (in `warning` when above zero, hint "before this revision"); the FX date under the tiles whenever a non-USD amount appears. Then search ("Search by name") and a segmented control "All / Overridden (n) / Outside peer range (n)"; then the table Employee, Department, Current, New salary, Change, 50 rows per page, edits kept across pages and filters.
- New salary cell: a bordered, right-aligned input showing the amount with digit grouping (`1,982,182.62`; Indian grouping for INR), the currency code beside it. An edited valid cell is amber-tinted (`warning` border, `warning` at 10% fill) with a small "edited · undo" tag under it in `warning`; an invalid one shows the existing red message. An edit equal to the proposed amount is not an edit. Change is the server's % in `positive`; "…" while an edit's figure is being fetched; "—" for an invalid edit. A person outside their peer range carries an "Above range" / "Below range" tag with an icon.
- Footer (sticky): "Nothing is saved until you confirm the changes.", a Cancel link (back to the list), and "Review & confirm N changes →", disabled while any edit is invalid, the date is missing or in the future, or nothing is loaded. The dialog "Confirm salary revision" lists Increase (and "n edited by hand"), People, Effective, Added to annual payroll and Note, with "Back to review" and "Apply N raises".
- After confirming: "Revision applied", "N raises recorded, effective <date>.", and links "View employees" and "View insights". A 409 closes the dialog, shows the toast "Salaries changed since the preview. The preview has been reloaded.", reloads the preview and keeps edits for people whose pay did not change; any other error shows inside the dialog.

§7: replace "The bulk-revision preview table becomes a vertically stacked list of editable rows." with "On the bulk revision screen the setup stacks above the review, the review table becomes a stacked list of editable rows, and the footer stays pinned to the bottom with a full-width confirm button."

- [ ] **Step 2: Update `docs/architecture.md`**

§7 table:
- Bulk preview row: each item also carries `currentAmountBaseMinor` (the cached USD amount), `proposedAmountBaseMinor` (converted once in `domain/`), `changeBp` (`percentChangeBp(current, proposed)`) and `outsidePeerRange` (`'above' | 'below' | null`, the FR-8 rule from `getPeerGroups` on current pay).
- New row `POST /api/employees/bulk-salary-changes/summary`: `{ filter | employeeIds, percentageBp?, overrides?: [{ employeeId, newAmountMinor }] }` → `headcount`, `byDepartment`, and with a percentage `revision`: `addedByCurrency`, `addedBaseMinor`, `typical { currencyCode, beforeMinor, afterMinor }`, `overriddenCount`, `overrideChangeBp`. Read-only; overrides for people outside the selection are ignored.
- New row `GET /api/employees/bulk-salary-changes/latest` → `{ latest: { batchId, effectiveDate, percentageBp, employeeCount, note } | null }`, the batch with the latest effective date (highest id on a tie).

§8 tree: add `(app)/employees/revisions/new/page.tsx  # bulk revision screen; selection carried in the query string`; `features/bulk-revision/  # selection ⇄ URL, preview/summary hooks, setup and review columns, confirm dialog`; change the `employees/` comment to drop "bulk-revision preview state" and the `(app)/employees/page.tsx` comment to "…bulk selection bar". Add a bullet: "The bulk revision screen reads its selection from its own query string, loads the preview and a debounced summary through TanStack Query, and never computes a money figure; the preview stays the full set held in the browser, which pages, searches and filters it locally."

- [ ] **Step 3: Update `docs/decisions.md`**

Rename "Frontend: bulk-revision total shown per currency, batch rows not expandable" to "Frontend: batch rows not expandable, list state in the URL, native selects". Replace its first bullet with "The bulk revision total is no longer the browser's per-currency sum: see 'Bulk revision figures: a server summary that follows the edits'." Drop the first sentence of its Why and the "single USD figure" clause of its Revisit.

Add five entries (Alternatives considered / Chosen / Why):
1. "Bulk revision: its own screen at `/employees/revisions/new`, the selection in the query string" — alternatives: the panel that replaced the list; `/employees/bulk-revision` (the drawer's intercepting route rewrites every one-segment `/employees/<x>` soft navigation into the drawer); carrying the selection in `sessionStorage` or in memory (lost on a new tab, missing when storage is blocked, gone after a refresh in memory). Chosen: the list's own query plus `select=all` or `ids=3,12`; at most 1,000 hand-picked people (about 6 KB of URL), beyond which the selection bar asks for "select all matching". Why: refresh, back and a copied link reproduce the screen, and "Back to employees" rebuilds the list exactly. A `select=all` filter is evaluated when the screen loads; the confirm still sends the explicit reviewed list (see "Bulk revision: confirm an explicit, checked list, not a filter"). Also: no percentage is pre-chosen, and changing it keeps hand edits, because an edit is an amount the HR Manager typed, not a percentage.
2. "Bulk revision figures: a server summary that follows the edits" — alternatives: the browser's per-currency sums only (the old rule); converting each row to USD and adding (rounds once per person); the average instead of the median. Chosen: `POST …/summary` re-posted 400 ms after the last edit. Added payroll is the exact integer sum of new minus current per currency; the USD total converts each currency's sum once (half away from zero) and adds them. Typical pay is the median before and after: in the local currency when everyone selected is paid in one currency, otherwise in USD (before from the cached USD amount, after from each new amount converted once). Why: the browser never converts or applies a percentage, so every figure that does comes from `domain/`; one rounding per currency keeps the USD total consistent with the per-currency figures shown beside it; the median is the "typical" the rest of the app uses and one outlier cannot move it.
3. "Bulk review: search and quick filters run over the loaded preview" — the preview is already the full selection held in the browser (see "Bulk revision: confirm an explicit, checked list…"), so name search and the Overridden / Outside peer range filters need no request. It is plain table markup rather than TanStack Table: it has no sorting, column choice or row selection, which are what TanStack brings.
4. "Bulk revision: 'outside peer range' is the FR-8 rule on current pay" — the flag is `peerPosition(...).outlier` from `getPeerGroups`, on pay before the revision, so it matches the drawer and the outliers list; groups under 10 are not evaluated. It is a heads-up, not a block.
5. "Last bulk revision: the batch with the latest effective date" — alternative: the first batch entry of recent changes (windowed to 3 or 5 years and paginated, so an older revision would be missed). Chosen: `GET …/latest`, latest `effective_date`, highest id on a tie; the batch table is small, so no index.

- [ ] **Step 4: Update `docs/requirements.md`**

FR-4: append "Before confirming, the HR Manager sees what the revision adds to annual payroll (per currency and in USD), the typical pay before and after, and who is already outside their peer range." FR-4 acceptance row: append "The added payroll shown before confirming equals, per currency, the sum of new minus current amounts including hand edits, and its USD total equals each currency's sum converted once at the documented rate."

- [ ] **Step 5: Check wording and formatting**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run format:check`, and reread the added lines against the wording rule in the Global Constraints.
Expected: Prettier reports all files formatted; no added line breaks the wording rule.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add docs/design.md docs/decisions.md docs/requirements.md docs/architecture.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "docs: describe the bulk revision screen, its summary figures and selection in the URL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Preview rows carry USD amounts, the change and the outside-peer-range flag

**Files:**
- Modify: `packages/shared/src/bulk-revision.ts`, `apps/api/src/services/bulk-revision.ts`, `apps/web/src/test/fixtures.ts`, `apps/web/src/features/employees/bulk-state.test.ts`, `apps/web/src/features/employees/bulk-revision-panel.test.tsx`
- Test: `apps/api/src/services/bulk-revision.test.ts`, `apps/api/src/routes/bulk-revision.test.ts`

**Interfaces:**
- Consumes: `getPeerGroups` (`services/peer-groups.ts`), `peerGroupKey`, `peerPosition` (`domain/peer-groups.ts`), `convert`, `BASE_CURRENCY` (`domain/fx.ts`), `percentChangeBp`, `proposedAmount` (`domain/revision.ts`), `loadLatestFxRates`.
- Produces (shared): `bulkPreviewItemSchema` adds `currentAmountBaseMinor: z.number().int()`, `proposedAmountBaseMinor: z.number().int()`, `changeBp: z.number().int()`, `outsidePeerRange: z.enum(['above', 'below']).nullable()`.
- Produces (service): `export type BulkSelectionInput = { filter: { country?: string[]; department?: number[]; level?: number[]; search?: string } } | { employeeIds: number[] }`; `BulkPreviewInput = BulkSelectionInput & { percentageBp: number }`; a private `selectedRows(db, selection): EmployeeListRow[]` (the existing ids/filter branch) reused by Task 4.
- Produces (web test): `bulkPreviewItem(overrides?: Partial<BulkPreviewItem>): BulkPreviewItem` in `apps/web/src/test/fixtures.ts`, defaults `{ employeeId: 1, firstName: 'Asha', lastName: 'Rao', countryCode: 'US', departmentName: 'Engineering', levelCode: 'L3', currencyCode: 'USD', currentAmountMinor: 10_000_000, proposedAmountMinor: 10_700_000, currentAmountBaseMinor: 10_000_000, proposedAmountBaseMinor: 10_700_000, changeBp: 700, outsidePeerRange: null }`.

- [ ] **Step 1: Write the failing service tests**

In `services/bulk-revision.test.ts` under `previewBulkRevision` (the file's `add()` creates US/L1 Engineering employees hired 2020-01-01; IN amounts are INR):

```ts
it('gives each row its current and proposed pay in USD and the change in basis points', () => {
  const india = add({ countryCode: 'IN', amountMinor: 500_000_000 });
  const odd = add({ amountMinor: 333 });
  const items = previewBulkRevision(database.db, { employeeIds: [india, odd], percentageBp: 700 }).items;
  expect(items.find((i) => i.employeeId === india)).toMatchObject({
    currencyCode: 'INR', currentAmountMinor: 500_000_000, proposedAmountMinor: 535_000_000,
    currentAmountBaseMinor: 5_990_000, proposedAmountBaseMinor: 6_409_300, changeBp: 700,
  });
  // 333 → 356 after rounding, so the change is 6.91%, not the 7% asked for
  expect(items.find((i) => i.employeeId === odd)).toMatchObject({ proposedAmountMinor: 356, changeBp: 691 });
});

it('flags people already outside their peer range by the same rule as the outliers list', () => {
  const peers = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((m) => add({ amountMinor: m * 1_000_000 }));
  const high = add({ amountMinor: 100_000_000 }); // US/L1 fences are $50,000.00 – $250,000.00
  const items = previewBulkRevision(database.db, { filter: { level: [1] }, percentageBp: 100 }).items;
  expect(items.find((i) => i.employeeId === high)?.outsidePeerRange).toBe('above');
  expect(items.filter((i) => peers.includes(i.employeeId)).map((i) => i.outsidePeerRange)).toEqual(Array(10).fill(null));
});

it('does not flag anyone in a peer group smaller than the minimum size', () => {
  add({ amountMinor: 10_000_000 }); add({ amountMinor: 11_000_000 }); add({ amountMinor: 100_000_000 });
  const items = previewBulkRevision(database.db, { filter: {}, percentageBp: 100 }).items;
  expect(items.map((i) => i.outsidePeerRange)).toEqual([null, null, null]);
});
```

In `routes/bulk-revision.test.ts`, extend `returns every matching active employee with the proposed amount` to expect Ann's item to include `currentAmountBaseMinor: 10_000_000`, `changeBp` equal to the request's percentage, and `outsidePeerRange: null`.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- bulk-revision`
Expected: FAIL (the new fields are undefined).

- [ ] **Step 3: Implement the schema and the service**

Add the four fields to `bulkPreviewItemSchema`. In `previewBulkRevision`, load the rates once and `getPeerGroups(db, keys)` once for the distinct `{ countryCode, levelId }` pairs of the selected rows; per row: `proposedAmountBaseMinor = convert(proposed, row.currentCurrencyCode, BASE_CURRENCY, rates)`, `changeBp = percentChangeBp(current, proposed)`, `outsidePeerRange = summary ? peerPosition({ amountMinor: current, amountBaseMinor: row.currentAmountBaseMinor }, summary).outlier : null`. Extract `selectedRows` and the two exported input types.

- [ ] **Step 4: Keep the web suite compiling**

Add `bulkPreviewItem()` to `apps/web/src/test/fixtures.ts`. In `features/employees/bulk-state.test.ts` and `bulk-revision-panel.test.tsx`, build their local `item()` / `previewItem()` helpers on `bulkPreviewItem({ ...theirCurrentDefaults, ...overrides })` so every existing assertion keeps its values.

- [ ] **Step 5: Run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared/src/bulk-revision.ts apps/api/src apps/web/src/test/fixtures.ts apps/web/src/features/employees
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add USD amounts, the change and an outside-peer-range flag to bulk preview rows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Domain figures for a bulk revision

**Files:**
- Create: `apps/api/src/domain/bulk-summary.ts`, `apps/api/src/domain/bulk-summary.test.ts`

**Interfaces:**
- Consumes: `convert`, `BASE_CURRENCY`, `FxRates` (`domain/fx.ts`); `computeDistribution` (`domain/stats.ts`, throws on an empty array).
- Produces:
  ```ts
  export interface BulkFigureRow { currencyCode: string; currentAmountMinor: number; currentAmountBaseMinor: number; newAmountMinor: number }
  export interface BulkRevisionFigures {
    addedByCurrency: { currencyCode: string; addedMinor: number }[]; // one entry per currency present, by code
    addedBaseMinor: number;                                          // Σ convert(addedMinor of each currency → USD)
    typical: { currencyCode: string; beforeMinor: number; afterMinor: number } | null; // null for no rows
  }
  export function bulkRevisionFigures(rows: BulkFigureRow[], rates: FxRates): BulkRevisionFigures;
  ```
  Typical: when every row shares one currency, the medians of `currentAmountMinor` and `newAmountMinor` in it; otherwise USD medians of `currentAmountBaseMinor` and of each `convert(newAmountMinor → USD)`.

- [ ] **Step 1: Write the failing tests**

```ts
const rates = { INR: 11_980_000, EUR: 1_080_000_000 };
const usd = (current: number, next: number) => ({ currencyCode: 'USD', currentAmountMinor: current, currentAmountBaseMinor: current, newAmountMinor: next });

it('sums the added pay exactly within each currency and converts each sum once for the USD total', () => {
  const rows = [usd(10_000_000, 10_700_000), usd(20_000_000, 21_000_000),
    { currencyCode: 'INR', currentAmountMinor: 500_000_000, currentAmountBaseMinor: 5_990_000, newAmountMinor: 535_000_000 }];
  expect(bulkRevisionFigures(rows, rates)).toEqual({
    addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }, { currencyCode: 'USD', addedMinor: 1_700_000 }],
    addedBaseMinor: 2_119_300,
    typical: { currencyCode: 'USD', beforeMinor: 10_000_000, afterMinor: 10_700_000 },
  });
});

it('gives the typical pay in the local currency when everyone is paid in it', () => {
  const inr = (current: number, base: number, next: number) => ({ currencyCode: 'INR', currentAmountMinor: current, currentAmountBaseMinor: base, newAmountMinor: next });
  const figures = bulkRevisionFigures([inr(400_000_000, 4_792_000, 428_000_000), inr(500_000_000, 5_990_000, 535_000_000)], rates);
  expect(figures.typical).toEqual({ currencyCode: 'INR', beforeMinor: 450_000_000, afterMinor: 481_500_000 });
  expect(figures.addedBaseMinor).toBe(754_740);
});

it('rounds the USD total once per currency, not once per person', () => {
  const row = { currencyCode: 'INR', currentAmountMinor: 1_000, currentAmountBaseMinor: 12, newAmountMinor: 1_050 };
  expect(bulkRevisionFigures([row, row, row], rates).addedBaseMinor).toBe(2); // per person would give 3
});

it('gives no figures for an empty selection', () => {
  expect(bulkRevisionFigures([], rates)).toEqual({ addedByCurrency: [], addedBaseMinor: 0, typical: null });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/bulk-summary`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `bulkRevisionFigures` in `domain/bulk-summary.ts`**

Sum per currency in `BigInt`, then `Number()` with a `Number.isSafeInteger` guard (throw like `proposedAmount` does).

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/bulk-summary`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src/domain/bulk-summary.ts apps/api/src/domain/bulk-summary.test.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): compute a bulk revision's added payroll and typical pay in the domain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Bulk revision summary endpoint and its latency

**Files:**
- Modify: `packages/shared/src/bulk-revision.ts`, `packages/shared/src/index.ts`, `apps/api/src/services/bulk-revision.ts`, `apps/api/src/routes/employees.ts`, `apps/api/src/perf/measure-latency.ts`, `docs/performance.md`
- Test: `apps/api/src/services/bulk-revision.test.ts`, `apps/api/src/routes/bulk-revision.test.ts`

**Interfaces:**
- Consumes: `selectedRows`, `BulkSelectionInput` (Task 2); `bulkRevisionFigures` (Task 3); `proposedAmount`, `percentChangeBp`, `loadLatestFxRates`.
- Produces (shared):
  - `bulkOverrideSchema = z.object({ employeeId: positive int, newAmountMinor: positive int }).strict()`, type `BulkOverride`.
  - `bulkSummaryBodySchema` (strict): `{ filter?, employeeIds?, percentageBp?, overrides?: BulkOverride[] (max 100,000) }`, refined with "provide exactly one of filter or employeeIds", "overrides need a percentageBp", "an employee appears more than once". Type `BulkSummaryBody`.
  - `bulkSummaryResponseSchema`, type `BulkSummary`:
    ```ts
    { headcount: number;
      byDepartment: { departmentName: string; headcount: number }[];  // headcount desc, then name asc
      revision: null | {
        percentageBp: number; overriddenCount: number;
        addedByCurrency: { currencyCode: string; addedMinor: number }[];
        addedBaseMinor: number;
        typical: { currencyCode: string; beforeMinor: number; afterMinor: number } | null;
        overrideChangeBp: { employeeId: number; changeBp: number }[] } } // by employeeId
    ```
- Produces (service/route): `summariseBulkRevision(db, input: BulkSelectionInput & { percentageBp?: number; overrides?: BulkOverride[] }): BulkSummary`; `POST /api/employees/bulk-salary-changes/summary` (200, read-only). An override counts only for a selected employee whose override differs from the proposed amount; others are ignored.

- [ ] **Step 1: Write the failing tests**

In `services/bulk-revision.test.ts` (let `add()` also take `departmentId`; insert department "Sales" (id 2) where a test needs it):

```ts
describe('summariseBulkRevision', () => {
  it('totals the selection with its hand edits per currency and in USD', () => {
    const a = add({ amountMinor: 10_000_000 });
    const b = add({ amountMinor: 20_000_000 });
    const c = add({ countryCode: 'IN', amountMinor: 500_000_000 });
    expect(summariseBulkRevision(database.db, {
      employeeIds: [a, b, c], percentageBp: 700, overrides: [{ employeeId: b, newAmountMinor: 21_000_000 }],
    })).toEqual({
      headcount: 3,
      byDepartment: [{ departmentName: 'Engineering', headcount: 3 }],
      revision: {
        percentageBp: 700, overriddenCount: 1,
        addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }, { currencyCode: 'USD', addedMinor: 1_700_000 }],
        addedBaseMinor: 2_119_300,
        typical: { currencyCode: 'USD', beforeMinor: 10_000_000, afterMinor: 10_700_000 },
        overrideChangeBp: [{ employeeId: b, changeBp: 500 }],
      },
    });
  });
  it('gives only the headcount and departments when no percentage is chosen', () => { /* revision: null */ });
  it('orders the department breakdown by headcount, then by name', () => { /* Sales ×2, Engineering ×1 → [Sales 2, Engineering 1] */ });
  it('ignores edits for people outside the selection and edits equal to the proposed amount', () => {
    /* override for an unselected id and one equal to proposed → overriddenCount 0, overrideChangeBp [] */
  });
  it('counts only active people', () => { /* deactivate one of two picked → headcount 1 */ });
  it('does not write anything', () => { /* salary_history row count unchanged */ });
});
```

In `routes/bulk-revision.test.ts`, `describe('POST /api/employees/bulk-salary-changes/summary')`: `it('returns the figures for the selection, percentage and edits')` (`{ filter: { country: ['US'] }, percentageBp: 500 }` → 200, `headcount: 2`, `revision.addedByCurrency` `[{ currencyCode: 'USD', addedMinor: 1_500_000 }]`); `it('rejects edits without a percentage with 400')`; `it('rejects the same employee edited twice with 400')`; `it('requires a session')` (401).

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- bulk-revision`
Expected: FAIL (`summariseBulkRevision` is not exported / 404).

- [ ] **Step 3: Implement schemas, service and route**

New amount per row = the selected employee's override, else `proposedAmount(current, percentageBp)`. Feed `bulkRevisionFigures`; `overrideChangeBp` uses `percentChangeBp(current, override)`. Register the route next to the preview route (static path) with `body: bulkSummaryBodySchema`, `response: { 200: bulkSummaryResponseSchema }`, mapping the body to `BulkSelectionInput` the way the preview route does. Export the new schemas and types from `index.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS.

- [ ] **Step 5: Measure preview and summary latency on the full seed**

In `measure-latency.ts`, let a case be a URL string (GET) or `{ method: 'POST'; url: string; payload: object; label: string }`; add `{ label: 'POST …/preview (all active, 7%)', url: '/api/employees/bulk-salary-changes/preview', payload: { filter: {}, percentageBp: 700 } }` and the same body against `/summary`. Then run:

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && mkdir -p apps/api/data && rm -f apps/api/data/perf.db* && DATABASE_PATH=./data/perf.db SEED_RNG_SEED=42 SEED_REFERENCE_DATE=2026-10-21 HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run db:seed -w @acme/api && DATABASE_PATH=./data/perf.db HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run perf:latency -w @acme/api
```
Expected: one row per case; the preview and summary p95 each below 300 ms. Replace the old preview row in `docs/performance.md` with the new one (it now also reads peer groups and converts) and add the summary row, dated 2026-10-21 with the same method sentence. Delete `apps/api/data/perf.db*`.

- [ ] **Step 6: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared/src apps/api/src docs/performance.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add a bulk revision summary that follows hand edits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Latest bulk revision endpoint

**Files:**
- Modify: `packages/shared/src/bulk-revision.ts`, `packages/shared/src/index.ts`, `apps/api/src/repositories/salary-revision-batches.ts`, `apps/api/src/services/bulk-revision.ts`, `apps/api/src/routes/employees.ts`
- Test: `apps/api/src/services/bulk-revision.test.ts`, `apps/api/src/routes/bulk-revision.test.ts`

**Interfaces:**
- Produces (shared): `latestBulkRevisionSchema = z.object({ latest: z.object({ batchId, effectiveDate, percentageBp, employeeCount, note: z.string().nullable() }).nullable() })`, type `LatestBulkRevision`.
- Produces (repository): `findLatestSalaryRevisionBatch(db): SalaryRevisionBatch | undefined` — order by `effective_date` desc, `id` desc, limit 1.
- Produces (service/route): `getLatestBulkRevision(db): LatestBulkRevision`; `GET /api/employees/bulk-salary-changes/latest`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('getLatestBulkRevision', () => {
  const batch = (effectiveDate: string, note: string | null) =>
    insertSalaryRevisionBatch(database.db, { createdAt: FIXED_NOW, effectiveDate, percentageBp: 400, employeeCount: 12, note });
  it('gives the bulk revision with the latest effective date, the newest on a tie', () => {
    batch('2025-04-01', 'Annual increment 2025');
    batch('2024-04-01', 'Annual increment 2024');
    expect(getLatestBulkRevision(database.db).latest).toEqual({ batchId: 1, effectiveDate: '2025-04-01', percentageBp: 400, employeeCount: 12, note: 'Annual increment 2025' });
    batch('2025-04-01', null);
    expect(getLatestBulkRevision(database.db).latest).toMatchObject({ batchId: 3, note: null });
  });
  it('gives none before any bulk revision', () => {
    expect(getLatestBulkRevision(database.db)).toEqual({ latest: null });
  });
});
```

Route: `describe('GET /api/employees/bulk-salary-changes/latest')` → `it('answers with no revision on a fresh database')` (200, `{ latest: null }`), `it('requires a session')`.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- bulk-revision`
Expected: FAIL.

- [ ] **Step 3: Implement repository, service and route; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS.

- [ ] **Step 4: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared/src apps/api/src
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): return the latest bulk revision" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Selection in the URL, review state and figure wording

**Files:**
- Create: `apps/web/src/features/bulk-revision/selection.ts`, `selection.test.ts`, `figures-text.ts`, `figures-text.test.ts`
- Move: `apps/web/src/features/employees/bulk-state.ts` and `bulk-state.test.ts` → `apps/web/src/features/bulk-revision/` (`git mv`); update the import in `features/employees/bulk-revision-panel.tsx`
- Modify: `apps/web/src/lib/money.ts`, `apps/web/src/lib/money.test.ts`, `apps/web/src/test/fixtures.ts`

**Interfaces:**
- Consumes: `filtersFromParams`, `bulkFilterFrom` (`features/employees/list-filters.ts`); `BulkSummary`, `BulkOverride` (Task 4); `formatMoney`, `formatSignedMoney`, `parseMajorToMinor`.
- Produces (`lib/money.ts`): `formatInputAmount(amountMinor: number, currencyCode: string): string` — grouped, always the currency's minor digits, `,` grouping and `.` decimal (en-IN grouping for INR, en-US otherwise), so `parseMajorToMinor` reads it back.
- Produces (`selection.ts`):
  ```ts
  export const BULK_REVISION_PATH = '/employees/revisions/new';
  export const MAX_PICKED_IDS = 1000;
  export type BulkTarget = { filter: NonNullable<BulkPreviewBody['filter']> } | { employeeIds: number[] };
  export function bulkRevisionHref(listQuery: string, selection: { all: true } | { ids: readonly number[] }): string;
  export function selectionFromParams(params: URLSearchParams): BulkTarget | null; // select=all wins over ids
  export function listHrefFrom(params: URLSearchParams): string;                   // drops select and ids
  export function bulkDefaultNote(target: BulkTarget, ref: { countries: Country[]; departments: Department[]; levels: Level[] }): string;
  ```
- Produces (`bulk-state.ts`, keeping `Overrides`, `resolveNewAmount`, `buildConfirmBody`, `keepUnaffectedOverrides`; `summarize` stays until Task 10):
  ```ts
  export type ReviewView = 'all' | 'overridden' | 'outside';
  export function overridesForSummary(items: BulkPreviewItem[], overrides: Overrides): BulkOverride[]; // valid, ≠ proposed, by id
  export function countInvalid(items: BulkPreviewItem[], overrides: Overrides): number;
  export function reviewCounts(items: BulkPreviewItem[], overrides: Overrides): { overridden: number; outside: number };
  export function reviewRows(items: BulkPreviewItem[], overrides: Overrides, options: { search: string; view: ReviewView }): BulkPreviewItem[];
  ```
  "Overridden" = `resolveNewAmount(...).overridden` (so invalid edits are included); search is a case-insensitive substring of "First Last".
- Produces (`figures-text.ts`):
  ```ts
  type Revision = NonNullable<BulkSummary['revision']>;
  export function addedPayrollText(revision: Revision): { headline: string; detail: string | null };
  export function typicalPayText(revision: Revision): { headline: string; detail: string | null };
  ```
- Produces (fixtures): `bulkSummary(overrides?: Partial<BulkSummary>): BulkSummary` with `{ headcount: 2, byDepartment: [{ departmentName: 'Engineering', headcount: 2 }], revision: { percentageBp: 700, overriddenCount: 0, addedByCurrency: [{ currencyCode: 'USD', addedMinor: 1_400_000 }], addedBaseMinor: 1_400_000, typical: { currencyCode: 'USD', beforeMinor: 10_000_000, afterMinor: 10_700_000 }, overrideChangeBp: [] } }`.

- [ ] **Step 1: Write the failing tests**

`lib/money.test.ts`:

```ts
it('formats an amount for an input with digit grouping that it can read back', () => {
  expect(formatInputAmount(198_218_262, 'USD')).toBe('1,982,182.62');
  expect(formatInputAmount(198_218_262, 'INR')).toBe('19,82,182.62');
  expect(formatInputAmount(198_218_262, 'EUR')).toBe('1,982,182.62');
  expect(formatInputAmount(5, 'USD')).toBe('0.05');
  expect(parseMajorToMinor('19,82,182.62', 'INR')).toBe(198_218_262);
});
```

`selection.test.ts`:

```ts
it('carries the list query and the picked ids, in order, into the revision address', () => {
  expect(bulkRevisionHref('country=IN&sortBy=salary', { ids: [12, 3] })).toBe('/employees/revisions/new?country=IN&sortBy=salary&ids=3,12');
  expect(bulkRevisionHref('', { ids: [1] })).toBe('/employees/revisions/new?ids=1');
});
it('carries everyone matching the list as select=all', () => {
  expect(bulkRevisionHref('country=IN&level=3', { all: true })).toBe('/employees/revisions/new?country=IN&level=3&select=all');
});
it('reads picked ids back once each', () => {
  expect(selectionFromParams(new URLSearchParams('country=IN&ids=3,12,3'))).toEqual({ employeeIds: [3, 12] });
});
it('reads select=all back as the list filters a bulk revision understands', () => {
  expect(selectionFromParams(new URLSearchParams('country=IN&status=all&search=ann&page=3&select=all'))).toEqual({ filter: { search: 'ann', country: ['IN'] } });
  expect(selectionFromParams(new URLSearchParams('select=all&ids=3'))).toEqual({ filter: {} });
});
it('finds no selection in a missing, malformed or oversized one', () => {
  for (const query of ['', 'country=IN', 'ids=', 'ids=abc', 'ids=1,x', 'ids=0', 'select=some']) {
    expect(selectionFromParams(new URLSearchParams(query))).toBeNull();
  }
  const tooMany = Array.from({ length: MAX_PICKED_IDS + 1 }, (_, i) => i + 1).join(',');
  expect(selectionFromParams(new URLSearchParams(`ids=${tooMany}`))).toBeNull();
});
it('links back to the list with its own query and without the selection', () => {
  expect(listHrefFrom(new URLSearchParams('country=IN&page=2&ids=3'))).toBe('/employees?country=IN&page=2');
  expect(listHrefFrom(new URLSearchParams('select=all'))).toBe('/employees');
});
it('names the revision after the filters that chose everyone, or as a hand-picked set', () => {
  const ref = { countries: REFERENCE_ROUTES['GET /api/reference/countries'], departments: REFERENCE_ROUTES['GET /api/reference/departments'], levels: REFERENCE_ROUTES['GET /api/reference/levels'] };
  expect(bulkDefaultNote({ filter: { department: [1], level: [3], country: ['IN'] } }, ref)).toBe('Engineering, L3, India');
  expect(bulkDefaultNote({ filter: {} }, ref)).toBe('All matching employees');
  expect(bulkDefaultNote({ employeeIds: [1] }, ref)).toBe('Selected employees');
});
```

`bulk-state.test.ts` (keep the existing tests and their `item()` helper; the new tests share this list):

```ts
const items = [
  bulkPreviewItem(),
  bulkPreviewItem({ employeeId: 2, firstName: 'Ravi', lastName: 'Menon' }),
  bulkPreviewItem({ employeeId: 3, firstName: 'Mia', lastName: 'Lopez', outsidePeerRange: 'below' }),
];
it('sends only valid edits that differ from the proposed amount, ordered by employee', () => {
  expect(overridesForSummary(items, { 3: '120000', 1: '107,000.00', 2: 'abc', 9: '200000' }))
    .toEqual([{ employeeId: 3, newAmountMinor: 12_000_000 }]);
});
it('counts edits that are not a valid raise', () => { expect(countInvalid(items, { 1: 'abc', 2: '90000' })).toBe(2); });
it('counts edited rows, invalid ones included, and people outside their peer range', () => {
  expect(reviewCounts(items, { 1: 'abc', 2: '120000' })).toEqual({ overridden: 2, outside: 1 });
});
it('finds people by any part of their name, ignoring case', () => {
  expect(reviewRows(items, {}, { search: 'menON', view: 'all' }).map((i) => i.employeeId)).toEqual([2]);
});
it('shows only the edited rows or only the people outside their peer range', () => {
  expect(reviewRows(items, { 2: '120000' }, { search: '', view: 'overridden' }).map((i) => i.employeeId)).toEqual([2]);
  expect(reviewRows(items, {}, { search: '', view: 'outside' }).map((i) => i.employeeId)).toEqual([3]);
});
```

`figures-text.test.ts` (`rev` = `bulkSummary().revision!` with overrides):

```ts
it('shows the added payroll of a single-currency selection in that currency', () => {
  expect(addedPayrollText(rev())).toEqual({ headline: '+$14,000.00', detail: null });
  expect(addedPayrollText(rev({ addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }], addedBaseMinor: 419_300 })))
    .toEqual({ headline: '+₹3,50,000.00', detail: '+$4,193.00 in USD' });
});
it('shows the USD total with each currency beside it for a mixed selection', () => {
  expect(addedPayrollText(rev({ addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }, { currencyCode: 'USD', addedMinor: 1_700_000 }], addedBaseMinor: 2_119_300 })))
    .toEqual({ headline: '+$21,193.00', detail: '+₹3,50,000.00 · +$17,000.00' });
});
it('gives the typical pay after with the pay before as the hint, saying when it is in USD', () => {
  expect(typicalPayText(rev())).toEqual({ headline: '$107,000.00', detail: 'up from $100,000.00 · median' });
  expect(typicalPayText(rev({ addedByCurrency: [{ currencyCode: 'INR', addedMinor: 1 }, { currencyCode: 'USD', addedMinor: 1 }] })).detail)
    .toBe('up from $100,000.00 · median, in USD');
  expect(typicalPayText(rev({ typical: null }))).toEqual({ headline: '—', detail: null });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- money selection bulk-state figures-text`
Expected: FAIL (modules or exports missing).

- [ ] **Step 3: Implement**

`bulkRevisionHref` appends `select=all` or `ids=<ascending,comma-joined>` to the given query as raw text (no `%2C`). `selectionFromParams`: `select=all` → `{ filter: bulkFilterFrom(filtersFromParams(params)) }`; otherwise every comma token of `ids` must be a positive integer, deduplicated in first-seen order, 1 to `MAX_PICKED_IDS` of them; anything else → `null`. `bulkDefaultNote` keeps the existing wording from `employees-page.tsx` (departments, then level codes, then country names, joined with ", "). `formatInputAmount` formats the decimal string the way `formatMoney` does, with `style: 'decimal'`.

- [ ] **Step 4: Run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass (the old panel still works through the moved module).

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/bulk-revision apps/web/src/features/employees apps/web/src/lib apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): carry a bulk selection in the URL and add review state and figure wording" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: The screen, its route, the step indicator and the setup column

**Files:**
- Create: `apps/web/src/app/(app)/employees/revisions/new/page.tsx`, `apps/web/src/components/ui/step-indicator.tsx`, `apps/web/src/features/bulk-revision/use-bulk-revision.ts`, `bulk-revision-page.tsx`, `bulk-setup.tsx`, `bulk-revision-page.test.tsx`
- Modify: `apps/web/src/components/ui/building-blocks.test.tsx`

**Interfaces:**
- Consumes: Task 6's `selection.ts`; `filterChips`, `filtersFromParams` (`list-filters.ts`); `useCountries`, `useDepartments`, `useLevels`, `formatDate` (`features/reference/use-reference.ts`); `Chip`, `Input`, `Label`, `Button`; `parsePercentageToBp`, `formatPercentageBp`; `todayUtc`; `useDebouncedValue`.
- Produces:
  - `StepIndicator({ steps, current }: { steps: string[]; current: number })` — `<ol aria-label="Progress">`; steps before `current` show a check icon and sr-only " (done)"; the step at `current` has `aria-current="step"`; `current === steps.length` means all done.
  - Hooks in `use-bulk-revision.ts` (keys under `['bulk-revision', …]`, the target serialised with `JSON.stringify`):
    ```ts
    export function useBulkPreview(target: BulkTarget | null, percentageBp: number | null): UseQueryResult<BulkPreviewResponse>;   // enabled with both; keepPreviousData
    export function useBulkSummary(target: BulkTarget | null, percentageBp: number | null, overrides: BulkOverride[]): UseQueryResult<BulkSummary>; // body omits percentageBp when null and overrides when empty
    export function useLatestBulkRevision(): UseQueryResult<LatestBulkRevision>;
    export function useConfirmBulkRevision(): UseMutationResult<BulkConfirmResponse, Error, BulkConfirmBody>;
    ```
  - `BulkRevisionPage({ today }: { today?: string })` — reads `useSearchParams()`; owns percentage text, effective date, note (with a `noteTouched` flag), overrides, dialog and done state. The debounced percentage (`400` ms) parsed by `parsePercentageToBp` is the preview's `percentageBp`.
  - `BulkSetup(props: { target: BulkTarget; listParams: URLSearchParams; who: BulkSummary | undefined; percentageText: string; percentageError: string | null; onPercentageText: (text: string) => void; effectiveDate: string; today: string; dateError: string | null; onEffectiveDate: (date: string) => void; note: string; onNote: (note: string) => void })` — `<aside aria-label="Setup">` on `bg-surface`; reads `useLatestBulkRevision` and the reference hooks itself.
  - The route renders `<Suspense><BulkRevisionPage /></Suspense>` like `employees/page.tsx`.

- [ ] **Step 1: Write the failing tests**

`building-blocks.test.tsx`: `it('marks the current step and the finished ones')` → `render(<StepIndicator steps={['Choose people', 'Set increase & review', 'Confirm']} current={1} />)`; the second item has `aria-current="step"`, the first's text is `Choose people (done)`, the third has neither.

`bulk-revision-page.test.tsx` — mock `next/navigation` (`useSearchParams: () => new URLSearchParams(search)`), `next/link` (as in `employees-page.test.tsx`) and `sonner`; helper `stubBulk(routes = {})` = `stubApi({ ...REFERENCE_ROUTES, 'GET /api/employees/bulk-salary-changes/latest': { latest: null }, 'POST /api/employees/bulk-salary-changes/summary': (_, init) => Response.json(JSON.parse(String(init.body)).percentageBp === undefined ? bulkSummary({ revision: null }) : bulkSummary()), 'POST /api/employees/bulk-salary-changes/preview': { items: [bulkPreviewItem(), bulkPreviewItem({ employeeId: 2, firstName: 'Ravi', lastName: 'Menon', outsidePeerRange: 'above' })], total: 2 }, ...routes })` (a key in `routes` replaces the default handler for that key); `render = () => renderWithQuery(<BulkRevisionPage today="2026-10-19" />)`; `beforeEach(() => { search = 'ids=1,2'; })`; `choose(text)` = `fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: text } })`.

```ts
it('reads a hand-picked selection from the address and shows who it covers', async () => {
  search = 'country=US&ids=1,2';
  const { calls } = stubBulk();
  render();
  expect(await screen.findByText('2 people, active only')).toBeDefined();
  expect(calls.find((c) => c.url.pathname.endsWith('/summary'))?.body).toEqual({ employeeIds: [1, 2] });
  expect(screen.getByText('United States')).toBeDefined();
  expect(screen.getByText('Picked by hand from this list.')).toBeDefined();
  expect(within(screen.getByRole('list', { name: 'By department' })).getByText('Engineering')).toBeDefined();
});
it('covers everyone matching the list when it selected all matching', async () => {
  search = 'country=US&level=3&search=ann&select=all';
  const { calls } = stubBulk();
  render();
  await screen.findByText('2 people, active only');
  expect(calls.find((c) => c.url.pathname.endsWith('/summary'))?.body).toEqual({ filter: { search: 'ann', country: ['US'], level: [3] } });
  expect(screen.getByText('Search: ann')).toBeDefined();
});
it('links back to the employees list with its filters', async () => {
  search = 'country=US&page=2&select=all';
  stubBulk(); render();
  expect(screen.getByRole('link', { name: 'Back to employees' }).getAttribute('href')).toBe('/employees?country=US&page=2');
});
it('says no one is selected when the address carries no valid selection', async () => {
  search = 'ids=abc';
  const { calls } = stubBulk(); render();
  expect(await screen.findByText('No one is selected for this revision.')).toBeDefined();
  expect(calls.filter((c) => c.method === 'POST')).toEqual([]);
});
it('shows the second step as the current one', async () => {
  search = 'ids=1,2'; stubBulk(); render();
  expect(within(screen.getByRole('list', { name: 'Progress' })).getByText('Set increase & review').closest('li')?.getAttribute('aria-current')).toBe('step');
});
it('reminds the user of the last bulk revision', async () => {
  search = 'ids=1,2';
  stubBulk({ 'GET /api/employees/bulk-salary-changes/latest': { latest: { batchId: 9, effectiveDate: '2026-04-01', percentageBp: 400, employeeCount: 1233, note: 'Annual increment 2026' } } });
  render();
  expect(await screen.findByText('1 Apr 2026 · 4% · 1,233 people')).toBeDefined();
  expect(screen.getByText('Annual increment 2026')).toBeDefined();
});
it('fills the note from the selection and never overwrites a typed note', async () => {
  search = 'level=3&country=US&select=all'; stubBulk(); render();
  await waitFor(() => { expect(screen.getByLabelText<HTMLInputElement>('Note').value).toBe('L3, United States'); });
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Spring cycle' } });
  expect(screen.getByLabelText<HTMLInputElement>('Note').value).toBe('Spring cycle');
});
it('fills the percentage from a quick button and previews it', async () => {
  search = 'ids=1,2';
  const { calls } = stubBulk(); render();
  fireEvent.click(screen.getByRole('button', { name: '5%' }));
  expect(screen.getByLabelText<HTMLInputElement>('Percentage increase').value).toBe('5');
  expect(screen.getByRole('button', { name: '5%' }).getAttribute('aria-pressed')).toBe('true');
  await waitFor(() => { expect(calls.find((c) => c.url.pathname.endsWith('/preview'))?.body).toEqual({ employeeIds: [1, 2], percentageBp: 500 }); });
});
it('asks for a valid percentage and an effective date that is not in the future', async () => {
  search = 'ids=1,2'; stubBulk(); render();
  fireEvent.change(screen.getByLabelText('Percentage increase'), { target: { value: 'abc' } });
  expect(await screen.findByText('Enter a percentage between 0.01 and 100, with at most two decimals')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-10-20' } });
  expect(screen.getByText('Effective date cannot be in the future')).toBeDefined();
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '' } });
  expect(screen.getByText('Choose an effective date')).toBeDefined();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- building-blocks bulk-revision-page`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement**

Layout: header row (link "Back to employees" with an `ArrowLeft` icon, `aria-hidden`), `<h1>` "Bulk salary revision", `StepIndicator` with steps `['Choose people', 'Set increase & review', 'Confirm']`; below, `md:grid md:grid-cols-[320px_minmax(0,1fr)]` with `BulkSetup` and a `<section aria-label="Review">` that, for now, shows "Choose an increase to see the review." (Task 8 fills it). With no selection: the sentence "No one is selected for this revision.", "Choose people on the employees list, then select Apply % increase.", and the back link; no hooks fire (pass `null` targets). Who: "1 person, active only" for one; chips from `filterChips(filtersFromParams(listParams), ref)` without the `status` chip, plus `Search: <text>` when searching, all rendered with `Chip` and no `onRemove`; "Everyone active" when a `select=all` selection has no chips. Quick buttons `3 4 5 8 10` render "3%"… inside `role="group" aria-label="Quick percentages"`, `aria-pressed` when `parsePercentageToBp(text) === n * 100`. The note helper text is "Shown in each person's salary history.". The percentage error shows only for non-empty invalid text.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- building-blocks bulk-revision-page`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add "apps/web/src/app/(app)/employees/revisions" apps/web/src/components/ui apps/web/src/features/bulk-revision
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add the bulk revision screen with its steps and setup column" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Live review — tiles, editable cells, search, quick filters and stacked rows

**Files:**
- Create: `apps/web/src/features/bulk-revision/bulk-review.tsx`, `amount-cell.tsx`
- Modify: `apps/web/src/features/bulk-revision/bulk-revision-page.tsx`, `bulk-revision-page.test.tsx`

**Interfaces:**
- Consumes: Task 6 (`reviewRows`, `reviewCounts`, `resolveNewAmount`, `overridesForSummary`, `addedPayrollText`, `typicalPayText`, `formatInputAmount`); Task 7 hooks; `StatTile`, `SegmentedControl`, `Avatar`, `Pagination`, `Table*` (`components/ui/table.tsx`), `useIsDesktop`, `useFxAsOfLabel`, `formatMoney`, `formatChangeBp`, `PAGE_SIZE`.
- Produces:
  - `AmountCell({ item, text, onChange }: { item: BulkPreviewItem; text: string | undefined; onChange: (text: string | undefined) => void })` — input `aria-label="New salary for <First Last>"`, value `text ?? formatInputAmount(proposed)`, `data-overridden="true"` for a valid edit, `aria-invalid` for an invalid one (messages "Must be higher than the current amount" / "Enter an amount, for example 1234.50"), the currency code beside it, and under an edit (valid or not) the tag "edited · " + a button "undo" named `Undo edit for <First Last>` that calls `onChange(undefined)`. On blur: an edit equal to the proposed amount calls `onChange(undefined)`; another valid edit calls `onChange(formatInputAmount(amount))`.
  - `BulkReview(props: { preview: UseQueryResult<BulkPreviewResponse>; summary: UseQueryResult<BulkSummary>; summaryOverrides: BulkOverride[]; overrides: Overrides; onOverride: (employeeId: number, text: string | undefined) => void; percentageChosen: boolean })` — owns search, view and page (page back to 1 on a search or view change). A row's Change: not edited → `formatChangeBp(item.changeBp)`; valid edit whose amount appears in `summaryOverrides` and in `summary.data.revision.overrideChangeBp` → that figure; valid edit not yet summarised → "…" with sr-only "Updating"; invalid → "—".
  - The page computes `overridesForSummary(previewItems, overrides)`, debounces its JSON (`400` ms) and passes the parsed list to `useBulkSummary(target, percentageBp, list)` and to `BulkReview` as `summaryOverrides`.

- [ ] **Step 1: Write the failing tests**

Add to `bulk-revision-page.test.tsx` (the Task 7 helpers; the default preview is Asha Rao and Ravi Menon, Ravi `outsidePeerRange: 'above'`):

```ts
it('shows nothing to review until a percentage is chosen', async () => {
  stubBulk(); render();
  expect(await screen.findByText('Choose an increase to see the review.')).toBeDefined();
});
it('shows the headline figures from the server summary', async () => {
  stubBulk(); render(); choose('7');
  const tile = async (name: string) => within(await screen.findByRole('group', { name }));
  expect((await tile('Added to annual payroll')).getByText('+$14,000.00')).toBeDefined();
  expect((await tile('Typical pay')).getByText('up from $100,000.00 · median')).toBeDefined();
  expect((await tile('Rows overridden')).getByText('of 2')).toBeDefined();
  expect((await tile('Outside peer range')).getByText('1')).toBeDefined();
});
it('shows the USD total with each currency for a mixed selection, with the FX date', async () => {
  stubBulk({
    'POST /api/employees/bulk-salary-changes/summary': bulkSummary({ revision: { ...bulkSummary().revision!, addedByCurrency: [{ currencyCode: 'INR', addedMinor: 35_000_000 }, { currencyCode: 'USD', addedMinor: 1_700_000 }], addedBaseMinor: 2_119_300 } }),
    'POST /api/employees/bulk-salary-changes/preview': { items: [bulkPreviewItem(), bulkPreviewItem({ employeeId: 2, firstName: 'Ravi', lastName: 'Menon', countryCode: 'IN', currencyCode: 'INR', currentAmountMinor: 500_000_000, proposedAmountMinor: 535_000_000 })], total: 2 },
  });
  render(); choose('7');
  expect(await screen.findByText('+$21,193.00')).toBeDefined();
  expect(screen.getByText('+₹3,50,000.00 · +$17,000.00')).toBeDefined();
  expect(screen.getByText('FX rates as of 15 Jan 2026')).toBeDefined();
});
it('formats the new salary, marks an edit and undoes it', async () => {
  stubBulk(); render(); choose('7');
  const cell = await screen.findByLabelText<HTMLInputElement>('New salary for Ravi Menon');
  expect(cell.value).toBe('107,000.00');
  fireEvent.change(cell, { target: { value: '110000' } });
  fireEvent.blur(cell);
  expect(cell.value).toBe('110,000.00');
  expect(cell.getAttribute('data-overridden')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Undo edit for Ravi Menon' }));
  expect(cell.value).toBe('107,000.00');
  expect(cell.getAttribute('data-overridden')).toBeNull();
});
it('stops counting an edit typed back to the proposed amount', async () => { /* type '107000', blur → no data-overridden, no undo button */ });
it('sends the edits to the summary after a pause and shows their change', async () => {
  const { calls } = stubBulk({ 'POST /api/employees/bulk-salary-changes/summary': (_, init) => {
    const body = JSON.parse(String(init.body));
    return Response.json(bulkSummary({ revision: { ...bulkSummary().revision!, overriddenCount: body.overrides?.length ?? 0, overrideChangeBp: body.overrides ? [{ employeeId: 2, changeBp: 1000 }] : [] } }));
  } });
  render(); choose('7');
  fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon'), { target: { value: '110000' } });
  await waitFor(() => {
    expect(calls.filter((c) => c.url.pathname.endsWith('/summary')).at(-1)?.body)
      .toEqual({ employeeIds: [1, 2], percentageBp: 700, overrides: [{ employeeId: 2, newAmountMinor: 11_000_000 }] });
  });
  expect(await screen.findByText('+10%')).toBeDefined();
});
it('filters the rows by name and by the quick filters', async () => {
  stubBulk(); render(); choose('7');
  await screen.findByText('Ravi Menon');
  fireEvent.click(screen.getByRole('radio', { name: 'Outside peer range (1)' }));
  expect(screen.queryByText('Asha Rao')).toBeNull();
  fireEvent.click(screen.getByRole('radio', { name: 'All' }));
  fireEvent.change(screen.getByLabelText('Search people in this revision'), { target: { value: 'asha' } });
  expect(screen.queryByText('Ravi Menon')).toBeNull();
});
it('keeps edits across pages', async () => { /* 60 items; edit on page 2, back to page 1 and to page 2 → value kept */ });
it('stacks the review as editable rows on a narrow screen', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
  stubBulk(); render(); choose('7');
  expect(await screen.findByLabelText('New salary for Ravi Menon')).toBeDefined();
  expect(screen.queryByRole('table')).toBeNull();
});
// Review Focus 1
it('shows the figures for the last percentage chosen when an earlier preview answers late', async () => {
  let releaseThree!: () => void;
  stubBulk({ 'POST /api/employees/bulk-salary-changes/preview': (_, init) => {
    const bp = JSON.parse(String(init.body)).percentageBp;
    const body = { items: [bulkPreviewItem({ proposedAmountMinor: bp === 300 ? 10_300_000 : 11_000_000 })], total: 1 };
    return bp === 300 ? new Promise<Response>((resolve) => { releaseThree = () => resolve(Response.json(body)); }) : Response.json(body);
  } });
  render(); choose('3');
  await waitFor(() => { expect(releaseThree).toBeDefined(); });
  choose('10');
  const cell = await screen.findByLabelText<HTMLInputElement>('New salary for Asha Rao');
  await waitFor(() => { expect(cell.value).toBe('110,000.00'); });
  releaseThree();
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.getByLabelText<HTMLInputElement>('New salary for Asha Rao').value).toBe('110,000.00');
});
// Review Focus 3
it('says so when the selection has no active employees left', async () => {
  stubBulk({ 'POST /api/employees/bulk-salary-changes/preview': { items: [], total: 0 } });
  render(); choose('7');
  expect(await screen.findByText('No active employees in this selection.')).toBeDefined();
  expect(screen.queryByRole('group', { name: 'Added to annual payroll' })).toBeNull();
});
// Review Focus 4
it('says the totals could not be updated and offers a retry when the summary fails', async () => {
  let fail = true;
  stubBulk({ 'POST /api/employees/bulk-salary-changes/summary': (_, init) => {
    if (JSON.parse(String(init.body)).percentageBp === undefined) return Response.json(bulkSummary({ revision: null }));
    return fail ? apiError(500, 'INTERNAL', 'Server error') : Response.json(bulkSummary());
  } });
  render(); choose('7');
  expect(await screen.findByText('Could not update the totals.')).toBeDefined();
  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByText('+$14,000.00')).toBeDefined();
});
// Review Focus 5
it('reads an edit typed with Indian digit grouping', async () => {
  stubBulk({ 'POST /api/employees/bulk-salary-changes/preview': { items: [bulkPreviewItem({ countryCode: 'IN', currencyCode: 'INR', currentAmountMinor: 180_000_000, proposedAmountMinor: 192_600_000 })], total: 1 } });
  render(); choose('7');
  const cell = await screen.findByLabelText<HTMLInputElement>('New salary for Asha Rao');
  expect(cell.value).toBe('19,26,000.00');
  fireEvent.change(cell, { target: { value: '19,82,182.62' } });
  fireEvent.blur(cell);
  expect(cell.value).toBe('19,82,182.62');
  expect(cell.getAttribute('data-overridden')).toBe('true');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- bulk-revision-page`
Expected: FAIL (the new tests; Task 7's still pass).

- [ ] **Step 3: Implement**

Review states, in order: no percentage → "Choose an increase to see the review."; preview pending with no data → row skeletons in `role="status"` with sr-only "Loading preview"; preview error → `role="alert"` with the message and "Retry" (`refetch`); zero items → "No active employees in this selection."; else tiles, toolbar, rows. Tiles (`grid grid-cols-2 gap-3 lg:grid-cols-4`): "Added to annual payroll" (`addedPayrollText`), "Typical pay" (`typicalPayText`), "Rows overridden" (`revision.overriddenCount`, hint `of <headcount>`), "Outside peer range" (`reviewCounts(...).outside`, tone `warning` when above 0, hint "before this revision"). While the summary has no data yet the tile values read "…". Summary error → `role="alert"` "Could not update the totals." with "Retry" in place of the first three tiles. Under the tiles, `useFxAsOfLabel()` when any item's currency is not USD. Toolbar: `Input type="search"` `aria-label="Search people in this revision"` `placeholder="Search by name"` and `SegmentedControl label="Show"` with options `All`, `Overridden (n)`, `Outside peer range (n)`. Desktop table columns Employee (avatar, name, and an "Above range"/"Below range" tag with `TriangleAlert` in `warning`), Department, Current (local, USD in small grey unless USD), New salary (`AmountCell`; the proposed USD in small grey beside it when not edited and not USD), Change (`text-positive`). Below `md` (`useIsDesktop()` false): a `<ul>` of rows with name, "Department · current", `AmountCell` and the change. "No one matches this search." when the filtered list is empty. `Pagination` with `PAGE_SIZE`, no page-size choice. Dim the rows (`opacity-60`) while `preview.isPlaceholderData`. Amber cell: `data-[overridden=true]:border-warning data-[overridden=true]:bg-warning/10`; the tag text in `text-warning` on the white row background.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- bulk-revision-page`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/bulk-revision
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add the live bulk review with summary tiles, editable cells and quick filters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Footer, confirmation dialog, success state and conflicts

**Files:**
- Create: `apps/web/src/features/bulk-revision/confirm-dialog.tsx`
- Modify: `apps/web/src/features/bulk-revision/bulk-revision-page.tsx`, `bulk-revision-page.test.tsx`

**Interfaces:**
- Consumes: `buildConfirmBody`, `countInvalid`, `keepUnaffectedOverrides` (Task 6); `useConfirmBulkRevision`, `useBulkPreview`, `useBulkSummary` (Task 7); `addedPayrollText`; `Dialog`, `DialogContent`, `DialogTitle`, `DialogClose`; `ApiError`; `toast` from `sonner`; `useQueryClient`.
- Produces:
  - `ConfirmDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; percentageBp: number; headcount: number; effectiveDate: string; note: string; revision: NonNullable<BulkSummary['revision']> | undefined; summaryCurrent: boolean; pending: boolean; error: string | null; onApply: () => void })` — title "Confirm salary revision"; a `<dl>` with Increase (`formatPercentageBp`, plus ` · n edited by hand` when `overriddenCount > 0`), People, Effective (`formatDate`), Added to annual payroll (`addedPayrollText` headline, detail in grey), Note (omitted when empty); `role="alert"` for `error`; buttons "Back to review" and `Apply N raises` ("Apply 1 raise"), the latter disabled while `pending` or `!summaryCurrent` (`summaryCurrent` = the summary has data for the current debounced inputs and is not fetching).
  - Page footer (`sticky bottom-0`, `border-t`, white): "Nothing is saved until you confirm the changes.", a "Cancel" link to `listHrefFrom(params)`, and a button `Review & confirm N changes →` ("1 change"), disabled when there is no preview data, the preview is a placeholder, it has zero items, `countInvalid > 0` (then also "Fix the highlighted amounts before confirming."), or the date has an error. Opening the dialog sets the step indicator's `current` to 2.
  - Success (replaces both columns, step `current` = 3): `<h2>` "Revision applied", `N raises recorded, effective <formatDate(date)>.`, links "View employees" (`listHrefFrom(params)`) and "View insights" (`/insights`); invalidates `['employees']`, `['insights']` and `['bulk-revision']`.
  - On a 409: close the dialog, `toast.error('Salaries changed since the preview. The preview has been reloaded.')`, `await preview.refetch()`, then `setOverrides(keepUnaffectedOverrides(before, after, overrides))`. Any other error: its message in the dialog's alert; nothing reloads.

- [ ] **Step 1: Write the failing tests**

Add to `bulk-revision-page.test.tsx` (`openDialog()` clicks `Review & confirm 2 changes →`):

```ts
it('summarises the revision in the confirmation dialog', async () => {
  stubBulk(); render(); choose('7');
  fireEvent.click(await screen.findByRole('button', { name: 'Review & confirm 2 changes →' }));
  const dialog = await screen.findByRole('dialog', { name: 'Confirm salary revision' });
  for (const text of ['7%', '2', '19 Oct 2026', '+$14,000.00', 'Selected employees']) expect(within(dialog).getByText(text)).toBeDefined();
  // the open modal hides the rest of the page from the accessibility tree
  expect(within(screen.getByRole('list', { name: 'Progress', hidden: true })).getByText('Confirm').closest('li')?.getAttribute('aria-current')).toBe('step');
});
it('confirms exactly the previewed list with its edits and shows the success state', async () => {
  const { calls } = stubBulk({ 'POST /api/employees/bulk-salary-changes': () => Response.json({ batchId: 4, employeeCount: 2, effectiveDate: '2026-10-19' }, { status: 201 }) });
  search = 'country=US&ids=1,2'; render(); choose('7');
  fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon'), { target: { value: '110000' } });
  openDialog();
  const apply = await screen.findByRole('button', { name: 'Apply 2 raises' });
  await waitFor(() => { expect((apply as HTMLButtonElement).disabled).toBe(false); });
  fireEvent.click(apply);
  expect(await screen.findByRole('heading', { name: 'Revision applied' })).toBeDefined();
  expect(calls.find((c) => c.method === 'POST' && c.url.pathname === '/api/employees/bulk-salary-changes')?.body).toEqual({
    percentageBp: 700, effectiveDate: '2026-10-19', note: 'Selected employees',
    items: [{ employeeId: 1, expectedCurrentAmountMinor: 10_000_000, newAmountMinor: 10_700_000 },
            { employeeId: 2, expectedCurrentAmountMinor: 10_000_000, newAmountMinor: 11_000_000 }],
  });
  expect(screen.getByText('2 raises recorded, effective 19 Oct 2026.')).toBeDefined();
  expect(screen.getByRole('link', { name: 'View employees' }).getAttribute('href')).toBe('/employees?country=US');
  expect(screen.getByRole('link', { name: 'View insights' }).getAttribute('href')).toBe('/insights');
});
it('keeps the confirm button disabled while an edit is not a valid raise', async () => {
  stubBulk(); render(); choose('7');
  fireEvent.change(await screen.findByLabelText('New salary for Ravi Menon'), { target: { value: '90000' } });
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Review & confirm 2 changes →' }).disabled).toBe(true);
  expect(screen.getByText('Fix the highlighted amounts before confirming.')).toBeDefined();
});
it('reloads a stale preview, says so, and keeps edits for people whose pay did not change', async () => {
  // port of the panel's 409 test: second preview gives Ravi current 10_500_000 / proposed 11_235_000
  // edits: Asha '120000', Ravi '121000' → after the 409: Asha '120000' kept, Ravi shows '112,350.00'
  // toast.error called with 'Salaries changed since the preview. The preview has been reloaded.'
});
it('shows the broken rule inside the dialog without reloading the preview', async () => {
  // confirm → apiError(422, 'INVALID_BULK_REVISION', 'employee 1: effective date is before the hire date')
  // dialog shows that text in role="alert"; preview requested once
});
it('cancels back to the list with its filters', async () => {
  search = 'country=US&ids=1,2'; stubBulk(); render();
  expect(screen.getByRole('link', { name: 'Cancel' }).getAttribute('href')).toBe('/employees?country=US');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- bulk-revision-page`
Expected: FAIL (the new tests).

- [ ] **Step 3: Implement the footer, dialog, success state and error handling**

The confirm body is `buildConfirmBody(preview.data.items, overrides, { percentageBp, effectiveDate, note })`, where `percentageBp` is the one the shown preview was fetched with. Below `md` the footer button is full width and at least 44px tall.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- bulk-revision-page`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/bulk-revision
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): confirm a bulk revision in a dialog and show the result" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Open the screen from the employee list and retire the panel

**Files:**
- Modify: `apps/web/src/features/employees/employees-page.tsx`, `apps/web/src/features/employees/employees-page.test.tsx`, `apps/web/src/features/bulk-revision/bulk-state.ts`, `bulk-state.test.ts`
- Delete: `apps/web/src/features/employees/bulk-revision-panel.tsx`, `apps/web/src/features/employees/bulk-revision-panel.test.tsx`

**Interfaces:**
- Consumes: `bulkRevisionHref`, `MAX_PICKED_IDS` (Task 6).
- Produces: "Apply % increase" calls `router.push(bulkRevisionHref(paramsText, allMatching ? { all: true } : { ids: [...selectedIds] }))`. With more than `MAX_PICKED_IDS` hand-picked rows the button is disabled and the bar reads "Pick up to 1,000 people, or select all matching.". `bulkOpen`, `bulkTarget`, `defaultNote`, `queryClient` (if now unused) and the panel branch are removed from the page; `summarize` and `BulkSummary` (web) are removed from `bulk-state.ts` with their tests.

- [ ] **Step 1: Write the failing tests**

Replace `previews a bulk revision for the selected employee ids` in `employees-page.test.tsx`:

```ts
it('opens the bulk revision screen for the picked employees', async () => {
  search = 'country=US&sortBy=salary';
  stubList();
  renderWithQuery(<EmployeesPage today="2026-10-19" />);
  await screen.findByRole('link', { name: 'Asha Rao' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Ravi Menon' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply % increase' }));
  expect(push).toHaveBeenCalledWith('/employees/revisions/new?country=US&sortBy=salary&ids=1,2');
});
it('opens the bulk revision screen for everyone matching the list', async () => {
  search = 'country=US';
  stubList(120);
  renderWithQuery(<EmployeesPage today="2026-10-19" />);
  await screen.findByRole('link', { name: 'Asha Rao' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select all 120 matching this filter' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply % increase' }));
  expect(push).toHaveBeenCalledWith('/employees/revisions/new?country=US&select=all');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employees-page`
Expected: FAIL (the panel opens instead of a navigation).

- [ ] **Step 3: Implement, delete the panel and drop `summarize`**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git rm apps/web/src/features/employees/bulk-revision-panel.tsx apps/web/src/features/employees/bulk-revision-panel.test.tsx && grep -rn "bulk-revision-panel\|BulkRevisionPanel\|summarize(" apps/web/src`
Expected: grep prints nothing once the page and `bulk-state.ts` are updated.

- [ ] **Step 4: Run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 5: Check the screen in the running app**

Run the app (`npm run dev`), sign in, tick two rows on `/employees?country=IN`, select "Apply % increase", choose 4%, edit one salary, refresh the page (the selection and Who survive; edits are intentionally not kept), go back to the list (filters intact), return, confirm, and follow "View employees". Repeat at a 390px-wide window: setup above review, stacked rows, footer pinned. Expected: every step behaves as `docs/design.md` §5 and §7 describe; no console errors.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add -A apps/web/src/features
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): open the bulk revision screen from the employee list and remove the old panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
