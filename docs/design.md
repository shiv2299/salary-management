# Design and UX Guidelines

This document is the single source of truth for how the application looks and behaves. Every screen, in every implementation session, follows this document rather than improvising — that's its purpose: so work done in one session doesn't visually or behaviorally contradict work done in another. `docs/architecture.md` covers data flow and routing structure; this document covers everything the HR Manager actually sees and clicks.

## 1. Principles

- **Familiar, not foreign.** The HR Manager comes from Excel. Lists read like a spreadsheet — real columns, aligned numbers, dense rows — so nothing has to be relearned to find information.
- **Better than Excel, not a copy of it.** Search, filters, sort, salary history, and the insights views are real application features, not a spreadsheet pretending to be a web page.
- **Weight follows frequency.** Insights is used weekly and gets the most polish. The employee list is a reference/lookup tool. Salary revisions are rare but happen to many people at once — so that flow is optimized for batches, not individual clicks.
- **Deliberate, not default.** Every visual choice below is a decision, not a library default left untouched.

## 2. Visual language

**Color** — light mode only, neutral-first, one accent:

| Token | Value | Use |
|---|---|---|
| `background` | `#FFFFFF` | Page background |
| `surface` | `#F7F7F8` | Panels, table header background, alternating rows if needed |
| `border` | `#E5E7EB` | Table/row/input borders |
| `text-primary` | `#111827` | Body text, headings |
| `text-secondary` | `#6B7280` | Labels, metadata, timestamps |
| `accent` | `#1D4ED8` (blue-700) | Primary buttons, active nav/filter state, links, focus outline, the primary chart series — never decorative |
| `positive` | `#047857` (emerald-700) | Salary increases, upward trend |
| `negative` | `#B91C1C` (red-700) | Salary decreases, errors |
| `warning` | `#B45309` (amber-700) | Outlier flags |
| `inactive` | `#6B7280` (gray-500) | Text of deactivated-employee rows, always paired with an "Inactive" badge |

The accent is blue, not green, so that an action or a chart series is never mistaken for "pay went up". Every foreground token meets WCAG AA (≥ 4.5:1) as text on both `background` and `surface`. Measured on `surface`, the tightest background: accent 6.3, positive 5.1, negative 6.0, warning 4.7, inactive / text-secondary 4.5.

No gradients. No dark mode in v1 (an internal data tool used on a work laptop; not worth the design and QA surface it adds — revisit only if asked).

**Typography** — Inter (or system-ui fallback) throughout. All numeric/monetary columns use `font-variant-numeric: tabular-nums` so digits align vertically like a spreadsheet column — this is a direct, concrete link to the "feels like Excel" goal, not a generic choice.

**Shape** — small, consistent radius (`4px` on inputs/buttons/badges, `6px` max on panels/cards). Tables have square corners. This reads as a crisp, enterprise tool rather than the soft, bubbly `rounded-xl`-everywhere look common in generated UIs.

**Spacing** — a single 4px-based scale (4/8/12/16/24/32). Dense by default: this is a data tool, not a marketing page.

## 3. Layout

A simple top bar, present at every breakpoint: app name on the left, two nav links (Insights, Employees) in the center-left, user menu (shows logged-in email, logout) on the right. Below it, page content fills the viewport width with consistent side padding (16px mobile, 32px desktop). No sidebar.

## 4. Navigation and page structure

- **`/insights`** is the default route after login (it's the weekly-use surface).
- **`/employees`** is the list: inline filter row, table, pagination, export menu, bulk-revision action bar (appears only when rows are selected). Shows active employees by default; inactive rows, when the status filter includes them, use the `inactive` text color plus an "Inactive" badge.
- **Employee detail** opens as a slide-over drawer from the right, over the list — not a full page navigation. Closing it returns to the list exactly as it was (scroll position, filters, pagination page all preserved). Direct navigation or refresh at the detail URL still renders a full page as a fallback.

## 5. Core components

- **Tables**: real `<table>` markup, sticky header row, sortable column headers (click to sort, arrow indicates direction), checkbox column for multi-select. Numeric columns right-aligned with tabular numerals.
- **Filters**: inline controls directly above the table (search input, country/department/level/status dropdowns) — not a modal, not a drawer. Filter state lives in the URL as query params, so a bookmarked or back-navigated view is exactly reproducible.
- **Drawers**: used for employee detail (view + edit + salary history timeline) and for multi-field forms (new employee). Reserved for things that genuinely need more space than inline editing.
- **Inline editing**: single-field changes (e.g. job title) edit in place, no drawer/modal round-trip.
- **Bulk-revision flow**: select rows via checkboxes or "select all N matching this filter" → action bar appears with "Apply % increase" → entering a percentage renders an inline preview table (employee, current amount, computed new amount as an editable cell, so any row can be hand-overridden) → one confirm commits the batch. The preview is paginated with the same page size as the list; overrides persist across pages, overridden cells are visibly marked, and a summary line above the table reads "N employees · M overridden · total increase X USD". Confirm states the count ("Apply to 47 employees"). If the server rejects with a conflict because someone's salary changed since the preview, a toast explains this and the preview reloads, keeping overrides for unaffected rows. See `docs/architecture.md` §7 for the backend contract.
- **Salary change form** (in the detail drawer): the reason is chosen first, and the fields follow from it. Raise: amount only. Promotion: new level (only higher levels listed) + amount. Relocation: new country + amount, pre-filled with the converted current salary and labeled "Converted at FX rate as of <date> — adjust if needed". Correction: amount, optional level. The effective date defaults to today and cannot be set in the future.
- **Export**: a split button: "Export current result" (the main action) plus "Export all employees" in its menu. It's a plain download link — no modal.
- **Charts** (Insights page): real labeled axes, legends where more than one series. Distribution → histogram or box-plot style. Payroll totals → bar chart. Salary changes (FR-10) → a plain paginated list/table, not a chart, with a two-option segmented control ("3 years" / "5 years", default 3) in the panel header. Bulk revisions render as one row ("47 people · +7% · Engineering L3 India") that expands to show the individual employees.
- **Loading states**: skeleton placeholders shaped like the content they stand in for (table-row skeletons for the employee list, axis-shaped skeletons for charts), scoped to the specific panel or table that's fetching rather than a full-page takeover. This is the standard pattern for data-heavy interfaces; matching the real content's shape (not a generic identical block everywhere) is what keeps it from feeling like an untouched library default.
- **Errors**: a toast for action failures (e.g. a failed save); inline field-level messages for validation errors in forms.
- **Empty states**: plain text + the relevant primary action (e.g. "No employees match these filters" with a "Clear filters" link), no illustration.

## 6. Content density

Tables default to compact row height — this is a data tool for someone used to spreadsheets, not a consumer app optimizing for whitespace. Favor showing more rows over more padding.

## 7. Responsive rules

This is one implementation, not a separate mobile build. Breakpoint: `md` (768px) is the line between the desktop table layout and the mobile layout.

- **≥768px (tablet/desktop)**: full table as described in §5, inline filter row, drawer slides in from the right at a fixed width (not full-screen).
- **<768px (mobile)**: the employee list renders as a single-column list of compact rows (name, department/level, current salary — the fields that matter most at a glance), because a multi-column table physically cannot work at that width; this is a deliberate width-driven exception, not a default choice, since a real table is still used on desktop where it fits. Tapping a row opens the detail drawer as a full-screen sheet instead of a fixed-width side panel. Filters collapse behind a "Filters" button that opens a bottom sheet instead of an inline row. Rows are selected for a bulk revision by tapping a "Select" button above the list, which shows a checkbox on every row (tap a row to toggle it) and a "Select all N matching" option; tapping "Done" hides the checkboxes. The bulk-revision preview table becomes a vertically stacked list of editable rows. Insights charts stack in a single column, each full-width. The top nav's two links remain visible (there are only two; no hamburger menu needed).
- Touch targets are at least 44px tall on any interactive element at the mobile breakpoint.

## 8. Accessibility baseline

- Color is never the only signal (e.g. outlier flags pair the warning color with a label/icon, not color alone).
- All interactive elements are keyboard-reachable: table sort headers, filter controls, drawer close, bulk-action bar.
- Text and background combinations meet WCAG AA contrast (all palette tokens are verified in §2; `text-secondary`/`inactive` on `surface` is the tightest pair at 4.5:1, so don't put them on anything darker).
- Focus states are visible (a 2px outline in `accent`), never suppressed.

## 9. Out of scope for this document

Pixel-level spacing for every individual screen, a full component-prop API, and dark mode are intentionally not specified here. The goal is consistency on the things that would otherwise visibly clash between sessions — palette, type, core patterns, responsive behavior — not a complete design spec for every screen.
