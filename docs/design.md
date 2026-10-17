# Design and UX Guidelines

This document is the single source of truth for how the application looks and behaves. Every screen, in every implementation session, follows this document rather than improvising — that's its purpose: so work done in one session doesn't visually or behaviorally contradict work done in another. `docs/architecture.md` covers data flow and routing structure; this document covers everything the HR Manager actually sees and clicks.

## 1. Principles

- **Familiar, not foreign.** The HR Manager comes from Excel. Lists read like a spreadsheet — real columns, aligned numbers, dense rows — so nothing has to be relearned to find information.
- **Better than Excel, not a copy of it.** Search, filters, sort, salary history, and the insights views are real application features, not a spreadsheet pretending to be a web page.
- **Weight follows frequency.** Insights is used weekly and gets the most polish. The employee list is a reference/lookup tool. Salary revisions are rare but happen to many people at once — so that flow is optimized for batches, not individual clicks.
- **Deliberate, not default.** Every visual choice below is a decision, not a library default left untouched — see §3.

## 2. Visual language

**Color** — light mode only, neutral-first, one accent:

| Token | Value | Use |
|---|---|---|
| `background` | `#FFFFFF` | Page background |
| `surface` | `#F7F7F8` | Panels, table header background, alternating rows if needed |
| `border` | `#E5E7EB` | Table/row/input borders |
| `text-primary` | `#111827` | Body text, headings |
| `text-secondary` | `#6B7280` | Labels, metadata, timestamps |
| `accent` | `#047857` (emerald-700) | Primary buttons, active nav/filter state, links, one chart series — never decorative |
| `positive` | `#059669` | Salary increases, upward trend |
| `negative` | `#DC2626` | Salary decreases, errors |
| `warning` | `#B45309` | Outlier flags |
| `inactive` | `#9CA3AF` | Deactivated-employee state |

No gradients. No dark mode in v1 (an internal data tool used on a work laptop; not worth the design and QA surface it adds — revisit only if asked).

**Typography** — Inter (or system-ui fallback) throughout. All numeric/monetary columns use `font-variant-numeric: tabular-nums` so digits align vertically like a spreadsheet column — this is a direct, concrete link to the "feels like Excel" goal, not a generic choice.

**Shape** — small, consistent radius (`4px` on inputs/buttons/badges, `6px` max on panels/cards). Tables have square corners. This reads as a crisp, enterprise tool rather than the soft, bubbly `rounded-xl`-everywhere look common in generated UIs.

**Spacing** — a single 4px-based scale (4/8/12/16/24/32). Dense by default: this is a data tool, not a marketing page.

## 3. Explicitly avoid

These are the recognizable tells of an AI-generated UI. None of them appear in this app, and each has a reason tied to this app specifically, not just "because it's common":

| Pattern | Why it's excluded here |
|---|---|
| Fixed icon-only left sidebar + avatar pinned bottom-left | This app has two destinations (Employees, Insights); a sidebar shell is unearned chrome. A simple top nav (§5) covers it. |
| Bento-grid dashboards | Insights needs real labeled charts for distribution/payroll data, not decorative boxes of varying size. |
| Giant centered Cmd+K search bar | Search belongs inline in the employee list's filter row, sized for what it actually searches — not promoted to a global, app-wide feature it isn't. |
| Floating chat bubble / chat sidebar | There is no conversational feature. Nothing to chat with. |
| Card-stack lists instead of real tables | Directly conflicts with "feels like Excel." Lists are `<table>` markup (§6/§7). |
| Dark glassmorphism default | Light, neutral, flat (§2). |
| Skeleton-pulse loading on every surface | Loading state is scoped to the region actually fetching (a small inline spinner or disabled state on that table/panel), not a full-page skeleton. |
| Stat cards with tiny decorative sparklines | Insights uses real, labeled charts (histogram/box-style for distribution, bar charts for payroll) sized to be read, not a number with a meaningless trend line. |
| Chips/badges sprinkled for visual interest | Badges are reserved for genuine categorical state (active/inactive, outlier flag). Hierarchy comes from typography and whitespace (§2), not color blocks. |

## 4. Layout

A simple top bar, present at every breakpoint: app name on the left, two nav links (Insights, Employees) in the center-left, user menu (shows logged-in email, logout) on the right. Below it, page content fills the viewport width with consistent side padding (16px mobile, 32px desktop). No sidebar.

## 5. Navigation and page structure

- **`/insights`** is the default route after login (it's the weekly-use surface).
- **`/employees`** is the list: inline filter row, table, pagination, export button, bulk-revision action bar (appears only when rows are selected).
- **Employee detail** opens as a slide-over drawer from the right, over the list — not a full page navigation. Closing it returns to the list exactly as it was (scroll position, filters, pagination page all preserved). Direct navigation or refresh at the detail URL still renders a full page as a fallback.

## 6. Core components

- **Tables**: real `<table>` markup, sticky header row, sortable column headers (click to sort, arrow indicates direction), checkbox column for multi-select. Numeric columns right-aligned with tabular numerals.
- **Filters**: inline controls directly above the table (search input, country/department/level/status dropdowns) — not a modal, not a drawer. Filter state lives in the URL as query params, so a bookmarked or back-navigated view is exactly reproducible.
- **Drawers**: used for employee detail (view + edit + salary history timeline) and for multi-field forms (new employee). Reserved for things that genuinely need more space than inline editing.
- **Inline editing**: single-field changes (e.g. job title) edit in place, no drawer/modal round-trip.
- **Bulk-revision flow**: select rows via checkboxes or "select all N matching this filter" → action bar appears with "Apply % increase" → entering a percentage renders an inline preview table (employee, current amount, computed new amount as an editable cell, so any row can be hand-overridden) → one confirm commits the batch. See `docs/architecture.md` §7 for the backend contract.
- **Charts** (Insights page): real labeled axes, legends where more than one series. Distribution → histogram or box-plot style. Payroll totals → bar chart. Recent changes → a plain list/table, not a chart.
- **Loading states**: an inline spinner or a disabled/dimmed state scoped to the specific panel or table that's fetching. Never a full-page skeleton.
- **Errors**: a toast for action failures (e.g. a failed save); inline field-level messages for validation errors in forms.
- **Empty states**: plain text + the relevant primary action (e.g. "No employees match these filters" with a "Clear filters" link), no illustration.

## 7. Content density

Tables default to compact row height — this is a data tool for someone used to spreadsheets, not a consumer app optimizing for whitespace. Favor showing more rows over more padding.

## 8. Responsive rules

This is one implementation, not a separate mobile build. Breakpoint: `md` (768px) is the line between the desktop table layout and the mobile layout.

- **≥768px (tablet/desktop)**: full table as described in §6, inline filter row, drawer slides in from the right at a fixed width (not full-screen).
- **<768px (mobile)**: the employee list renders as a single-column list of compact rows (name, department/level, current salary — the fields that matter most at a glance), because a multi-column table physically cannot work at that width; this is a deliberate width-driven exception, not a default "cards instead of tables" choice (§3 still applies on desktop, where a table fits). Tapping a row opens the detail drawer as a full-screen sheet instead of a fixed-width side panel. Filters collapse behind a "Filters" button that opens a bottom sheet instead of an inline row. The bulk-revision preview table becomes a vertically stacked list of editable rows. Insights charts stack in a single column, each full-width. The top nav's two links remain visible (there are only two; no hamburger menu needed).
- Touch targets are at least 44px tall on any interactive element at the mobile breakpoint.

## 9. Accessibility baseline

- Color is never the only signal (e.g. outlier flags pair the warning color with a label/icon, not color alone).
- All interactive elements are keyboard-reachable: table sort headers, filter controls, drawer close, bulk-action bar.
- Text and background combinations meet WCAG AA contrast (verify `text-secondary` on `surface` specifically, since it's the tightest pair in the palette).
- Focus states are visible (a 2px outline in `accent`), never suppressed.

## 10. Out of scope for this document

Pixel-level spacing for every individual screen, a full component-prop API, and dark mode are intentionally not specified here. The goal is consistency on the things that would otherwise visibly clash between sessions — palette, type, core patterns, responsive behavior — not a complete design spec for every screen.
