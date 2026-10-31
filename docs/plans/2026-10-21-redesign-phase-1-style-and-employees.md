# Redesign Phase 1: Style and Employees Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Refined classic" visual language, the new login, and the rebuilt Employees list and employee drawer (spec §4, §5, §6 without the history chart, §9, §11, §12), with the API changes they need.

**Architecture:** The API gains multi-value filters, four sort keys, a facet-counts endpoint, one reusable peer-group service (used now by the drawer, later by bulk revision and insights), a per-row history % change and a salary-change preview endpoint, so the browser never applies a percentage to money. The web app gets theme tokens and one-file-per-block UI parts in `apps/web/src/components/ui/`, then the Employees screen is rebuilt on them: URL-held multi-value state, a collapsible left filter panel with faceted counts, a TanStack Table with server-side sort and paging, and a tabbed drawer whose salary form gets every figure from the API.

**Tech Stack:** Fastify 5, Drizzle ORM + better-sqlite3, Zod 4 (`packages/shared`), Next.js 16 App Router, TanStack Query 5, `@tanstack/react-table` 8.21.3 (new), `country-flag-icons` 1.6.20 (new), Radix (`radix-ui`), Tailwind 4, Vitest 5 + React Testing Library.

**Spec:** `docs/plans/2026-10-21-ui-ux-redesign-design.md` (binding). Overview plan: `docs/plans/2026-10-21-ui-ux-redesign.md`.

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

- Cross-phase names are fixed: list query `country: string[]`, `department: number[]`, `level: number[]`; `sortBy` adds `jobTitle | department | level | country`; UI blocks live one per file in `apps/web/src/components/ui/`; peer statistics come only from `getPeerGroups` (Task 5).
- Every dropdown menu is non-modal (`modal={false}`); dialogs and sheets stay modal.
- `localStorage` is a per-browser convenience only: every read and write is wrapped in `try/catch` and the page renders correctly without it.
- Exact dependency pins (the repo pins exact versions): `@tanstack/react-table@8.21.3`, `country-flag-icons@1.6.20`.
- Test commands below use `npm test -w @acme/api -- <file filter>` or `npm test -w @acme/web -- <file filter>`; "PASS" means Vitest reports every selected file passed. Every command carries the Node 24 `PATH` prefix.

## Review Focus

1. **Odd filter query strings** (`country=`, `country=IN,DE`, `country=IN&country=DE`, `level=abc`): blank values mean "no filter", comma lists and repeats both work, and a malformed id is a 400, never a 500. Test added in Task 2.
2. **Browser storage unavailable** (private window, blocked site data) when reading the remembered filter-panel state: the panel renders expanded and works. Test added in Task 11.
3. **A peer group under 10 people, or none at all** (a promotion to a level nobody else holds in that country): the drawer and the comparison box say there are too few peers instead of crashing or showing a range. Tests added in Tasks 5 and 14.
4. **Quick-% clicks answered out of order** (click +3% then +10% quickly; the +3% response arrives last): the amount field shows the figure for the last click. Test added in Task 16.
5. **Stale or hand-edited URLs** (`pageSize=37`, `sortBy=bogus`, `level=0`, `page=-2`): the list falls back to defaults for the bad values and keeps the good ones. Test added in Task 10.

---

## File structure

API (`apps/api/src`):
- `repositories/employees.ts` (modify): array filters, new sort keys, `countEmployeeRows`, `countEmployeesGroupedBy`, `listActivePeerAmounts`.
- `services/employee-list.ts`, `employee-export.ts`, `bulk-revision.ts` (modify): pass array filters.
- `services/employee-facets.ts` (create): `getEmployeeFacets`.
- `domain/peer-groups.ts` (create): `summarisePeerGroup`, `peerPosition`, `peerGroupKey`.
- `services/peer-groups.ts` (create): `getPeerGroups`, `getPeerContext`, `toPeerContext`.
- `services/insights.ts` (modify): `getOutliers` reads fences from `getPeerGroups`.
- `domain/revision.ts` (modify): `percentChangeBp`.
- `domain/history-change.ts` (create): `historyChangeBp`.
- `services/employee-detail.ts` (modify): `changeBp` per history row.
- `services/salary-change-preview.ts` (create): `previewSalaryChange`.
- `routes/employees.ts` (modify): facets, peer-context, salary-change preview routes.
- `db/schema.ts` + generated `drizzle/0001_*.sql` (modify/create): `(status, job_title)` index.
- `perf/measure-latency.ts` (create) + `package.json` script `perf:latency`.

Shared (`packages/shared/src`): `employees.ts`, `bulk-revision.ts`, `index.ts` (modify).

Web (`apps/web/src`):
- `app/globals.css` (modify): new tokens.
- `components/ui/`: `dropdown-menu.tsx`, `card.tsx`, `segmented-control.tsx` (modify); `tabs.tsx`, `app-mark.tsx`, `avatar.tsx`, `country-flag.tsx`, `level-badge.tsx`, `chip.tsx`, `checkbox-group.tsx`, `stat-tile.tsx` (create).
- `components/pagination.tsx` (modify): page-size choice.
- `hooks/use-stored-flag.ts`, `hooks/use-debounced-value.ts` (create).
- `lib/money.ts` (modify): `formatChangeBp`, `formatSignedMoney`.
- `features/auth/`: `top-bar.tsx`, `login-form.tsx` (modify); `login-screen.tsx` (create); `app/login/page.tsx` (modify).
- `features/employees/`: `list-filters.ts`, `use-employees.ts`, `employee-table.tsx`, `employees-page.tsx`, `employee-detail.tsx`, `salary-change-form.tsx`, `use-employee.ts` (modify); `employee-filter-panel.tsx`, `columns-menu.tsx`, `employee-header.tsx`, `salary-summary.tsx`, `salary-history-list.tsx`, `salary-comparison.tsx`, `peer-copy.ts` (create); `employee-filters.tsx` (delete in Task 13).
- `test/fixtures.ts` (modify): `changeBp`, `employeeFacets()`, `peerContext()`, `salaryPreview()`.

---

### Task 1: Product docs for the redesign's first phase

**Files:**
- Modify: `docs/design.md` (§1–§8), `docs/decisions.md`, `docs/requirements.md` (FR-1 and its acceptance row), `docs/architecture.md` (§2 indexes, §5, §7, §8)

**Interfaces:**
- Produces: the binding text every later task follows. Names introduced here must match the tasks: endpoints `GET /api/employees/facets`, `GET /api/employees/:id/peer-context`, `POST /api/employees/:id/salary-changes/preview`; tokens `canvas`, `accent-tint`, `accent-tint-border`, `series-secondary`, `series-promotion`, `brand-panel`.

- [ ] **Step 1: Rewrite `docs/design.md` §2–§8 for "Refined classic"**

Keep the document's voice and its §1 principles; add one principle: "Interpret, don't just display" (spec §1 aim 2). Content to pin:
- §2 palette: keep every existing token and its contrast note. Add rows: `canvas #F9FAFB` (page behind cards on Insights), `accent-tint #EFF6FF` and `accent-tint-border #BFDBFE` (selected chips, ticked filter state), `series-secondary #93C5FD` (second chart series; never the only signal, always with a legend or label), `series-promotion #7C3AED` (promotions on history charts; 5.3:1 on `surface`, 5.7:1 on white), `brand-panel #0B1F4D` (login panel only; white text 15.9:1). Add the rule: `text-secondary` measures 4.4:1 on `accent-tint`, so text on a tint uses `text-primary` or `accent`. Typography: Inter, tabular numbers wherever a number appears; headline numbers 22px weight 650; Insights answer sentences 15px weight 600; section labels 11px uppercase `text-secondary`. Shape unchanged. "People and places": initials avatar; flag + full country name (code shown when no flag exists); level as a small outlined badge; local salary is the main figure with USD in small grey text beside it, omitted for USD.
- §3 layout: top bar = app mark (small blue square) + "Salary Management", nav links with a 2px `accent` underline for the active one (no filled pill), user menu right. Insights uses `canvas` behind white cards; Employees and the drawer stay on white.
- §4 navigation: `/employees` = left filter panel + main column (title row, toolbar, table, pagination).
- §5 core components: list the building blocks and their files (card, stat tile, segmented control, chip, checkbox group with counts, tabs, avatar, country flag, level badge, data table, menus); "every dropdown menu is non-modal; dialogs and sheets are modal". Replace the "Filters" bullet with the filter panel: groups Status, Country, Department, Level; each option a checkbox with a count; multi-select within a group, AND across groups; Active+Inactive ticked = all, neither = active; counts reflect the search and the other groups' selections; collapsible ("Hide filters" / "Show filters"), collapsed state remembered per browser; state in the URL as repeated params. Toolbar: search, chips (`India ×`) + "Clear all", result count ("2,914 of 9,577" when filtered, "9,577 employees" otherwise), "Columns" menu. Title row: Export split button + "New employee". Table: TanStack Table, columns Employee (avatar, name, job title in grey; header offers "Name" and "Job title" sorts), Department, Level, Country, Hired, Salary; every column sortable (level by rank, salary by USD); active sort indicator in `accent`; rows per page 25/50/100, default 50; a click anywhere on a row opens the drawer except the checkbox and the name link; Department, Level, Country, Hired and Salary can be hidden. Drawer: header (avatar, name, "Job title · Department · level badge · flag Country", "⋯" menu with Deactivate/Reactivate, close); summary strip (current salary large, USD equivalent, "since <date>"; peer tile "Typical for India L3" with the middle-half range, "median" as a secondary hint and the headcount; an "Above/Below the usual range for India L3" sentence in `warning` with an icon when the person is an outlier; "Too few India L3 peers to show a typical range" under 10 peers); tabs Change salary (default when active) / Details (default when inactive) / History (n). Salary change form: reason segmented control Raise | Promotion | Relocation | Correction; amount pre-filled with the current salary (relocation: the converted amount, with its FX note); quick-% buttons Raise +3/+5/+10/+15, Promotion +10/+15/+20, plus "Custom %" (Relocation and Correction have none); the amount for a % comes from the API; typing an amount highlights Custom; comparison box Current / New / Change (local difference, % and USD per year from the API; for a relocation only the % and USD) plus one peer sentence; Reset; submit names the action ("Record raise"). History tab: change list with the % change on each row and bulk revisions marked (the chart is described when it ships). Keep the existing bulk-revision, charts, loading, errors and empty-state bullets unchanged. Login: a solid `brand-panel` panel (about 55% wide) with only the app mark and name and a faint bar-chart pattern in one corner, no headline or pitch; right side "Sign in", the subline "Use your work email and password.", email, password with Show/Hide, full-width Sign in, the note "Sessions last a working day."; below `md` the panel is a slim header band. State it as the app's only dark surface.
- §7 responsive: filter panel → bottom sheet from "Filters (n)"; drawer full-screen; touch targets ≥ 44px.
- §8 accessibility: flags and avatars are decorative (the name is always written beside them); chip remove buttons are named "Remove filter India"; option counts are attached to their checkbox with `aria-describedby`.

- [ ] **Step 2: Add `docs/decisions.md` entries (Alternatives considered / Chosen / Why)**

1. "Employee filters: a left panel of checkbox groups, not an inline dropdown row" (alternative: the inline row; why: multi-select with counts needs room; collapsible keeps table width).
2. "Filters: multi-select within a group, AND across groups, with faceted counts" (alternative: single-select; counts over the whole table; why: "India + Germany" is a normal question; counts excluding the group's own selection show what ticking would give).
3. "Employee table: TanStack Table, headless, sorting and paging on the server" (alternative: the hand-rolled table; why: column visibility, sort and selection state without bespoke code; `manualSorting`/`manualPagination` so it never processes data client-side; v8 pinned because its API is stable and documented, v9 is recent).
4. "Menus are non-modal" (why: a modal Radix menu locks page scroll and removes the scrollbar, shifting the layout 15px; a menu holds no state worth trapping focus for).
5. "Country flags: `country-flag-icons`, imported per country, code as fallback" (alternative: emoji flags (not rendered on Windows), all 250 flags; why: three SVGs bundled, adding a country is one import line, unknown codes still read correctly).
6. "Peer context: one peer-group service, typical range in local currency, outlier test in USD" (typical range = p25–p75 and median of active same-country same-level peers in the local currency; outlier status uses the existing USD Tukey fences so the drawer and FR-8 always agree; under 10 peers no range is shown; one function serves the drawer, bulk revision and insights).
7. "Salary change preview: the server computes amounts, % and USD" (alternative: browser maths; why: the browser never applies a percentage to money; one endpoint serves quick-% and the comparison box).
8. "Sorting by department, country and level: by joined name or rank, no extra index" (alternative: denormalised sort columns; why: the sort is over a ≤ 10,000-row filtered set in a join and measured well inside the target (fill in after Task 4); job title gets a `(status, job_title)` index like salary; revisit at 100k+ if measured latency approaches the target).
9. "Rows per page: 25, 50 or 100, in the URL" (default 50 = `DEFAULT_PAGE_SIZE`).
10. "History % change: computed by the API; across a relocation, in USD at today's static rates".
11. "Login: a dark brand panel with no copy" (only dark surface; no pitch because the only user is already an employee).
Also edit the existing "Frontend: bulk-revision total shown per currency, batch rows not expandable" entry: its "Dropdowns are native `<select>` elements" bullet now reads that form pickers and the rows-per-page choice are native selects, while list filters are checkbox groups (link to entry 1).

- [ ] **Step 3: Update `docs/requirements.md` FR-1 and its acceptance row**

FR-1 adds: country, department and level filters accept several values each (OR within a filter, AND across filters), each option shows how many employees it would match, and the list sorts by name, job title, department, level (by rank), country, hire date or salary. Acceptance row adds: "Filtering by India and Germany at L3 returns exactly the L3 employees of both countries; sorting by level orders by rank; each filter option's count equals the rows ticking it would return."

- [ ] **Step 4: Update `docs/architecture.md`**

§2 indexes: add `employees(status, job_title)`; note department, country and level sorts read the joined name/rank. §5: a paragraph "Peer groups" naming `getPeerGroups(db, keys?)` in `services/peer-groups.ts` as the single source of country + level peer statistics (local p25/median/p75, USD distribution and fences; groups under `MIN_PEER_GROUP_SIZE` have no summary), used by outliers and the drawer. §7 table: list filters `country`, `department`, `level` multi-valued (repeated or comma-separated), `sortBy` values; add rows `GET /api/employees/facets?<list filters>` → per-group counts plus `statusTotal`; `GET /api/employees/:id/peer-context`; `POST /api/employees/:id/salary-changes/preview` `{ reason, amountMinor | percentageBp, newLevelId?, newCountryCode? }` → current, proposed (local + USD), `changeBaseMinor`, `changeBp`, `peer` (read-only); bulk preview `filter` takes arrays; employee detail history rows carry `changeBp`. §8: list = left filter panel + TanStack Table; building blocks in `components/ui/`; drawer tabs.

- [ ] **Step 5: Check wording and formatting**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run format:check`, and reread the added lines against the wording rule in the Global Constraints.
Expected: Prettier reports all files formatted; no added line breaks the wording rule.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add docs/design.md docs/decisions.md docs/requirements.md docs/architecture.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "docs: describe the refined visual language, employee filters, table and drawer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Multi-value country, department and level filters end to end

**Files:**
- Modify: `packages/shared/src/employees.ts`, `packages/shared/src/bulk-revision.ts`
- Modify: `apps/api/src/repositories/employees.ts:75-116`, `apps/api/src/services/employee-list.ts`, `apps/api/src/services/employee-export.ts:73-83`, `apps/api/src/services/bulk-revision.ts:14-19`
- Modify: `apps/web/src/features/employees/list-filters.ts`, `employee-filters.tsx`, `employees-page.tsx` (`hasActiveFilters`, `defaultNote`)
- Test: `apps/api/src/services/employee-list.test.ts`, `apps/api/src/routes/employees.test.ts`, `apps/api/src/routes/employee-export.test.ts`, `apps/api/src/services/bulk-revision.test.ts`, `apps/api/src/routes/bulk-revision.test.ts`, `apps/web/src/features/employees/list-filters.test.ts`

**Interfaces:**
- Produces (shared): `employeeListQuerySchema` fields `country?: string[]`, `department?: number[]`, `level?: number[]`, each accepting `k=a&k=b`, `k=a,b` or both, blank values ignored, no values → `undefined`, at most 100 values. Bulk `filter` fields are JSON arrays with the same element rules (`.min(1).max(100)`).
- Produces (API): `EmployeeListFilter { country?: string[]; department?: number[]; level?: number[]; status: EmployeeStatus | 'all'; search?: string }`; an empty array means no filter.
- Produces (web): `ListFilters.country: string[]`, `department: number[]`, `level: number[]` (empty = no filter); `paramsFromFilters` appends repeated params; `bulkFilterFrom(filters): NonNullable<BulkPreviewBody['filter']>` sends arrays and omits empty ones.

- [ ] **Step 1: Write the failing API tests**

In `services/employee-list.test.ts` (reuse the file's `add()`/`list()` helpers; insert department "Sales" as id 2 first):

```ts
it('matches any of several countries, departments or levels and all of the groups together', () => {
  // IN/Sales/L3 "Match One", DE/Sales/L3 "Match Two", US/Sales/L3 "Wrong Country",
  // IN/Engineering/L3 "Wrong Department", DE/Sales/L1 "Wrong Level"
  const result = list({ country: ['IN', 'DE'], department: [2], level: [3, 2] });
  expect(names(result)).toEqual(['Match One', 'Match Two']);
});
it('treats an empty list of values as no filter', () => {
  add({ firstName: 'A', lastName: 'One' });
  expect(list({ country: [], department: [], level: [] }).total).toBe(1);
});
```

In `routes/employees.test.ts` under `GET /api/employees`:

```ts
it('accepts repeated and comma-separated filter values and ignores blank ones', async () => {
  const t = await setup(); // three US/L1 employees
  for (const query of ['country=US&country=IN', 'country=US,IN', 'country=&country=US', 'level=1,2']) {
    expect((await get(t, `/api/employees?${query}`)).json<{ total: number }>().total).toBe(3);
  }
  expect((await get(t, '/api/employees?country=IN')).json<{ total: number }>().total).toBe(0);
});
it('rejects a malformed department or level id with a validation error', async () => {
  const t = await setup();
  for (const query of ['level=abc', 'department=0', 'level=1,x']) {
    expect((await get(t, `/api/employees?${query}`)).statusCode).toBe(400);
  }
});
```

In `routes/employee-export.test.ts`: `it('exports the rows matching several values of one filter')` → `?scope=filtered&country=US&country=IN` returns header + every US row. In `services/bulk-revision.test.ts`: `it('previews every active employee matching any of the listed countries')` with `filter: { country: ['IN', 'DE'] }`. Update existing bulk tests and `routes/bulk-revision.test.ts` bodies from `country: 'IN'` to `country: ['IN']`, and add `it('rejects a filter value that is not a list with 400')` posting `filter: { country: 'IN' }`.

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-list employees.test employee-export bulk-revision`
Expected: FAIL (type errors on arrays / wrong totals / 400 instead of 200).

- [ ] **Step 3: Implement the shared schemas and the API**

In `packages/shared/src/employees.ts` add an unexported `multiValueParam(item)` built as `z.preprocess(splitListParam, z.array(item).min(1).max(100).optional())`, where `splitListParam` turns `undefined | string | string[]` into the flattened comma-split, blank-free list, or `undefined` when nothing is left. Use it for `country` (`z.string().min(1)`), `department` and `level` (`z.coerce.number().int().positive()`). In `bulk-revision.ts` make the three filter fields `z.array(...).min(1).max(100).optional()`. In the repository, `listWhere` uses `inArray` for a non-empty array and skips an empty or missing one. Update `EmployeeListFilter`, `BulkPreviewInput['filter']` and the services' spreads to the array types.

- [ ] **Step 4: Run the API tests to verify they pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS (all API files).

- [ ] **Step 5: Write the failing web tests**

In `list-filters.test.ts` update the existing cases to arrays and add:

```ts
it('reads repeated and comma-separated values and drops the invalid ones', () => {
  const filters = filtersFromParams(new URLSearchParams('country=IN&country=DE,US&level=3&level=x&department=0'));
  expect(filters).toMatchObject({ country: ['IN', 'DE', 'US'], level: [3], department: [] });
});
it('writes several values of one filter as repeated params', () => {
  expect(paramsFromFilters({ ...DEFAULT_FILTERS, country: ['IN', 'DE'] }).toString()).toBe('country=IN&country=DE');
});
it('carries only the filters a bulk revision understands, as lists', () => {
  expect(bulkFilterFrom({ ...DEFAULT_FILTERS, search: 'ann', country: ['IN'], level: [], status: 'all' }))
    .toEqual({ search: 'ann', country: ['IN'] });
});
```

`DEFAULT_FILTERS` is exported from `list-filters.ts`: `{ country: [], department: [], level: [], status: 'active', sortBy: 'name', sortOrder: 'asc', page: 1 }`. `exportHref` must put each value as a repeated param.

- [ ] **Step 6: Run the web test to verify it fails**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- list-filters`
Expected: FAIL.

- [ ] **Step 7: Implement the web state change**

Update `list-filters.ts` as specified in Interfaces (`filtersFromParams` reads `params.getAll(key)`, splits on commas and keeps each value that the shared schema's field accepts; `listApiQuery` and `exportHref` append each value). Keep the existing single-select dropdowns in `employee-filters.tsx` working on arrays (`value={filters.country[0] ?? ''}`, `onChange` → `[value]` or `[]`); Task 13 replaces them. In `employees-page.tsx`, `hasActiveFilters` checks array lengths and `defaultNote` joins the names of every selected department, level and country with ", ".

- [ ] **Step 8: Run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared apps/api/src apps/web/src/features/employees
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): accept several countries, departments and levels in list, export and bulk filters" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sort by job title, department, level and country

**Files:**
- Modify: `packages/shared/src/employees.ts:24`, `apps/api/src/repositories/employees.ts` (`EmployeeListPage`, `listOrderBy`, `selectEmployeeRows`), `apps/api/src/db/schema.ts:72-78`
- Create: `apps/api/drizzle/0001_<generated>.sql` and its `meta/` snapshot (via drizzle-kit)
- Test: `apps/api/src/services/employee-list.test.ts`, `apps/api/src/routes/employees.test.ts`

**Interfaces:**
- Produces: `sortBy: 'name' | 'jobTitle' | 'department' | 'level' | 'country' | 'hireDate' | 'salary'` in the shared schema and `EmployeeListPage`. Order: `jobTitle` → job title; `department` → department name; `level` → level rank; `country` → country name; every key then last name, first name ascending, then `id` ascending (ties stable regardless of direction). Existing keys unchanged.

- [ ] **Step 1: Write the failing tests**

In `services/employee-list.test.ts` under `listEmployees sorting`:

```ts
it('sorts by job title, then by name', () => {
  add({ firstName: 'B', lastName: 'Two', jobTitle: 'Analyst' });
  add({ firstName: 'A', lastName: 'One', jobTitle: 'Writer' });
  add({ firstName: 'C', lastName: 'Three', jobTitle: 'Analyst' });
  expect(names(list({ sortBy: 'jobTitle' }))).toEqual(['C Three', 'B Two', 'A One']);
});
it('sorts by department name, not by department id', () => {
  // insert departments "Accounts" (id 2) so Accounts < Engineering although its id is higher
  expect(names(list({ sortBy: 'department' }))).toEqual(['In Accounts', 'In Engineering']);
});
it('sorts by level rank, not by level code or id', () => {
  // insert level { code: 'Z0', label: 'Intern', rank: 0 } (id 4): last by rank, first by code or id
  expect(names(list({ sortBy: 'level', sortOrder: 'desc' }))).toEqual(['At L3', 'At L1', 'At Z0']);
});
it('sorts by country name, not by country code', () => {
  // insert country { code: 'ES', name: 'Spain', currencyCode: 'EUR' }; employees in DE, ES, IN
  expect(names(list({ sortBy: 'country' }))).toEqual(['In Germany', 'In India', 'In Spain']);
});
```

In `routes/employees.test.ts`: `it('accepts every sort key')` loops `['name','jobTitle','department','level','country','hireDate','salary']` and expects 200 for each, and `sortBy=bogus` → 400.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-list employees.test`
Expected: FAIL (Zod rejects the new keys / type error in `listOrderBy`).

- [ ] **Step 3: Implement**

Extend the enum and `listOrderBy`; `selectEmployeeRows` adds `innerJoin(countries, eq(countries.code, employees.countryCode))` so the country sort can read `countries.name` (the selected shape and `toListRow` stay the same). Add `index('employees_status_job_title_idx').on(t.status, t.jobTitle)` to `schema.ts`, then generate the migration.

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm run db:generate -w @acme/api`
Expected: a new `apps/api/drizzle/0001_*.sql` containing only `CREATE INDEX \`employees_status_job_title_idx\` ON \`employees\` (\`status\`,\`job_title\`);` plus the updated `meta/_journal.json` and a `0001_snapshot.json`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS (the test DB applies the new migration through `createTestDb`).

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared/src/employees.ts apps/api/src apps/api/drizzle
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): sort employees by job title, department, level rank and country" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Facet counts endpoint and latency measurement

**Files:**
- Modify: `packages/shared/src/employees.ts`, `packages/shared/src/index.ts`, `apps/api/src/repositories/employees.ts`, `apps/api/src/routes/employees.ts`, `apps/api/package.json`, `docs/performance.md`, `docs/decisions.md` (fill entry 8's measured figure)
- Create: `apps/api/src/services/employee-facets.ts`, `apps/api/src/services/employee-facets.test.ts`, `apps/api/src/perf/measure-latency.ts`
- Test: `apps/api/src/routes/employees.test.ts`

**Interfaces:**
- Produces (shared): `employeeFacetsQuerySchema = employeeListQuerySchema.omit({ sortBy, sortOrder, limit, offset })`; `employeeFacetsResponseSchema`:
  ```ts
  { statusTotal: number;                                   // rows in the chosen status, no other filter or search
    status: { value: 'active' | 'inactive'; count: number }[];
    country: { value: string; count: number }[];
    department: { value: number; count: number }[];
    level: { value: number; count: number }[] }            // each ordered by value; zero-count options omitted
  ```
  Types `EmployeeFacetsQuery`, `EmployeeFacets` exported from `@acme/shared`.
- Produces (API): `countEmployeeRows(db, filter): number` (also used by `listEmployeeRows`); `countEmployeesGroupedBy(db, filter, column: 'status' | 'countryCode' | 'departmentId' | 'levelId'): { value: string | number; count: number }[]`; `getEmployeeFacets(db, query): EmployeeFacets`; route `GET /api/employees/facets`. A group's counts apply the search and every other group's selection but not its own (status counts ignore the status filter).

- [ ] **Step 1: Write the failing tests**

`services/employee-facets.test.ts` (fixture: active IN/L1 ×2, active IN/L2 ×1, active DE/L1 ×1, active US/L2 ×1, inactive IN/L1 ×1, all department 1; one IN/L1 has job title "Channel Manager"):

```ts
it('counts each option under the other groups\' selections but not its own', () => {
  const facets = getEmployeeFacets(db, { status: 'active', country: ['IN'], level: [1] });
  expect(facets.country).toEqual([{ value: 'DE', count: 1 }, { value: 'IN', count: 2 }]);
  expect(facets.level).toEqual([{ value: 1, count: 2 }, { value: 2, count: 1 }]);
  expect(facets.status).toEqual([{ value: 'active', count: 2 }, { value: 'inactive', count: 1 }]);
  expect(facets.department).toEqual([{ value: 1, count: 2 }]);
});
it('applies the search to every group', () => {
  expect(getEmployeeFacets(db, { status: 'active', search: 'channel' }).country).toEqual([{ value: 'IN', count: 1 }]);
});
it('reports how many employees have the chosen status before any other filter or search', () => {
  expect(getEmployeeFacets(db, { status: 'active', country: ['DE'], search: 'x' }).statusTotal).toBe(5);
  expect(getEmployeeFacets(db, { status: 'all' }).statusTotal).toBe(6);
});
it('leaves out options nobody matches', () => {
  expect(getEmployeeFacets(db, { status: 'active', level: [2] }).country.map((c) => c.value)).toEqual(['IN', 'US']);
});
```

`routes/employees.test.ts`: `describe('GET /api/employees/facets')` with `it('returns the counts for the filters in the query string')` (`?country=US&level=1` → `statusTotal: 3`, `level: [{ value: 1, count: 3 }]`), `it('is not mistaken for an employee id')` (200, body has `statusTotal`), `it('requires a session')` (401 without cookie).

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-facets employees.test`
Expected: FAIL (module not found / 404).

- [ ] **Step 3: Implement**

Repository functions as in Interfaces (`select column, count() ... where listWhere(filter) group by column order by column`). `getEmployeeFacets` makes the four grouped counts, each with its own group removed from the filter (status → `'all'`), plus `countEmployeeRows(db, { status })`. Register the route before `/api/employees/:id` (static path) with `querystring: employeeFacetsQuerySchema`, `response: { 200: employeeFacetsResponseSchema }`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS.

- [ ] **Step 5: Add the latency script**

Create `apps/api/src/perf/measure-latency.ts`: loads config, opens `DATABASE_PATH`, builds the app (`jwtSecret` from config or a 32-character local constant), logs in with `HR_SEED_EMAIL`/`HR_SEED_PASSWORD` via `POST /api/auth/login`, then for each case runs 5 warm-up and 40 timed `app.inject` calls and prints one markdown row `| <case> | p50 ms | p95 ms |` (nearest-rank percentiles of the sorted durations, one decimal). Cases: `/api/employees`; `/api/employees?sortBy=jobTitle`, `department`, `level`, `country` (each `sortOrder=desc`); `/api/employees?status=all&sortBy=department&offset=9000`; `/api/employees?country=IN&country=DE&level=3&level=4`; `/api/employees/facets`; `/api/employees/facets?search=ann&country=IN`. Add `"perf:latency": "tsx --env-file-if-exists=.env src/perf/measure-latency.ts"` to `apps/api/package.json`.

- [ ] **Step 6: Measure on the full seed**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && mkdir -p apps/api/data && rm -f apps/api/data/perf.db* && DATABASE_PATH=./data/perf.db SEED_RNG_SEED=42 SEED_REFERENCE_DATE=2026-10-21 HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run db:seed -w @acme/api && DATABASE_PATH=./data/perf.db HR_SEED_EMAIL=perf@acme.test HR_SEED_PASSWORD=perf-password npm run perf:latency -w @acme/api
```
Expected: one row per case, every p95 below 300 ms. If any p95 is ≥ 300 ms, add the index the slow query needs (schema + `db:generate`), re-measure, and say so in decision entry 8.

- [ ] **Step 7: Record the numbers**

Add the printed rows to the `docs/performance.md` latency table, with a sentence naming the date (2026-10-21), the method (`npm run perf:latency`, in-process `app.inject`, 40 requests, RNG seed 42) and that the database file is `apps/api/data/perf.db` (git-ignored). Put the measured department/country/level sort p95 into decision entry 8. Delete `apps/api/data/perf.db*`.

- [ ] **Step 8: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add packages/shared/src apps/api/src apps/api/package.json docs/performance.md docs/decisions.md
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add employee filter facet counts and a latency measurement script" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: One peer-group service and the drawer's peer context

**Files:**
- Create: `apps/api/src/domain/peer-groups.ts`, `apps/api/src/domain/peer-groups.test.ts`, `apps/api/src/services/peer-groups.ts`, `apps/api/src/services/peer-groups.test.ts`
- Modify: `apps/api/src/repositories/employees.ts`, `apps/api/src/services/insights.ts:95-148`, `apps/api/src/routes/employees.ts`, `packages/shared/src/employees.ts`, `packages/shared/src/index.ts`
- Test: `apps/api/src/routes/employees.test.ts`, existing `apps/api/src/services/insights.test.ts` (must pass unchanged)

**Interfaces:**
- Produces (domain, pure):
  ```ts
  export interface PeerMember { amountMinor: number; currencyCode: string; amountBaseMinor: number }
  export interface PeerGroupSummary {
    headcount: number; currencyCode: string;
    typical: { p25: number; median: number; p75: number }; // local minor units
    base: Distribution;                                     // USD, from computeDistribution
    fences: OutlierFences;                                  // USD, exact (unrounded)
  }
  export function peerGroupKey(countryCode: string, levelId: number): string; // "IN:3"
  export function summarisePeerGroup(members: PeerMember[], currencyCode: string): PeerGroupSummary | null;
  export type PeerPosition = { typical: 'below' | 'inside' | 'above'; outlier: 'below' | 'above' | null };
  export function peerPosition(amount: { amountMinor: number; amountBaseMinor: number }, summary: PeerGroupSummary): PeerPosition;
  ```
  `summarisePeerGroup` returns `null` under `MIN_PEER_GROUP_SIZE`, and also when no member is paid in `currencyCode`; `typical` uses only the members paid in `currencyCode`; `headcount`, `base` and `fences` use every member. `inside` is inclusive of p25 and p75; `outlier` uses `isOutlier` on the USD amount.
- Produces (repository): `listActivePeerAmounts(db, keys?: { countryCode: string; levelId: number }[]): { countryCode: string; levelId: number; amountMinor: number; currencyCode: string; amountBaseMinor: number }[]`.
- Produces (service, the single source for phases 2 and 4):
  ```ts
  export interface PeerGroup { countryCode: string; levelId: number; currencyCode: string; headcount: number; summary: PeerGroupSummary | null }
  export function getPeerGroups(db: DbHandle, keys?: { countryCode: string; levelId: number }[]): Map<string, PeerGroup>; // keyed by peerGroupKey; only groups with members
  export function toPeerContext(group: PeerGroup, levelCode: string, amount: { amountMinor: number; amountBaseMinor: number }): PeerContext;
  export function getPeerContext(db: DbHandle, employeeId: number): PeerContext; // 404 EMPLOYEE_NOT_FOUND
  ```
- Produces (shared): `peerContextSchema` / `PeerContext`:
  `{ countryCode, levelId, levelCode, currencyCode, headcount, typical: { p25, median, p75 } | null, position: { typical: 'below'|'inside'|'above'; outlier: 'below'|'above'|null } | null }`. A group with no active members gives `headcount: 0, typical: null, position: null`.
- Produces (route): `GET /api/employees/:id/peer-context` → `peerContextSchema`.

- [ ] **Step 1: Write the failing domain tests**

`domain/peer-groups.test.ts`:

```ts
const members = (n: number) => Array.from({ length: n }, (_, i) => ({ amountMinor: (i + 1) * 1000, currencyCode: 'INR', amountBaseMinor: (i + 1) * 2000 }));
it('returns no summary for a group smaller than the minimum peer group size', () => {
  expect(summarisePeerGroup(members(9), 'INR')).toBeNull();
  expect(summarisePeerGroup(members(10), 'INR')).not.toBeNull();
});
it('gives the typical range and median in local currency and the fences in USD', () => {
  const s = summarisePeerGroup(members(10), 'INR')!;
  expect(s.typical).toEqual({ p25: 3250, median: 5500, p75: 7750 });
  expect(s.fences).toEqual({ lower: -7000, upper: 29000 });
  expect(s.headcount).toBe(10);
});
it('leaves members paid in another currency out of the local figures but not out of the USD fences', () => {
  const s = summarisePeerGroup([...members(10), { amountMinor: 1, currencyCode: 'EUR', amountBaseMinor: 22000 }], 'INR')!;
  expect(s.typical.p25).toBe(3250); expect(s.headcount).toBe(11); expect(s.base.headcount).toBe(11);
});
it('places an amount inside the typical range when it lies on or between the quartiles', () => {
  const s = summarisePeerGroup(members(10), 'INR')!;
  expect(peerPosition({ amountMinor: 3250, amountBaseMinor: 6500 }, s)).toEqual({ typical: 'inside', outlier: null });
  expect(peerPosition({ amountMinor: 8000, amountBaseMinor: 16000 }, s)).toEqual({ typical: 'above', outlier: null });
});
it('flags an outlier only beyond the USD fences', () => {
  const s = summarisePeerGroup(members(10), 'INR')!;
  expect(peerPosition({ amountMinor: 20000, amountBaseMinor: 29000 }, s).outlier).toBeNull();
  expect(peerPosition({ amountMinor: 20000, amountBaseMinor: 29001 }, s).outlier).toBe('above');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- peer-groups`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `domain/peer-groups.ts`**

Reuse `computeDistribution`, `outlierFences`, `isOutlier`, `MIN_PEER_GROUP_SIZE` from `domain/stats.ts`. If no member is paid in `currencyCode`, return `null`.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- domain/peer-groups`
Expected: PASS.

- [ ] **Step 5: Write the failing service and route tests**

`services/peer-groups.test.ts` (use `createEmployees`; 10 active IN/L1 at 1,000,000.00–1,900,000.00 INR, 1 inactive IN/L1, 3 US/L1):

```ts
it('groups active employees by country and level and leaves inactive ones out', () => {
  const groups = getPeerGroups(db);
  expect(groups.get('IN:1')).toMatchObject({ headcount: 10, currencyCode: 'INR' });
  expect(groups.get('US:1')).toMatchObject({ headcount: 3, summary: null });
});
it('reads only the requested groups when keys are given', () => {
  expect([...getPeerGroups(db, [{ countryCode: 'US', levelId: 1 }]).keys()]).toEqual(['US:1']);
});
it('gives an employee the typical range of their peers and where their own pay sits', () => {
  expect(getPeerContext(db, inIdPaidMost)).toMatchObject({ countryCode: 'IN', levelCode: 'L1', headcount: 10, typical: { median: 145_000_000 }, position: { typical: 'above' } });
});
it('reports too few peers rather than a range for a small or empty group', () => {
  expect(getPeerContext(db, usId)).toMatchObject({ headcount: 3, typical: null, position: null });
  expect(toPeerContext({ countryCode: 'DE', levelId: 3, currencyCode: 'EUR', headcount: 0, summary: null }, 'L3', { amountMinor: 1, amountBaseMinor: 1 }))
    .toMatchObject({ headcount: 0, typical: null, position: null });
});
it('answers an unknown employee with not found', () => {
  expect(() => getPeerContext(db, 999)).toThrow(expect.objectContaining({ statusCode: 404 }));
});
```

`routes/employees.test.ts`: `describe('GET /api/employees/:id/peer-context')` → `it('returns the peer context in the employee\'s local currency')` (200, `currencyCode: 'USD'`, `headcount: 3`, `typical: null` for the 3-person fixture) and `it('answers an unknown employee with 404')`.

- [ ] **Step 6: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- peer-groups employees.test`
Expected: FAIL.

- [ ] **Step 7: Implement repository, service, route; move `getOutliers` onto `getPeerGroups`**

`listActivePeerAmounts` filters `status = 'active'` and, when keys are given, `or(...keys.map(k => and(eq(country), eq(level))))` (served by `employees_country_level_idx`). Group currency comes from `listCountries`. `getOutliers` keeps its response exactly but takes `base` (p25/median/p75/headcount) and `fences` from `getPeerGroups(db)` instead of computing them itself.

- [ ] **Step 8: Run all API tests**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api`
Expected: PASS, including every existing `getOutliers` test unchanged.

- [ ] **Step 9: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src packages/shared/src
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add one peer-group service and an employee peer-context endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: History % change per row and the salary-change preview endpoint

**Files:**
- Modify: `apps/api/src/domain/revision.ts`, `apps/api/src/domain/revision.test.ts`, `apps/api/src/services/employee-detail.ts`, `apps/api/src/routes/employees.ts`, `packages/shared/src/employees.ts`, `packages/shared/src/index.ts`, `apps/web/src/test/fixtures.ts`
- Create: `apps/api/src/domain/history-change.ts`, `apps/api/src/domain/history-change.test.ts`, `apps/api/src/services/salary-change-preview.ts`, `apps/api/src/services/salary-change-preview.test.ts`
- Test: `apps/api/src/services/employee-detail.test.ts`, `apps/api/src/routes/employees.test.ts`

**Interfaces:**
- Consumes: `getPeerGroups`, `toPeerContext` (Task 5); `proposedAmount` (`domain/revision.ts`); `convert`, `BASE_CURRENCY` (`domain/fx.ts`); `loadLatestFxRates`.
- Produces (domain):
  - `percentChangeBp(fromMinor: number, toMinor: number): number` — `round_half_away_from_zero((to − from) × 10000 / from)` in BigInt; throws when `fromMinor <= 0`.
  - `historyChangeBp(rows: { id: number; effectiveDate: string; amountMinor: number; currencyCode: string }[], rates: FxRates): Map<number, number | null>` — orders by `effectiveDate` then `id`; the first row is `null`; same currency → `percentChangeBp` on local amounts; different currency → on both amounts converted to USD.
- Produces (shared): `salaryHistoryEntrySchema` gains `changeBp: z.number().int().nullable()`. `salaryChangePreviewBodySchema` (strict): `{ reason: 'raise'|'promotion'|'relocation'|'correction'; amountMinor?: positive int; percentageBp?: 1..10000; newLevelId?: positive int; newCountryCode?: string }`, exactly one of `amountMinor`/`percentageBp` ("provide exactly one of amountMinor or percentageBp"), no `percentageBp` with `relocation` ("a relocation takes an amount, not a percentage"). `salaryChangePreviewSchema`: `{ current: Money; proposed: Money; changeBaseMinor: number; changeBp: number; peer: PeerContext }` where `Money = { amountMinor, currencyCode, amountBaseMinor }`. Types `SalaryChangePreviewBody`, `SalaryChangePreview`.
- Produces (service/route): `previewSalaryChange(db, employeeId, body): SalaryChangePreview`; `POST /api/employees/:id/salary-changes/preview` (200, read-only). Target country = `newCountryCode ?? current`; target level = `newLevelId ?? current`; currency = target country's for a relocation, else the current currency; `proposed.amountMinor = proposedAmount(current, percentageBp)` or `amountMinor`; `changeBp` on local amounts when the currency is unchanged, else on USD; `peer` = `toPeerContext` of the target group for the proposed amount. Unknown employee → 404; unknown level or country → 422 `INVALID_SALARY_CHANGE`. Business rules (raise must increase, etc.) are not checked here; the submit endpoint still does.

- [ ] **Step 1: Write the failing domain tests**

```ts
// domain/revision.test.ts
it('gives the percentage change in basis points, rounded half away from zero', () => {
  expect(percentChangeBp(100, 105)).toBe(500);
  expect(percentChangeBp(3, 4)).toBe(3333);
  expect(percentChangeBp(20_000, 20_001)).toBe(1);
  expect(percentChangeBp(20_000, 19_999)).toBe(-1);
  expect(percentChangeBp(100, 95)).toBe(-500);
});
it('refuses to compare against a zero amount', () => { expect(() => percentChangeBp(0, 5)).toThrow(); });

// domain/history-change.test.ts
it('compares each row with the row before it by effective date, leaving the first row empty', () => {
  const result = historyChangeBp([
    { id: 3, effectiveDate: '2024-01-01', amountMinor: 110, currencyCode: 'USD' },
    { id: 1, effectiveDate: '2020-01-01', amountMinor: 100, currencyCode: 'USD' },
    { id: 4, effectiveDate: '2022-01-01', amountMinor: 105, currencyCode: 'USD' }, // backdated entry
  ], {});
  expect(result).toEqual(new Map([[1, null], [4, 500], [3, 476]]));
});
it('compares a change of currency in USD at the given rates', () => {
  const rates = { INR: 11_980_000, EUR: 1_080_000_000 };
  const result = historyChangeBp([
    { id: 1, effectiveDate: '2020-01-01', amountMinor: 500_000_000, currencyCode: 'INR' }, // $59,900.00
    { id: 2, effectiveDate: '2021-01-01', amountMinor: 6_000_000, currencyCode: 'EUR' },   // $64,800.00
  ], rates);
  expect(result.get(2)).toBe(818);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- revision history-change`
Expected: FAIL.

- [ ] **Step 3: Implement the two domain functions; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- revision history-change`
Expected: PASS.

- [ ] **Step 4: Write the failing service and route tests**

`services/employee-detail.test.ts`: `it('gives each history row its percentage change from the row before it')` (hire 10,000,000 then raise 10,500,000 → rows newest first with `changeBp` `[500, null]`).

`services/salary-change-preview.test.ts` (an IN/L1 employee on 500,000,000 INR plus ten IN/L2 peers):

```ts
it('applies a percentage to the current salary with the domain rounding', () => {
  expect(previewSalaryChange(db, id, { reason: 'raise', percentageBp: 333 }).proposed)
    .toEqual({ amountMinor: 516_650_000, currencyCode: 'INR', amountBaseMinor: 6_189_467 });
});
it('reports the change as basis points and as USD a year', () => {
  expect(previewSalaryChange(db, id, { reason: 'raise', amountMinor: 550_000_000 }))
    .toMatchObject({ changeBp: 1000, changeBaseMinor: 599_000 });
});
it('compares a relocation in USD because the currency changes', () => {
  const p = previewSalaryChange(db, id, { reason: 'relocation', amountMinor: 6_000_000, newCountryCode: 'DE' });
  expect(p.proposed).toEqual({ amountMinor: 6_000_000, currencyCode: 'EUR', amountBaseMinor: 6_480_000 });
  expect(p.changeBp).toBe(818);
  expect(p.peer).toMatchObject({ countryCode: 'DE', headcount: 0, typical: null });
});
it('places the proposed amount against the peers of the new level for a promotion', () => {
  expect(previewSalaryChange(db, id, { reason: 'promotion', percentageBp: 1000, newLevelId: 2 }).peer)
    .toMatchObject({ levelCode: 'L2', headcount: 10 });
});
it('rejects an unknown level or country as unprocessable and an unknown employee as not found', () => { /* 422, 422, 404 */ });
it('does not write anything', () => { /* salary_history row count unchanged */ });
```

`routes/employees.test.ts`: `describe('POST /api/employees/:id/salary-changes/preview')` → `it('returns the proposed amount for a percentage')`, `it('rejects both an amount and a percentage, or neither, with 400')`, `it('rejects a percentage for a relocation with 400')`, `it('requires a session')`.

- [ ] **Step 5: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/api -- employee-detail salary-change-preview employees.test`
Expected: FAIL.

- [ ] **Step 6: Implement the detail change, the preview service and the route**

`getEmployeeDetail` loads the latest rates and adds `changeBp` from `historyChangeBp`. Register the preview route with `params: employeeIdParamsSchema`, `body: salaryChangePreviewBodySchema`, `response: { 200: salaryChangePreviewSchema }`. Update `apps/web/src/test/fixtures.ts` `employeeDetail()` history: the raise row `changeBp: 1111`, the hire row `changeBp: null`.

- [ ] **Step 7: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/api/src packages/shared/src apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(api): add the history % change per row and a salary change preview endpoint" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Theme tokens, non-modal menus, and restyled card, segmented control and tabs

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/components/ui/dropdown-menu.tsx`, `apps/web/src/components/ui/card.tsx`, `apps/web/src/components/ui/segmented-control.tsx`
- Create: `apps/web/src/components/ui/tabs.tsx`, `apps/web/src/components/ui/dropdown-menu.test.tsx`, `apps/web/src/components/ui/segmented-control.test.tsx`, `apps/web/src/components/ui/tabs.test.tsx`

**Interfaces:**
- Produces (CSS): `:root` `--canvas: #f9fafb; --accent-tint: #eff6ff; --accent-tint-border: #bfdbfe; --series-secondary: #93c5fd; --series-promotion: #7c3aed; --brand-panel: #0b1f4d;` and `--card: var(--background)`; `@theme inline` colours `--color-canvas`, `--color-accent-tint`, `--color-accent-tint-border`, `--color-series-secondary`, `--color-series-promotion`, `--color-brand-panel`.
- Produces: `DropdownMenu` defaults `modal` to `false` (callers may still pass it); new exports `DropdownMenuCheckboxItem`, `DropdownMenuSeparator`. `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` keep their names: white, 1px `border`, 6px radius, no shadow. `SegmentedControl` keeps its props and adds optional `size?: 'sm' | 'md'` (default `'sm'`); style: `surface` track, selected item white with `accent` text and a hairline border, unselected `text-secondary`. `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` wrap Radix Tabs; active trigger has a 2px `accent` underline (same look as the top bar).

- [ ] **Step 1: Write the failing tests**

```tsx
// dropdown-menu.test.tsx
it('opens without locking page scroll or blocking the page', async () => {
  render(<DropdownMenu><DropdownMenuTrigger>Open</DropdownMenuTrigger>
    <DropdownMenuContent><DropdownMenuItem>One</DropdownMenuItem></DropdownMenuContent></DropdownMenu>);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Open' }), { key: 'ArrowDown' });
  expect(await screen.findByRole('menuitem', { name: 'One' })).toBeDefined();
  expect(document.body.hasAttribute('data-scroll-locked')).toBe(false);
  expect(document.body.style.pointerEvents).toBe('');
});
it('reports a ticked checkbox item', async () => { /* DropdownMenuCheckboxItem checked onCheckedChange → called with false */ });

// segmented-control.test.tsx
it('marks the selected option and reports a new choice', () => {
  // options Raise/Promotion, value 'raise'
  expect(screen.getByRole('radio', { name: 'Raise' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(screen.getByRole('radio', { name: 'Promotion' }));
  expect(onChange).toHaveBeenCalledWith('promotion');
});

// tabs.test.tsx
it('shows the panel of the chosen tab', () => {
  // tabs "Change salary" (default) and "Details"
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Details' }));
  expect(screen.getByRole('tabpanel').textContent).toContain('details body');
  expect(screen.getByRole('tab', { name: 'Details' }).getAttribute('aria-selected')).toBe('true');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- components/ui`
Expected: FAIL (`data-scroll-locked` present / `tabs` missing).

- [ ] **Step 3: Implement tokens and components**

Audit every dropdown: `grep -rn "DropdownMenu" apps/web/src` shows `user-menu.tsx` and `export-menu.tsx`; both go through the wrapper, so neither passes `modal`. Confirm no file imports `DropdownMenu` from `radix-ui` directly.

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web`
Expected: PASS (existing insights tests still pass with the restyled segmented control).

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/app/globals.css apps/web/src/components/ui
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add the refined theme tokens, tabs, and non-modal dropdown menus" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Avatar, country flag, level badge, chip, checkbox group and stat tile

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json`
- Create: `apps/web/src/components/ui/avatar.tsx`, `country-flag.tsx`, `level-badge.tsx`, `chip.tsx`, `checkbox-group.tsx`, `stat-tile.tsx`, and `apps/web/src/components/ui/building-blocks.test.tsx`

**Interfaces:**
- Produces:
  - `initials(name: string): string` — first letter of the first and last words, upper-cased; one word → one letter; blank → `'?'`. `Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' })` — `aria-hidden` circle, `accent-tint` fill, `accent` text.
  - `CountryFlag({ code, name, showName = true }: { code: string; name?: string; showName?: boolean })` — an `aria-hidden` 3×2 SVG flag for codes in its map (`IN`, `US`, `DE`, imported by name from `country-flag-icons/react/3x2`), otherwise the code in a small outlined box (`data-fallback`); followed by `name ?? code` when `showName`.
  - `LevelBadge({ code }: { code: string })` — small outlined badge, `tabular-nums`.
  - `Chip({ label, onRemove }: { label: string; onRemove?: () => void })` — `accent-tint` fill, `accent-tint-border`, `text-primary`; with `onRemove`, a ×-button named `Remove filter ${label}`.
  - `CheckboxGroup<T extends string | number>({ legend, options, selected, onChange }: { legend: string; options: { value: T; label: string; count?: number }[]; selected: readonly T[]; onChange: (next: T[]) => void })` — a `<fieldset>` with `<legend>`; each option a native checkbox named by its label, its count in a `tabular-nums` span linked with `aria-describedby`; ticking appends the value, unticking removes it; zero-count options are shown in `text-secondary` and stay enabled; min height 44px below `md`.
  - `StatTile({ label, value, hint, tone = 'neutral' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'neutral' | 'positive' | 'negative' | 'warning' })` — `role="group"` named by `label`; label 11px uppercase `text-secondary`; value 22px weight 650 `tabular-nums`.

- [ ] **Step 1: Add the flag dependency**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm install country-flag-icons@1.6.20 --save-exact -w @acme/web`
Expected: `apps/web/package.json` lists `"country-flag-icons": "1.6.20"`.

- [ ] **Step 2: Write the failing tests** (`building-blocks.test.tsx`)

```tsx
it('makes initials from the first and last words of a name', () => {
  expect(initials('Asha Rao')).toBe('AR');
  expect(initials('mary ann de souza')).toBe('MS');
  expect(initials('Prince')).toBe('P');
  expect(initials('   ')).toBe('?');
});
it('shows a flag and the country name, falling back to the code when there is no flag', () => {
  const { container } = render(<><CountryFlag code="IN" name="India" /><CountryFlag code="BR" name="Brazil" /></>);
  expect(container.querySelectorAll('svg')).toHaveLength(1);
  expect(screen.getByText('India')).toBeDefined();
  expect(container.querySelector('[data-fallback]')?.textContent).toBe('BR');
});
it('removes a chip from its own button', () => {
  render(<Chip label="India" onRemove={onRemove} />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove filter India' }));
  expect(onRemove).toHaveBeenCalled();
});
it('adds and removes values and ties each count to its checkbox', () => {
  render(<CheckboxGroup legend="Country" selected={['IN']} onChange={onChange}
    options={[{ value: 'IN', label: 'India', count: 120 }, { value: 'DE', label: 'Germany', count: 0 }]} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Germany' }));
  expect(onChange).toHaveBeenLastCalledWith(['IN', 'DE']);
  fireEvent.click(screen.getByRole('checkbox', { name: 'India' }));
  expect(onChange).toHaveBeenLastCalledWith([]);
  const india = screen.getByRole('checkbox', { name: 'India' });
  expect(document.getElementById(india.getAttribute('aria-describedby') ?? '')?.textContent).toBe('120');
  expect(screen.getByRole('group', { name: 'Country' })).toBeDefined();
});
it('shows a stat tile with its label, value and hint', () => {
  render(<StatTile label="Current salary" value="₹50,00,000" hint="since 1 Apr 2025" />);
  const tile = screen.getByRole('group', { name: 'Current salary' });
  expect(within(tile).getByText('₹50,00,000')).toBeDefined();
  expect(within(tile).getByText('since 1 Apr 2025')).toBeDefined();
});
it('shows a level as a badge', () => { render(<LevelBadge code="L3" />); expect(screen.getByText('L3')).toBeDefined(); });
```

- [ ] **Step 3: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- building-blocks`
Expected: FAIL (modules not found).

- [ ] **Step 4: Implement the six components; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- building-blocks`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/package.json package-lock.json apps/web/src/components/ui
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add avatar, country flag, level badge, chip, checkbox group and stat tile

Adds country-flag-icons: SVG flags render on every platform, unlike emoji flags,
and only the flags the app imports are bundled.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Top bar with the underline active state, and the login screen

**Files:**
- Create: `apps/web/src/components/ui/app-mark.tsx`, `apps/web/src/features/auth/login-screen.tsx`, `apps/web/src/features/auth/login-screen.test.tsx`, `apps/web/src/features/auth/top-bar.test.tsx`
- Modify: `apps/web/src/features/auth/top-bar.tsx`, `apps/web/src/features/auth/login-form.tsx`, `apps/web/src/features/auth/login-form.test.tsx`, `apps/web/src/app/login/page.tsx`

**Interfaces:**
- Produces: `AppMark({ tone = 'light' }: { tone?: 'light' | 'dark' })` — small `accent` square plus "Salary Management" (white text when `dark`). `LoginScreen()` — the whole login layout; `app/login/page.tsx` renders only `<LoginScreen />`. `LoginForm` gains a Show/Hide password toggle (button named "Show password" / "Hide password", `aria-pressed`) and a full-width submit.
- Copy (exact): panel `<aside aria-label="Salary Management">` contains only `AppMark tone="dark"` and an `aria-hidden` SVG bar-chart pattern at low opacity in the bottom-right corner; heading `Sign in`; subline `Use your work email and password.`; note `Sessions last a working day.`

- [ ] **Step 1: Write the failing tests**

```tsx
// top-bar.test.tsx — mock next/navigation usePathname → '/employees/12', useRouter; stub GET /api/auth/me
it('shows the app mark and name and underlines the current section', async () => {
  renderWithQuery(<TopBar />);
  const employees = screen.getByRole('link', { name: 'Employees' });
  expect(employees.getAttribute('aria-current')).toBe('page');
  expect(employees.className).toContain('border-primary');
  expect(screen.getByRole('link', { name: 'Insights' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByText('Salary Management')).toBeDefined();
});

// login-screen.test.tsx — mock next/navigation useRouter
it('shows only the app name on the brand panel, with no pitch copy', () => {
  renderWithQuery(<LoginScreen />);
  const panel = screen.getByRole('complementary', { name: 'Salary Management' });
  expect(panel.textContent?.trim()).toBe('Salary Management');
  expect(within(panel).queryAllByRole('heading')).toHaveLength(0);
});
it('asks the user to sign in and says how long a session lasts', () => {
  renderWithQuery(<LoginScreen />);
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeDefined();
  expect(screen.getByText('Use your work email and password.')).toBeDefined();
  expect(screen.getByText('Sessions last a working day.')).toBeDefined();
});

// login-form.test.tsx
it('shows and hides the password', () => {
  renderWithQuery(<LoginForm />);
  fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
  expect(screen.getByLabelText<HTMLInputElement>('Password').type).toBe('text');
  fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(screen.getByLabelText<HTMLInputElement>('Password').type).toBe('password');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- auth`
Expected: FAIL.

- [ ] **Step 3: Implement**

Top bar: `AppMark` on the left (name hidden below `sm` as today), links with `border-b-2 border-primary text-primary` when active and `border-transparent text-text-secondary hover:text-text-primary` otherwise, 44px tall below `md`. Login screen: two columns at `md` (panel `md:w-[55%] bg-brand-panel`, form column centred, `max-w-sm`); below `md` the panel becomes a slim header band (logo only, pattern hidden).

- [ ] **Step 4: Run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- auth`
Expected: PASS.

- [ ] **Step 5: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/components/ui/app-mark.tsx apps/web/src/features/auth apps/web/src/app/login/page.tsx
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): restyle the top bar and add the brand-panel login screen" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Employee list state — sort keys, page size, status checks, chips and facets query

**Files:**
- Modify: `apps/web/src/features/employees/list-filters.ts`, `apps/web/src/features/employees/list-filters.test.ts`, `apps/web/src/features/employees/use-employees.ts`, `apps/web/src/test/fixtures.ts`

**Interfaces:**
- Consumes: Task 2 `ListFilters` arrays; shared `EmployeeFacets`, `employeeFacetsResponseSchema`, `Country`, `Department`, `Level`.
- Produces:
  ```ts
  export type SortKey = 'name' | 'jobTitle' | 'department' | 'level' | 'country' | 'hireDate' | 'salary';
  export const PAGE_SIZES = [25, 50, 100] as const;
  export type PageSize = (typeof PAGE_SIZES)[number];
  // ListFilters gains: sortBy: SortKey; pageSize: PageSize (URL param `pageSize`, default 50, omitted when default);
  // DEFAULT_FILTERS gains pageSize: 50
  export function statusChecks(status: ListFilters['status']): ('active' | 'inactive')[]; // all → both
  export function statusFromChecks(checks: readonly ('active' | 'inactive')[]): ListFilters['status']; // both → 'all', none → 'active'
  export interface FilterChip { key: string; label: string; remove: Partial<ListFilters> }
  export function filterChips(filters: ListFilters, ref: { countries: Country[]; departments: Department[]; levels: Level[] }): FilterChip[];
  export function activeFilterCount(filters: ListFilters): number; // values selected + 1 when status ≠ active
  export function hasActiveFilters(filters: ListFilters): boolean;  // any chip or a search
  export function facetsApiQuery(filters: ListFilters): URLSearchParams; // search, country, department, level, status, in that order; no sort or paging
  export function useEmployeeFacets(filters: ListFilters); // in use-employees.ts; key ['employees','facets',query]; keepPreviousData
  ```
  `listApiQuery` sends `limit = pageSize`, `offset = (page − 1) × pageSize`. Chip order: countries, departments, levels (in selection order), then status; labels are reference names (`India`, `Engineering`, `L3`), falling back to the raw value; the status chip is `Inactive` or `Active and inactive` and its `remove` is `{ status: 'active' }`; a value chip's `remove` is the array without that value. `PAGE_SIZE` stays exported (= `DEFAULT_PAGE_SIZE`) for the bulk panel.
- Produces (fixtures): `employeeFacets(overrides?: Partial<EmployeeFacets>): EmployeeFacets` with `statusTotal: 9577`, statuses active 9577 / inactive 423, countries IN 6000 / DE 2000 / US 1577, departments 1 → 5000 / 2 → 4577, levels 1..4.

- [ ] **Step 1: Write the failing tests**

```ts
it('reads every sort key and a supported page size from the URL', () => {
  expect(filtersFromParams(new URLSearchParams('sortBy=level&sortOrder=desc&pageSize=100')))
    .toMatchObject({ sortBy: 'level', sortOrder: 'desc', pageSize: 100 });
});
it('falls back to defaults for values a stale or edited URL may carry and keeps the good ones', () => {
  expect(filtersFromParams(new URLSearchParams('pageSize=37&sortBy=bogus&page=-2&level=0&level=3&country=IN')))
    .toMatchObject({ pageSize: 50, sortBy: 'name', page: 1, level: [3], country: ['IN'] });
});
it('asks the server for the page that matches the page number and page size', () => {
  const q = listApiQuery({ ...DEFAULT_FILTERS, page: 3, pageSize: 25 });
  expect([q.get('limit'), q.get('offset')]).toEqual(['25', '50']);
});
it('treats both statuses ticked as all and none ticked as the default active list', () => {
  expect(statusFromChecks(['active', 'inactive'])).toBe('all');
  expect(statusFromChecks([])).toBe('active');
  expect(statusChecks('all')).toEqual(['active', 'inactive']);
});
it('describes each selected filter as a removable chip', () => {
  const chips = filterChips({ ...DEFAULT_FILTERS, country: ['IN', 'DE'], level: [3], status: 'inactive' }, REFERENCE);
  expect(chips.map((c) => c.label)).toEqual(['India', 'Germany', 'L3', 'Inactive']);
  expect(chips[0]!.remove).toEqual({ country: ['DE'] });
  expect(chips[3]!.remove).toEqual({ status: 'active' });
});
it('builds the facets query from the search, filters and status only', () => {
  expect(facetsApiQuery({ ...DEFAULT_FILTERS, search: 'ann', level: [3], sortBy: 'salary', page: 4 }).toString())
    .toBe('search=ann&level=3&status=active');
});
```

(`REFERENCE` = the countries/departments/levels arrays from `REFERENCE_ROUTES`.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- list-filters`
Expected: FAIL.

- [ ] **Step 3: Implement; add `useEmployeeFacets` and the `employeeFacets` fixture**

Callers of the removed local `activeFilterCount` in `employee-filters.tsx` switch to the exported one.

- [ ] **Step 4: Run to verify pass; run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/employees/list-filters.ts apps/web/src/features/employees/list-filters.test.ts apps/web/src/features/employees/use-employees.ts apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): hold sort, page size, status checks and filter chips in the list URL" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Collapsible left filter panel with counts

**Files:**
- Create: `apps/web/src/hooks/use-stored-flag.ts`, `apps/web/src/features/employees/employee-filter-panel.tsx`, `apps/web/src/features/employees/employee-filter-panel.test.tsx`

**Interfaces:**
- Consumes: `CheckboxGroup` (Task 8), `statusChecks`, `statusFromChecks`, `activeFilterCount` (Task 10), `useCountries`/`useDepartments`/`useLevels`, `Sheet`, `useIsDesktop`.
- Produces:
  - `useStoredFlag(key: string, initial: boolean): [boolean, (next: boolean) => void]` — reads `localStorage` after mount, writes on change, every access in `try/catch`; on failure it keeps working in memory.
  - `EmployeeFilterPanel({ filters, onChange, facets }: { filters: ListFilters; onChange: (patch: Partial<ListFilters>) => void; facets: EmployeeFacets | undefined })`. At `md` and up: an `<aside aria-label="Filters">` with groups Status (Active, Inactive), Country (reference names), Department, Level (codes), counts from `facets` (0 when absent, blank while `facets` is undefined), and a "Hide filters" button; collapsed, it renders only a "Show filters" button. The collapsed state is stored under `employees.filters.collapsed`. Below `md`: a "Filters" button showing `Filters (n)` when `activeFilterCount > 0`, opening a bottom `Sheet` titled "Filters" with the same groups and a "Done" button.

- [ ] **Step 1: Write the failing tests**

```tsx
it('lists each status, country, department and level with its count', async () => {
  renderPanel({ facets: employeeFacets({ country: [{ value: 'IN', count: 120 }] }) });
  const country = await screen.findByRole('group', { name: 'Country' });
  const india = within(country).getByRole('checkbox', { name: 'India' });
  expect(document.getElementById(india.getAttribute('aria-describedby')!)?.textContent).toBe('120');
  expect(within(country).getByRole('checkbox', { name: 'Germany' })).toBeDefined(); // count 0
});
it('adds a second country to the selection instead of replacing it', async () => {
  renderPanel({ filters: { ...DEFAULT_FILTERS, country: ['IN'] } });
  fireEvent.click(await screen.findByRole('checkbox', { name: 'Germany' }));
  expect(onChange).toHaveBeenCalledWith({ country: ['IN', 'DE'] });
});
it('shows everyone when both statuses are ticked and the default list when the last one is unticked', () => {
  renderPanel();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Inactive' }));
  expect(onChange).toHaveBeenLastCalledWith({ status: 'all' });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Active' }));
  expect(onChange).toHaveBeenLastCalledWith({ status: 'active' });
});
it('collapses to give the table full width and remembers that in this browser', () => {
  const { unmount } = renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
  expect(localStorage.getItem('employees.filters.collapsed')).toBe('true');
  expect(screen.queryByRole('group', { name: 'Country' })).toBeNull();
  unmount(); renderPanel();
  expect(screen.getByRole('button', { name: 'Show filters' })).toBeDefined();
});
it('still works when the browser refuses access to storage', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
  renderPanel();
  fireEvent.click(screen.getByRole('button', { name: 'Hide filters' }));
  expect(screen.getByRole('button', { name: 'Show filters' })).toBeDefined();
});
it('opens the filters in a bottom sheet on a narrow screen, counting the active ones', async () => {
  // stub matchMedia → matches: false
  renderPanel({ filters: { ...DEFAULT_FILTERS, country: ['IN', 'DE'] } });
  fireEvent.click(screen.getByRole('button', { name: 'Filters (2)' }));
  expect(await screen.findByRole('dialog', { name: 'Filters' })).toBeDefined();
});
```

`renderPanel` stubs `REFERENCE_ROUTES`, clears `localStorage` in `beforeEach`, and restores mocks in `afterEach`.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employee-filter-panel`
Expected: FAIL.

- [ ] **Step 3: Implement; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employee-filter-panel`
Expected: PASS.

- [ ] **Step 4: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/hooks/use-stored-flag.ts apps/web/src/features/employees/employee-filter-panel.tsx apps/web/src/features/employees/employee-filter-panel.test.tsx
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add the collapsible employee filter panel with option counts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: TanStack employee table, Columns menu and rows per page

**Files:**
- Modify: `apps/web/package.json`, `package-lock.json`, `apps/web/src/features/employees/employee-table.tsx`, `apps/web/src/features/employees/employee-table.test.tsx`, `apps/web/src/components/pagination.tsx`
- Create: `apps/web/src/features/employees/columns-menu.tsx`, `apps/web/src/components/pagination.test.tsx`

**Interfaces:**
- Consumes: `Avatar`, `CountryFlag`, `LevelBadge` (Task 8), `DropdownMenuCheckboxItem` (Task 7), `SortKey` (Task 10), `useCountries`.
- Produces:
  ```ts
  export const HIDEABLE_COLUMNS = ['department', 'level', 'country', 'hireDate', 'salary'] as const;
  export type HideableColumn = (typeof HIDEABLE_COLUMNS)[number];
  export type ColumnVisibility = Record<HideableColumn, boolean>;
  export const ALL_COLUMNS_VISIBLE: ColumnVisibility;
  export interface EmployeeTableProps {
    items: EmployeeListItem[]; sortBy: SortKey; sortOrder: 'asc' | 'desc'; onSort: (sortBy: SortKey) => void;
    selectable: boolean; selectMode: boolean;
    selectedIds: ReadonlySet<number>; onSelectionChange: (next: ReadonlySet<number>) => void;
    columnVisibility: ColumnVisibility; onOpen: (id: number) => void; detailQuery: string;
  }
  export function ColumnsMenu({ visibility, onChange }: { visibility: ColumnVisibility; onChange: (next: ColumnVisibility) => void }); // button "Columns"
  ```
  The desktop table uses `useReactTable` with `getCoreRowModel`, `manualSorting: true`, `manualPagination: true`, `getRowId: (row) => String(row.id)`, and controlled `state.sorting` (from `sortBy`/`sortOrder`), `state.columnVisibility` and `state.rowSelection` (from `selectedIds`); `onRowSelectionChange` reports the new id set through `onSelectionChange`. Columns: `select`, `employee` (avatar, name link, Inactive badge, job title in grey; header has two sort buttons "Name" and "Job title"), `department`, `level` (`LevelBadge`), `country` (`CountryFlag` with the reference name), `hireDate`, `salary` (local amount, USD in small grey text beside it unless USD; right-aligned). Every sort button is named `Sort by <label>`; the column's `<th>` has `aria-sort` when active and the active icon is `text-primary`. A click on a row (`<tr>`) calls `onOpen(id)` unless the click started inside an `a`, `button`, `input` or `label`. The compact list (below `md`) keeps its current behaviour, adds the avatar, and uses `onSelectionChange`.
  `Pagination` gains optional `pageSizeOptions?: readonly number[]` and `onPageSize?: (size: number) => void`, rendering a native select labelled "Rows per page".

- [ ] **Step 1: Add the table dependency**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm install @tanstack/react-table@8.21.3 --save-exact -w @acme/web`
Expected: `apps/web/package.json` lists `"@tanstack/react-table": "8.21.3"`.

- [ ] **Step 2: Write the failing tests**

`employee-table.test.tsx` (stub `REFERENCE_ROUTES`; keep the existing inactive-badge, detail-link and compact-list tests, switched to the new props):

```tsx
it('shows the avatar, job title, level badge, country name and pay in local currency and USD', async () => {
  renderTable();
  const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr')!;
  expect(within(row).getByText('AR')).toBeDefined();
  expect(within(row).getByText('Software Engineer')).toBeDefined();
  expect(within(row).getByText('L3')).toBeDefined();
  expect(await within(row).findByText('India')).toBeDefined();
  expect(within(row).getByText('₹50,00,000.00')).toBeDefined();
  expect(within(row).getByText('$59,900.00')).toBeDefined();
});
it('leaves out the USD figure for someone paid in USD', () => { /* a USD item shows its amount once */ });
it('sorts by every column from its header and marks the active one', () => {
  renderTable({ sortBy: 'level', sortOrder: 'desc' });
  for (const [label, key] of [['Name', 'name'], ['Job title', 'jobTitle'], ['Department', 'department'], ['Level', 'level'], ['Country', 'country'], ['Hired', 'hireDate'], ['Salary', 'salary']] as const) {
    fireEvent.click(screen.getByRole('button', { name: `Sort by ${label}` }));
    expect(onSort).toHaveBeenLastCalledWith(key);
  }
  expect(screen.getByRole('columnheader', { name: /Level/ }).getAttribute('aria-sort')).toBe('descending');
});
it('opens the drawer from a click anywhere on a row except the checkbox and the name link', () => {
  renderTable();
  const row = screen.getByRole('link', { name: 'Asha Rao' }).closest('tr')!;
  fireEvent.click(within(row).getByText('Engineering'));
  expect(onOpen).toHaveBeenCalledWith(1);
  onOpen.mockClear();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
  fireEvent.click(screen.getByRole('link', { name: 'Asha Rao' }));
  expect(onOpen).not.toHaveBeenCalled();
});
it('selects a row from its checkbox and the whole page from the header checkbox', () => {
  renderTable();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select Asha Rao' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1]));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Select all rows on this page' }));
  expect(onSelectionChange).toHaveBeenLastCalledWith(new Set([1, 2]));
});
it('hides the columns switched off', () => {
  renderTable({ columnVisibility: { ...ALL_COLUMNS_VISIBLE, department: false } });
  expect(screen.queryByRole('columnheader', { name: /Department/ })).toBeNull();
});
it('lists the hideable columns in the Columns menu and reports a change', async () => {
  render(<ColumnsMenu visibility={ALL_COLUMNS_VISIBLE} onChange={onChange} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Columns' }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitemcheckbox', { name: 'Department' }));
  expect(onChange).toHaveBeenCalledWith({ ...ALL_COLUMNS_VISIBLE, department: false });
});
```

`pagination.test.tsx`:

```tsx
it('offers 25, 50 and 100 rows per page and reports the choice', () => {
  render(<Pagination page={1} pageSize={50} total={500} onPage={vi.fn()} pageSizeOptions={[25, 50, 100]} onPageSize={onPageSize} />);
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '100' } });
  expect(onPageSize).toHaveBeenCalledWith(100);
  expect(screen.getByText('1–50 of 500')).toBeDefined();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Previous page' }).disabled).toBe(true);
});
```

- [ ] **Step 3: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employee-table pagination`
Expected: FAIL.

- [ ] **Step 4: Implement**

Update the `EmployeeTable` call in `employees-page.tsx` to the new props (selection handler sets `allMatching` false and stores the set; `columnVisibility={ALL_COLUMNS_VISIBLE}`; `onOpen` → `router.push(detailHref(id, paramsText), { scroll: false })`, exporting `detailHref` from `employee-table.tsx`) so the app still compiles; Task 13 finishes the page.

- [ ] **Step 5: Run to verify pass; run all checks**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass (update the two existing page tests that click "Select Asha Rao" only if their assertions change; they should not).

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/package.json package-lock.json apps/web/src/features/employees apps/web/src/components/pagination.tsx apps/web/src/components/pagination.test.tsx
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): rebuild the employee table on TanStack Table with every column sortable

Adds @tanstack/react-table: headless sort, column visibility and row selection
state, replacing hand-rolled header and selection logic. Sorting and paging stay
on the server (manualSorting, manualPagination).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Employees page layout — panel, toolbar, chips, result count, columns, page size

**Files:**
- Modify: `apps/web/src/features/employees/employees-page.tsx`, `apps/web/src/features/employees/employees-page.test.tsx`
- Delete: `apps/web/src/features/employees/employee-filters.tsx` (search box moves into the page file as `SearchBox`, unchanged behaviour)

**Interfaces:**
- Consumes: `EmployeeFilterPanel` (Task 11), `EmployeeTable`, `ColumnsMenu`, `ALL_COLUMNS_VISIBLE`, `detailHref` (Task 12), `filterChips`, `hasActiveFilters`, `PAGE_SIZES`, `useEmployeeFacets`, `DEFAULT_FILTERS` (Task 10), `Chip` (Task 8), `Pagination`.
- Produces: layout = title row (h1 "Employees", Export split button, "New employee"; mobile "Select"/"Done") → at `md` a row of `EmployeeFilterPanel` (left) and the main column; main column = toolbar (search box, chips + "Clear all" button when any chip, result count, `ColumnsMenu`), selection bar (unchanged copy), table, pagination with `pageSizeOptions={PAGE_SIZES}`. Result count text: `${total} of ${statusTotal}` with `en-US` grouping when `hasActiveFilters`, otherwise `${total} employees`. "Clear all" writes `/employees` keeping only a non-default `pageSize`. Page size change → `update({ pageSize, page: 1 })`. Column visibility is component state, starting at `ALL_COLUMNS_VISIBLE`.

- [ ] **Step 1: Write the failing tests**

Stub `'GET /api/employees/facets': employeeFacets()` in `stubList`; add `push` to the `next/navigation` mock. Update the URL-reading test and add:

```tsx
it('reads repeated filters, sort, page and page size from the URL', async () => {
  search = 'country=IN&country=DE&level=3&sortBy=level&sortOrder=desc&page=2&pageSize=100';
  const { calls } = stubList(300);
  renderWithQuery(<EmployeesPage today="2026-10-19" />);
  await screen.findByRole('link', { name: 'Asha Rao' });
  const params = calls.find((c) => c.url.pathname === '/api/employees')!.url.searchParams;
  expect(params.getAll('country')).toEqual(['IN', 'DE']);
  expect([params.get('sortBy'), params.get('limit'), params.get('offset')]).toEqual(['level', '100', '100']);
});
it('shows the selected filters as chips and removes one', async () => {
  search = 'country=IN&country=DE';
  stubList(); renderWithQuery(<EmployeesPage today="2026-10-19" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Remove filter India' }));
  expect(replace).toHaveBeenCalledWith('/employees?country=DE', { scroll: false });
});
it('clears every filter and the search at once', async () => {
  search = 'search=ann&country=IN&level=3';
  stubList(); renderWithQuery(<EmployeesPage today="2026-10-19" />);
  fireEvent.click(await screen.findByRole('button', { name: 'Clear all' }));
  expect(replace).toHaveBeenCalledWith('/employees', { scroll: false });
});
it('says how many employees match out of everyone in the chosen status', async () => {
  search = 'country=IN';
  stubList(2914); renderWithQuery(<EmployeesPage today="2026-10-19" />);
  expect(await screen.findByText('2,914 of 9,577')).toBeDefined();
});
it('opens the drawer with the list query when a row is clicked', async () => {
  search = 'country=IN';
  stubList(); renderWithQuery(<EmployeesPage today="2026-10-19" />);
  const row = (await screen.findByRole('link', { name: 'Ravi Menon' })).closest('tr')!;
  fireEvent.click(within(row).getByText('Engineering'));
  expect(push).toHaveBeenCalledWith('/employees/2?country=IN', { scroll: false });
});
it('changes the rows per page and returns to the first page', async () => {
  search = 'page=3';
  stubList(300); renderWithQuery(<EmployeesPage today="2026-10-19" />);
  fireEvent.change(await screen.findByLabelText('Rows per page'), { target: { value: '100' } });
  expect(replace).toHaveBeenCalledWith('/employees?pageSize=100', { scroll: false });
});
```

Update `writes a changed filter to the URL…` to tick the "Inactive" checkbox in the panel (expect `/employees?status=all`). Keep the export, empty-state and bulk tests; the export test asserts `url.searchParams.getAll('country')`.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employees-page`
Expected: FAIL.

- [ ] **Step 3: Implement; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- employees-page`
Expected: PASS.

- [ ] **Step 4: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add -A apps/web/src/features/employees
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): lay out the employees page with the filter panel, chips and result count" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Drawer header, summary strip with peer context, tabs and history list

**Files:**
- Create: `apps/web/src/features/employees/employee-header.tsx`, `salary-summary.tsx`, `salary-history-list.tsx`, `peer-copy.ts`, `peer-copy.test.ts`
- Modify: `apps/web/src/features/employees/employee-detail.tsx`, `employee-detail.test.tsx`, `use-employee.ts`, `apps/web/src/lib/money.ts`, `apps/web/src/lib/money.test.ts`, `apps/web/src/test/fixtures.ts`

**Interfaces:**
- Consumes: `GET /api/employees/:id/peer-context` and `peerContextSchema` (Task 5); `changeBp` on history rows (Task 6); `Avatar`, `CountryFlag`, `LevelBadge`, `StatTile` (Task 8); `Tabs` and non-modal `DropdownMenu` (Task 7).
- Produces:
  - `usePeerContext(id: number)` — key `['employees', 'peer-context', id]`; the detail cache writer (`useDetailCache`) also invalidates this key.
  - `formatChangeBp(bp: number): string` — `'+11.11%'`, `'-2.5%'`, `'0%'`. `formatSignedMoney(amountMinor: number, currencyCode: string, options?: { fraction?: boolean }): string` — `'+₹5,00,000.00'`, `'-$1,000.00'`, `'₹0.00'`.
  - `peer-copy.ts`: `peerGroupLabel(peer: PeerContext, countryName: string): string` (`'India L3'`); `outlierSentence(peer, countryName): string | null` (`'Above the usual range for India L3'` / `'Below the usual range for India L3'` / `null`); `tooFewPeersSentence(peer, countryName): string` (`'Too few India L3 peers to show a typical range'`); `comparisonSentence(next: PeerContext, countryName: string, current: PeerContext | undefined): string` — too few → `tooFewPeersSentence`; outlier → `outlierSentence`; inside → `'Still inside the typical range for India L3'` when `current` is the same group and its position was inside, else `'Inside the typical range for India L3'`; above/below → `'Above the typical range for India L3'` / `'Below the typical range for India L3'`.
  - `EmployeeHeader({ employee })` — avatar, name (h2) with Inactive badge, line `jobTitle · departmentName · <LevelBadge> · <CountryFlag name>`, a "More actions" (⋯) menu with `Deactivate…` (opens the existing confirm dialog) or `Reactivate`.
  - `SalarySummary({ employee })` — `StatTile` "Current salary" (local amount; hint `$X · since <date>`, USD part omitted for USD) and `StatTile` `Typical for India L3` (value `₹40,00,000 – ₹52,00,000` without fractions; hint `median ₹45,00,000 · 214 people`) or the too-few sentence; the outlier sentence below in `warning` with an icon.
  - `SalaryHistoryList({ employee })` — the existing list restyled: reason badge, amount, `formatChangeBp(changeBp)` (positive/negative colour, nothing when `null`), level · country name, a `Bulk revision` tag when `batchId` is set, date.
  - `EmployeeDetailView` renders header, summary, then `Tabs` with values `change` / `details` / `history`, labels `Change salary`, `Details`, `History (n)`; default `change` when active, `details` when inactive. The Change salary tab holds `SalaryChangeForm` (Task 15 restyles it).
- Produces (fixtures): `peerContext(overrides?)` — IN, level 3 `L3`, INR, headcount 214, typical `{ p25: 400_000_000, median: 450_000_000, p75: 520_000_000 }`, position `{ typical: 'inside', outlier: null }`.

- [ ] **Step 1: Write the failing tests**

```ts
// money.test.ts
it('formats a percentage change with its sign', () => {
  expect([formatChangeBp(1111), formatChangeBp(-250), formatChangeBp(0)]).toEqual(['+11.11%', '-2.5%', '0%']);
});
it('formats a money change with its sign', () => {
  expect(formatSignedMoney(50_000_000, 'INR')).toBe('+₹5,00,000.00');
  expect(formatSignedMoney(-100_000, 'USD')).toBe('-$1,000.00');
});

// peer-copy.test.ts
it('says in words when pay is outside the usual range', () => {
  expect(outlierSentence(peerContext({ position: { typical: 'above', outlier: 'above' } }), 'India')).toBe('Above the usual range for India L3');
  expect(outlierSentence(peerContext(), 'India')).toBeNull();
});
it('says "still inside" only when the current pay was inside the same group', () => {
  expect(comparisonSentence(peerContext(), 'India', peerContext())).toBe('Still inside the typical range for India L3');
  expect(comparisonSentence(peerContext(), 'India', peerContext({ position: { typical: 'below', outlier: null } }))).toBe('Inside the typical range for India L3');
  expect(comparisonSentence(peerContext({ position: { typical: 'above', outlier: null } }), 'India', undefined)).toBe('Above the typical range for India L3');
});
it('says there are too few peers instead of naming a range', () => {
  expect(comparisonSentence(peerContext({ headcount: 4, typical: null, position: null }), 'India', undefined)).toBe('Too few India L3 peers to show a typical range');
});
```

`employee-detail.test.tsx` (stub `GET /api/employees/1/peer-context` → `peerContext()`):

```tsx
it('shows the name, job title, department, level and country in the header', async () => { /* 'Asha Rao', 'Software Engineer', 'Engineering', 'L3', 'India' */ });
it('shows the current salary with its USD equivalent and the date it took effect', async () => {
  const tile = await screen.findByRole('group', { name: 'Current salary' });
  expect(within(tile).getByText('₹50,00,000.00')).toBeDefined();
  expect(within(tile).getByText('$59,900.00 · since 1 Apr 2025')).toBeDefined();
});
it('shows the typical range and median of same-country same-level peers in local currency', async () => {
  const tile = await screen.findByRole('group', { name: 'Typical for India L3' });
  expect(within(tile).getByText('₹40,00,000 – ₹52,00,000')).toBeDefined();
  expect(within(tile).getByText('median ₹45,00,000 · 214 people')).toBeDefined();
});
it('says when the salary is above the usual range for the peer group', async () => { /* position outlier above → 'Above the usual range for India L3' */ });
it('says there are too few peers when the group is under ten', async () => { /* typical null → 'Too few India L3 peers to show a typical range' */ });
it('opens on Change salary for an active employee and on Details for an inactive one', async () => { /* aria-selected */ });
it('labels the history tab with the number of changes and shows the % change on each row', async () => {
  fireEvent.mouseDown(await screen.findByRole('tab', { name: 'History (2)' }));
  expect(screen.getByText('+11.11%')).toBeDefined();
});
it('marks a change that came from a bulk revision', async () => { /* batchId 7 → 'Bulk revision' */ });
it('deactivates from the actions menu after confirmation without sending a body', async () => {
  fireEvent.keyDown(await screen.findByRole('button', { name: 'More actions' }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Deactivate…' }));
  // confirm in dialog → DELETE /api/employees/1 with no body and no content type
});
```

Keep the existing not-found, inline job-title edit (after switching to the Details tab), reactivate (now from the menu) and inactive-employee tests; the inactive test first switches to the "Change salary" tab, since inactive tab panels are not mounted.

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- money peer-copy employee-detail`
Expected: FAIL.

- [ ] **Step 3: Implement; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- money peer-copy employee-detail`
Expected: PASS.

- [ ] **Step 4: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/employees apps/web/src/lib/money.ts apps/web/src/lib/money.test.ts apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add the drawer header, peer context summary, tabs and history % change" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Salary change form — reason control, pre-fill, reset and named submit

**Files:**
- Modify: `apps/web/src/features/employees/salary-change-form.tsx`, `apps/web/src/features/employees/salary-change-form.test.tsx`

**Interfaces:**
- Consumes: `SegmentedControl` (Task 7).
- Produces: `SalaryChangeForm({ employee, today, onSaved })` (props unchanged). Reason is a `SegmentedControl` labelled "Reason" with options Raise / Promotion / Relocation / Correction. Amount ("New annual salary") is pre-filled with `toInputAmount(current)` for Raise, Promotion and Correction and after every reason change; Relocation starts empty until a country is chosen, then holds the server-converted amount with the existing FX note. A `Reset` button restores reason Raise, the pre-filled amount, today's date and empty pickers. Submit label: `Record raise` / `Record promotion` / `Record relocation` / `Record correction`. Validation and request bodies are unchanged.

- [ ] **Step 1: Write the failing tests**

Change the helpers: `chooseReason(label)` clicks `screen.getByRole('radio', { name: label })`; `save(label = 'Record raise')`. Update existing tests to these helpers (the "missing amount" test first clears the field). Add:

```tsx
it('pre-fills the amount with the current salary', () => {
  stubApi(REFERENCE_ROUTES); renderForm();
  expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('5000000.00');
});
it('does not accept the pre-filled current amount as a raise', async () => {
  const { calls } = stubApi(REFERENCE_ROUTES); renderForm();
  save();
  expect(await screen.findByText('A raise must be higher than the current salary')).toBeDefined();
  expect(calls.some((c) => c.method === 'POST' && c.url.pathname.endsWith('/salary-changes'))).toBe(false);
});
it('names the action on the submit button for each reason', () => {
  stubApi(REFERENCE_ROUTES); renderForm();
  for (const [reason, label] of [['Promotion', 'Record promotion'], ['Relocation', 'Record relocation'], ['Correction', 'Record correction'], ['Raise', 'Record raise']]) {
    chooseReason(reason);
    expect(screen.getByRole('button', { name: label })).toBeDefined();
  }
});
it('resets every field to its starting values', async () => {
  stubApi(REFERENCE_ROUTES); renderForm();
  chooseReason('Promotion'); typeAmount('6000000');
  fireEvent.change(screen.getByLabelText('Effective date'), { target: { value: '2026-01-01' } });
  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
  expect(screen.getByRole('radio', { name: 'Raise' }).getAttribute('aria-checked')).toBe('true');
  expect(screen.getByLabelText<HTMLInputElement>('New annual salary').value).toBe('5000000.00');
  expect(screen.getByLabelText<HTMLInputElement>('Effective date').value).toBe('2026-10-19');
});
```

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- salary-change-form`
Expected: FAIL.

- [ ] **Step 3: Implement; run to verify pass**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- salary-change-form employee-detail`
Expected: PASS.

- [ ] **Step 4: Run all checks and commit**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check` — all pass.

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/features/employees/salary-change-form.tsx apps/web/src/features/employees/salary-change-form.test.tsx
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): pre-fill the salary change form and name its action" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Quick-% buttons and the live comparison box

**Files:**
- Create: `apps/web/src/hooks/use-debounced-value.ts`, `apps/web/src/features/employees/salary-comparison.tsx`
- Modify: `apps/web/src/features/employees/salary-change-form.tsx`, `salary-change-form.test.tsx`, `use-employee.ts`, `apps/web/src/test/fixtures.ts`

**Interfaces:**
- Consumes: `POST /api/employees/:id/salary-changes/preview`, `salaryChangePreviewSchema`, `SalaryChangePreviewBody` (Task 6); `usePeerContext`, `comparisonSentence`, `formatChangeBp`, `formatSignedMoney` (Task 14); `parsePercentageToBp`, `parseMajorToMinor`, `toInputAmount`, `formatMoney`.
- Produces:
  - `useDebouncedValue<T>(value: T, delayMs: number): T`.
  - `fetchSalaryPreview(id: number, body: SalaryChangePreviewBody): Promise<SalaryChangePreview>` and `useSalaryPreview(id: number, body: SalaryChangePreviewBody | null)` (key `['employees', 'salary-preview', id, body]`, disabled when `body` is null, `keepPreviousData`).
  - Quick-% row under the amount (`role="group"`, `aria-label="Quick percentages"`), as toggle buttons with `aria-pressed`: Raise `+3%`, `+5%`, `+10%`, `+15%`; Promotion `+10%`, `+15%`, `+20%`; both end with `Custom %`. Relocation and Correction show no row. A quick button calls `fetchSalaryPreview` with `{ reason, percentageBp, newLevelId? }` and writes `toInputAmount(proposed)` into the amount; only the latest click's response is applied (ticket counter, as the relocation conversion does). `Custom %` reveals an input labelled "Custom percentage" and an `Apply` button doing the same with `parsePercentageToBp`; an invalid % shows "Enter a percentage from 0.01 to 100". Typing in the amount field presses `Custom %` and unpresses the others.
  - `SalaryComparison({ employee, preview, currentPeer, countryName })` — `<section aria-label="Comparison">` with rows `Current`, `New`, `Change`. The Change value is one text node: `` `${formatSignedMoney(proposed − current, currency)} (${formatChangeBp(changeBp)})` `` when the currencies match (integer subtraction in one currency), else `formatChangeBp(changeBp)` alone; under it `` `${formatSignedMoney(changeBaseMinor, 'USD')} a year` ``; then `comparisonSentence(preview.peer, targetCountryName, currentPeer)`. With no valid amount it shows `Current` and the text "Enter a new amount to compare".
  - The form posts the comparison preview `{ reason, amountMinor, newLevelId?, newCountryCode? }` debounced by 300 ms whenever the amount parses.
- Produces (fixtures): `salaryPreview(overrides?)` — current INR 500,000,000 / $59,900.00, proposed INR 550,000,000 / $65,890.00, `changeBaseMinor: 599_000`, `changeBp: 1000`, `peer: peerContext()`.

- [ ] **Step 1: Write the failing tests**

`renderForm` now stubs `'GET /api/employees/1/peer-context': peerContext()` and a default `'POST /api/employees/1/salary-changes/preview': salaryPreview()`.

```tsx
it('offers quick percentages for a raise and a promotion only', () => {
  expect(quickLabels()).toEqual(['+3%', '+5%', '+10%', '+15%', 'Custom %']);
  chooseReason('Promotion'); expect(quickLabels()).toEqual(['+10%', '+15%', '+20%', 'Custom %']);
  chooseReason('Relocation'); expect(quickLabels()).toEqual([]);
  chooseReason('Correction'); expect(quickLabels()).toEqual([]);
});
it('fills the amount with the figure the server computes for a quick percentage', async () => {
  const { calls } = renderFormWith({ preview: salaryPreview({ proposed: { amountMinor: 525_000_000, currencyCode: 'INR', amountBaseMinor: 6_289_500 } }) });
  fireEvent.click(screen.getByRole('button', { name: '+5%' }));
  await waitFor(() => { expect(amountValue()).toBe('5250000.00'); });
  expect(calls.find((c) => c.url.pathname.endsWith('/preview'))?.body).toEqual({ reason: 'raise', percentageBp: 500 });
  expect(screen.getByRole('button', { name: '+5%' }).getAttribute('aria-pressed')).toBe('true');
});
it('keeps the figure for the last quick percentage clicked when answers arrive out of order', async () => {
  // preview handler resolves percentageBp 300 after 50 ms with 515_000_000 and 1000 immediately with 550_000_000
  fireEvent.click(screen.getByRole('button', { name: '+3%' }));
  fireEvent.click(screen.getByRole('button', { name: '+10%' }));
  await new Promise((r) => setTimeout(r, 80));
  expect(amountValue()).toBe('5500000.00');
});
it('computes a custom percentage on the server', async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Custom %' }));
  fireEvent.change(screen.getByLabelText('Custom percentage'), { target: { value: '7.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
  await waitFor(() => { expect(previewBodies()).toContainEqual({ reason: 'raise', percentageBp: 750 }); });
});
it('presses Custom when an amount is typed by hand', () => {
  typeAmount('5600000');
  expect(screen.getByRole('button', { name: 'Custom %' }).getAttribute('aria-pressed')).toBe('true');
});
it('compares the current and new salary with the change, its percentage and its yearly USD cost', async () => {
  typeAmount('5500000');
  const box = screen.getByRole('region', { name: 'Comparison' });
  await waitFor(() => { expect(within(box).getByText('+₹5,00,000.00 (+10%)')).toBeDefined(); });
  expect(within(box).getByText('₹50,00,000.00')).toBeDefined();
  expect(within(box).getByText('₹55,00,000.00')).toBeDefined();
  expect(within(box).getByText('+$5,990.00 a year')).toBeDefined();
  expect(within(box).getByText('Still inside the typical range for India L3')).toBeDefined();
  expect(previewBodies()).toContainEqual({ reason: 'raise', amountMinor: 550_000_000 });
});
it('compares a relocation by percentage and USD only, against the new country\'s peers', async () => {
  // preview: proposed EUR 6_000_000, changeBp 818, peer DE headcount 0
  // → box shows '+8.18%' and no local "Change" amount, and 'Too few Germany L3 peers to show a typical range'
});
```

(`quickLabels()` returns the names of buttons inside the group labelled "Quick percentages"; `amountValue()` reads the amount input; `previewBodies()` maps the recorded preview calls' bodies.)

- [ ] **Step 2: Run to verify failure**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- salary-change-form`
Expected: FAIL.

- [ ] **Step 3: Implement; run to verify pass**

The pre-filled amount parses, so the form posts a comparison preview as soon as it renders: add the `peer-context` and `salary-changes/preview` stubs to `renderDetail` in `employee-detail.test.tsx` too.

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test -w @acme/web -- salary-change-form employee-detail`
Expected: PASS.

- [ ] **Step 4: Run the whole suite and every check**

Run: `export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && npm test && npm run lint && npm run typecheck && npm run format:check`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git add apps/web/src/hooks/use-debounced-value.ts apps/web/src/features/employees apps/web/src/test/fixtures.ts
export PATH="$HOME/.nvm/versions/node/v24.22.0/bin:$PATH" && git commit -m "feat(web): add quick percentages and a live comparison to the salary change form" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
