# Design and UX Guidelines

This document is the single source of truth for how the application looks and behaves. Every screen, in every implementation session, follows this document rather than improvising — that's its purpose: so work done in one session doesn't visually or behaviorally contradict work done in another. `docs/architecture.md` covers data flow and routing structure; this document covers everything the HR Manager actually sees and clicks.

## 1. Principles

- **Familiar, not foreign.** The HR Manager comes from Excel. Lists read like a spreadsheet — real columns, aligned numbers, dense rows — so nothing has to be relearned to find information.
- **Better than Excel, not a copy of it.** Search, filters, sort, salary history, and the insights views are real application features, not a spreadsheet pretending to be a web page.
- **Weight follows frequency.** Insights is used weekly and gets the most polish. The employee list is a reference/lookup tool. Salary revisions are rare but happen to many people at once — so that flow is optimized for batches, not individual clicks.
- **Deliberate, not default.** Every visual choice below is a decision, not a library default left untouched.
- **Interpret, don't just display.** A number or a chart the HR Manager has to decode is only half finished. Say what it means in words ("Above the usual range for India L3"), show the evidence beside it, and where it applies offer a way to act on it. Statistical vocabulary (p25, IQR, percentile) is at most a secondary hint, never the headline.

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
| `canvas` | `#F9FAFB` | Page background behind the white cards on Insights |
| `accent-tint` | `#EFF6FF` | Fill of selected chips and ticked filter state |
| `accent-tint-border` | `#BFDBFE` | Border of selected chips and ticked filter state |
| `series-secondary` | `#93C5FD` | Second chart series; never the only signal, always with a legend or label |
| `series-promotion` | `#7C3AED` | Promotions on history charts; 5.3:1 on `surface`, 5.7:1 on white |
| `series-1` | `#1D4ED8` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-2` | `#EB6834` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-3` | `#1BAF7A` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-4` | `#EDA100` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-5` | `#E87BA4` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-6` | `#6250D6` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `series-7` | `#0891B2` | Categorical chart series, in this fixed order; slot 1 is `accent` |
| `brand-panel` | `#0B1F4D` | The login panel only (§5); white text on it is 15.9:1 |

Categorical series take `series-1` onward in a fixed order and keep their colour when a filter hides another series. The seven were checked for colour-blind separation between neighbours. `series-3`, `series-4` and `series-5` are under 3:1 against white, so a chart that uses them always has a legend and a "View as table" view. Charts never use `positive`/`negative` for a series, and never put two value axes on one chart.

**In code**, the blue `accent` above is the Tailwind/shadcn `primary` color (`bg-primary`, `text-primary`, `ring`). Tailwind's own `accent` class is shadcn's subtle hover background and maps to `surface`, so never use `bg-accent`/`text-accent` for the blue. The other tokens keep their names (`bg-surface`, `text-text-secondary`, `text-positive`, …).

The accent is blue, not green, so that an action or a chart series is never mistaken for "pay went up". Every foreground token meets WCAG AA (≥ 4.5:1) as text on both `background` and `surface`. Measured on `surface`, the tightest background: accent 6.3, positive 5.1, negative 6.0, warning 4.7, inactive / text-secondary 4.5.

`text-secondary` measures 4.4:1 on `accent-tint`, so text on a tint uses `text-primary` or `accent`, never `text-secondary`.

No gradients. No dark mode in v1 (an internal data tool used on a work laptop; not worth the design and QA surface it adds — revisit only if asked). The `brand-panel` navy on the login screen is the app's only dark surface, a deliberate exception and not the start of a dark theme.

**Typography** — Inter (or system-ui fallback) throughout. Tabular numbers (`font-variant-numeric: tabular-nums`) wherever a number appears, so digits align vertically like a spreadsheet column — this is a direct, concrete link to the "feels like Excel" goal, not a generic choice. Headline numbers are 22px, weight 650. Insights answer sentences are 15px, weight 600. Section labels are 11px, uppercase, in `text-secondary`.

**Shape** — small, consistent radius (`4px` on inputs/buttons/badges, `6px` max on panels/cards). Tables have square corners. This reads as a crisp, enterprise tool rather than the soft, bubbly `rounded-xl`-everywhere look common in generated UIs.

**Spacing** — a single 4px-based scale (4/8/12/16/24/32). Dense by default: this is a data tool, not a marketing page.

**People and places** — the same treatment everywhere an employee, country or level appears:

- A person gets an initials avatar.
- A country shows its flag plus the full country name; where no flag exists, the country code is shown instead.
- A level is a small outlined badge.
- Local salary is the main figure, with the USD equivalent in small grey text beside it. The USD figure is omitted when the salary is already in USD.

## 3. Layout

A simple top bar, present at every breakpoint: the app mark (a small blue square) and the name "Salary Management" on the left, two nav links (Insights, Employees) in the center-left, user menu (shows logged-in email, logout) on the right. The active nav link has a 2px `accent` underline, not a filled pill. Below it, page content fills the viewport width with consistent side padding (16px mobile, 32px desktop). No sidebar.

Insights sits on `canvas`, with white cards on top of it. Employees and the detail drawer stay on white. The Insights pages (`/insights`, `/insights/changes`) sit on `canvas`.

## 4. Navigation and page structure

- **`/insights`** is the default route after login (it's the weekly-use surface).
- **`/insights/changes`** is the full list of salary changes, reached from "See all changes →" on Insights. Its range, reason, year and page live in the URL.
- **`/employees`** is the list: a left filter panel and a main column (title row, toolbar, table, pagination), plus the bulk selection bar (appears only when rows are selected; its "Apply % increase" opens the bulk revision screen, below, and is disabled with "Pick up to 1,000 people, or select all matching." when more than 1,000 are picked by hand). Shows active employees by default; inactive rows, when the status filter includes them, use the `inactive` text color plus an "Inactive" badge.
- **`/employees/revisions/new`** is the bulk revision screen, reached from the list's selection bar. It opens as a wide slide-over from the right, over the list, the same way employee detail does: the list stays underneath with its scroll position, filters, page and selection, and closing the panel returns to it exactly as it was. Its query string carries the list's own query plus the selection (`select=all` or `ids=…`), so back and a copied link show the same screen; direct navigation or refresh at that URL renders it as a full page instead.
- **Employee detail** opens as a slide-over drawer from the right, over the list — not a full page navigation. Closing it returns to the list exactly as it was (scroll position, filters, pagination page all preserved). Direct navigation or refresh at the detail URL still renders a full page as a fallback.

## 5. Core components

- **Building blocks**: every screen is assembled from the same small set of parts in `apps/web/src/components/ui/`, and a screen does not invent its own: app mark (`app-mark.tsx`), card (`card.tsx`), chart card (`chart-card.tsx`), headline number tile (`stat-tile.tsx`), segmented control (`segmented-control.tsx`), step indicator (`step-indicator.tsx`), chip (`chip.tsx`), checkbox group with counts (`checkbox-group.tsx`), tabs (`tabs.tsx`), initials avatar (`avatar.tsx`), country flag (`country-flag.tsx`), level badge (`level-badge.tsx`), menus (`dropdown-menu.tsx`) and, in `features/employees/`, the employee table (`employee-table.tsx`) and its Columns menu (`columns-menu.tsx`). Every dropdown menu is non-modal; dialogs and sheets are modal.
- **Filter panel** (left of the list): groups Status, Country, Department, Level and Needs attention, each option a checkbox with a count. Several options in one group are OR-ed (India + Germany), and groups are AND-ed. In Status, Active and Inactive both ticked means all, and neither ticked means the default (active). Counts reflect the current search and the selections in the other groups, so each option's count is how many employees match that option under the search and the other groups' selections (not the size of the result after ticking it, when a sibling in the same group is already ticked). An unticked option highlights on hover as a white fill with a 1px inset `border` outline (white keeps the secondary count text at AA on the grey panel, and the outline shows on the white mobile sheet); a ticked option keeps its `accent-tint` fill and its count uses the primary text colour (`text-text-primary`; secondary text is below AA on the tint). The panel collapses ("Hide filters" / "Show filters") to give the table the full width, and the collapsed state is remembered per browser. Filter state lives in the URL as repeated query params, so a bookmarked or back-navigated view is exactly reproducible. Needs attention has four options: "Paid above peer range" (`outlier-above`), "Paid below peer range" (`outlier-below`), "No raise in over 2 years" (`no-raise-2y`) and "Paid less than new hires" (`compression`). Each option counts active employees only. It is not a modal and not a drawer, except below `md` (§7).
- **List toolbar** (above the table): the search input; a chip for every active filter (`India ×`) plus "Clear all"; the result count ("2,914 of 9,577" when filtered, "9,577 employees" otherwise); and a "Columns" menu. The title row above it holds the Export split button and "New employee".
- **Tables**: real `<table>` markup built with TanStack Table (headless; sorting and paging stay on the server), sticky header row, checkbox column for multi-select. Columns: Employee (avatar, name, and the job title in grey; the header offers "Name" and "Job title" sorts), Department, Level, Country, Hired, Salary. Every column is sortable (level by rank, salary by its USD amount), and the active sort indicator is drawn in `accent`. Rows per page is 25, 50 or 100, default 50. A click anywhere on a row opens the drawer, except on the checkbox and the name link, which keep their own behavior. Department, Level, Country, Hired and Salary can be hidden from the "Columns" menu. Numeric columns are right-aligned with tabular numerals.
- **Drawers**: used for employee detail, for multi-field forms (new employee) and for the bulk revision screen. Reserved for things that genuinely need more space than inline editing. The employee drawer is laid out as follows:
  - **Header**: avatar, name, then "Job title · Department · level badge · flag Country". A "⋯" menu holds Deactivate / Reactivate, next to the close button.
  - **Summary strip**: the current salary large, its USD equivalent, and "since <date>". A peer tile reads "Typical for India L3" and shows the middle-half range, with "median" as a secondary hint and the peer headcount. When the person is an outlier, a sentence in `warning` with an icon reads "Above the usual range for India L3" (or "Below"). With fewer than 10 peers the tile reads "Too few India L3 peers to show a typical range".
  - **Tabs**: Change salary (the default when the employee is active), Details (the default when inactive), History (n).
  - **History tab**, top to bottom:
    - A summary line for the whole history: "₹45,00,000.00 → ₹50,00,000.00 since hire (+11.11%)", and under it "0 promotions · 1 raise". With only the hire row: "Hired at ₹45,00,000.00 on 12 Apr 2021. No changes since." and no counts.
    - A segmented control labelled "Range": 3Y | 5Y | 10Y | All, default All. A range ends today, or on the deactivation date for an inactive employee, and never starts before the hire date, so for someone hired two years ago 3Y, 5Y, 10Y and All draw the same chart.
    - A step chart of pay over time, 200px tall at every width: the line in `accent` steps at each change and runs flat to the end of the range; each change is a dot coloured by reason (Hire `text-primary`, Raise `positive`, Promotion `series-promotion`, Relocation `text-secondary`, Correction `warning`), with a key listing the reasons shown. Each promotion is labelled with its new level and % jump ("L4 +15%") in `series-promotion`. A tooltip gives the date, the amount and the reason. Axis labels use `text-secondary` at 11px; axis lines use `border`. When every amount in the range is equal the amount axis has one label, and a range of under about two months labels just its start and end dates. When no change falls inside the range, the line is flat at the pay in force and the chart reads "No salary changes in this period."
    - When the pay has been in more than one currency (after a relocation), the summary line and the chart are in USD at the static FX rates, with the note "Shown in USD because this salary moved between currencies. FX rates as of <date>." The change list keeps each row's own currency.
    - Three figures under the chart, for the whole history: Average yearly growth (compound, from the hire date to today or the deactivation date; "—" with only the hire row or under a year of history), Biggest jump ("+15% · Promotion, 1 Apr 2023"; "—" when pay has never gone up), Last change ("1 year, 6 months ago").
    - The full change list, newest first, with the % change on every row after the hire, and bulk revisions marked "Bulk revision".
- **Inline editing**: single-field changes (e.g. job title) edit in place, no drawer/modal round-trip.
- **Bulk revision screen** (`/employees/revisions/new`, §4):
  - **Panel**: 960px wide at `md` and up (never wider than the window less 48px, so a strip of the list stays visible), full-screen below `md`. The close button (×), Escape and Cancel close it and go back to the list. A click on the dimmed list behind does not close it, so a stray click cannot throw away a typed percentage or hand edits.
  - **Layout**: in the panel, the left column ("setup") always stacks above the right ("review"). On the full-page fallback the two sit side by side from 1280px (`xl`) and stack below that, so the review table always has room. The table scrolls inside its own container if a long name or amount still does not fit; neither the panel nor the page scrolls sideways.
  - **Header**: on the full page only, "← Back to employees" (to the list with its filters, sort and page); the panel has its close button instead. Then the title "Bulk salary revision", and a step indicator "Choose people ✓ → Set increase & review → Confirm". The second step is current; the third is current while the dialog is open; all are done after confirming.
  - **Left column**, on `surface`, with section labels "Who", "Increase", "Effective date", "Note" and "Last bulk revision". Who reads "N people, active only" (or "Counting people…" while it loads, and "Could not count the people selected." with a "Retry" button only if no count has loaded yet; a later failure of the totals keeps the count shown), then the list's filter chips (read-only; a search shows as a `Search: ann` chip; the status chip is left out because only active people are revised), "Picked by hand from this list." for a hand-picked selection, "Everyone active" when nothing narrows it, and the headcount per department (largest first). Increase is a % input plus quick buttons 3 / 4 / 5 / 8 / 10%; no percentage is pre-chosen. Effective date defaults to today and cannot be in the future. Note is pre-filled from the selection ("Engineering, L3, India") and carries the hint "Shown in each person's salary history." Last bulk revision reads "1 Apr 2026 · 4% · 1,233 people" with its note, or "No bulk revision yet."
  - **Right column**, white. Until a percentage is chosen it reads "Choose an increase to see the review." Then four stat tiles, sized by the column's own width (four in a row when it is wide, two by two when narrower, one per row when narrow, so a figure such as a crore-scale total is never clipped): Added to annual payroll (one currency: that amount, with the USD equivalent as the hint unless it is USD; several currencies: the USD total, with each currency's sum as the hint), Typical pay (median after, hint "up from <before> · median", plus ", in USD" when the selection spans currencies), Rows overridden ("of N"), and Outside peer range (in `warning` when above zero, hint "before this revision"). The first three come from the server's totals and dim to 60% opacity, as the rows do, while a newer answer is on its way. The FX date sits under the tiles whenever a non-USD amount appears. Then a search ("Search by name") and a segmented control "All / Overridden (n) / Outside peer range (n)", then the table: Employee, Department, Current, New salary, Change, 50 rows per page, with edits kept across pages and filters.
  - **New salary cell**: a bordered, right-aligned input showing the amount with digit grouping (`1,982,182.62`; Indian grouping for INR) and the currency code beside it. An edited valid cell is amber-tinted (`warning` border, `warning` at 10% fill) with a small "edited · undo" tag under it in `warning`; an invalid one shows the existing red message. An edit equal to the proposed amount is not an edit. Change is the server's % in `positive`, "…" while an edit's figure is being fetched, and "—" for an invalid edit. A person outside their peer range carries an "Above range" / "Below range" tag with an icon.
  - **Footer** (sticky, at the bottom of the panel or page): "Nothing is saved until you confirm the changes.", Cancel (closes the panel; on the full page, a link back to the list), and "Review & confirm N changes →", disabled while any edit is invalid, the date is missing or in the future, nothing is loaded, or the preview for a newly typed percentage has not arrived yet. The dialog "Confirm salary revision" lists Increase (and "n edited by hand"), People, Effective, Added to annual payroll and Note, with "Back to review" and "Apply N raises". Apply waits until both the preview and the totals answer the current percentage and edits, and it sends the percentage the shown preview was computed with. If the totals fail, the dialog says "Could not update the totals." with a "Retry" button, so a disabled Apply always has a visible reason.
  - **States**: every message is plain text in the column it concerns, never a full-page takeover.
    - **No selection**: when the address carries no valid selection, the screen shows only the back link, the title, "No one is selected for this revision." and "Choose people on the employees list, then select Apply % increase.", and asks the server for no preview or totals.
    - **Loading**: skeletons shaped like the four tiles and the rows.
    - **Preview failure**: the server's message in `negative` with a "Retry" button, in place of the review (also after a failed reload, below).
    - **No one left**: "No active employees in this selection." in place of the tiles and table; the confirm button stays disabled.
    - **Totals failure**: "Could not update the totals." in `negative` with a "Retry" button, in place of the three totals tiles (Outside peer range stays); Apply stays disabled.
    - **No match**: "No one matches this search." when the search and quick filter leave no row.
    - **Invalid edit**: the footer adds "Fix the highlighted amounts before confirming." in `negative`.
  - **After confirming**: "Revision applied", "N raises recorded, effective <date>.", and links "View employees" (closes the panel, or links back to the list on the full page) and "View insights". A 409 closes the dialog, reloads the preview and asks for the totals and the Who count again, then shows the toast "Salaries changed since the preview. The preview has been reloaded." and keeps edits for people whose pay did not change. If the reload itself fails, the toast reads "Salaries changed since the preview, and it could not be reloaded. Try again.", the review shows the preview error with "Retry", and every edit is kept. Any other error shows inside the dialog. See `docs/architecture.md` §7 for the backend contract.
- **Salary change form** (the drawer's Change salary tab): the reason is a segmented control, Raise | Promotion | Relocation | Correction, chosen first, and the fields follow from it. Raise: amount only. Promotion: new level (only higher levels listed) + amount. Relocation: new country + amount, pre-filled with the converted current salary and labeled "Converted at FX rate as of <date> — adjust if needed". Correction: amount, optional level. The effective date defaults to today and cannot be set in the future.
  - The amount is pre-filled with the current salary (for a relocation, the converted amount with its FX note).
  - Quick-% buttons sit under the amount: Raise +3 / +5 / +10 / +15%, Promotion +10 / +15 / +20%, plus "Custom %". Relocation and Correction have none. The amount for a percentage comes from the API, never from browser arithmetic, and typing an amount by hand highlights Custom.
  - A comparison box shows Current / New / Change. Change is the local difference plus the % and the USD per year from the API (for a relocation, only the % and the USD), followed by one peer sentence such as "Still inside the typical range for India L3".
  - There is a Reset, and the submit button names the action ("Record raise").
- **Export**: a split button: "Export current result" (the main action) plus "Export all employees" in its menu. It's a plain download link — no modal.
- **Insights page** (`/insights`):
  - **Header.** The title "Insights", then the meta line "Figures for today cover active employees; trends include people who have since left · USD at FX rates of <date> · Past years use the same rates".
  - **Headline tiles.** Five tiles, two per row below `sm`, three from `sm` and five from `xl`:
    - Annual payroll ("$612.4M", hint "↑ 6.2% vs 12 months ago");
    - Active headcount ("9,577", hint "↑ 312 vs 12 months ago");
    - Average raise, last 12 months ("4.4%", hint "↓ from 4.6% the 12 months before");
    - Promotions, last 12 months ("412", hint "↑ from 380 the 12 months before");
    - Paid outside peer range ("187", in `warning` when above zero, hint "1.95% of active employees").

    An arrow always sits next to its number. Payroll and headcount growth are neutral information, so they are never coloured. A change of zero reads "No change vs 12 months ago" or "Same as the 12 months before". A missing figure is "—".
  - **Question cards.** They sit in two columns from `md` and one below. Every card is a chart card:
    - the question as a section label;
    - the answer as a sentence (15px, weight 600);
    - its controls;
    - the chart;
    - a one-line caption saying what the chart plots;
    - where it applies, a link in `accent` that opens the Employees list filtered to the people meant ("View these people →");
    - a "View as table" button in the card header (it reads "View as chart" while the table shows) that swaps the chart for a table of the same figures.

    While a card loads, it shows a line-shaped skeleton for the answer and an axis-shaped skeleton for the chart. A failed card shows the server's message in `negative` with "Retry", inside the card.
  - **How is payroll changing?**
    - Controls: "Range" 3Y | 5Y | 10Y | All (default 5Y) and "Group" Total | Country | Department.
    - Chart: a bar for payroll at each year end, labelled with the year, plus a last bar "Today". Bars are `accent` for Total, or stacked one segment per country or department in the categorical series with a legend.
    - Under it, a 64px strip chart "Headcount" plots the number of people at the same points. The strip is a separate chart, not a second axis.
    - 3Y means the last three year ends and today.
    - Caption: "Annual payroll at each year end and today, in USD at today's FX rates."
    - The table has Year, Payroll and Headcount, plus a column per country or department when grouped. Its "Today" row is the payroll by country and by department.
  - **What added to payroll in the last 12 months?**
    - Chart: horizontal bars in `accent` for New hires, Raises, Promotions, Relocations, Corrections and People who left, in that order. A bar extends right for an addition and left for a reduction, and is labelled with its signed amount ("+$15.2M").
    - Caption: "Change in annual payroll from <date a year ago> to today, by cause. The bars add up to the total change."
    - Table: Cause, Change, and People or changes.
  - **What are we giving in raises?**
    - Controls: "Show" Average % | $ cost, "Range" 3Y | 5Y | 10Y | All (default 5Y), and "Group" All | Country | Department. 3Y means this year and the two before it. The current year is labelled "2026 (YTD)".
    - Average %, All: a line of the year's average raise in `accent`, with a 64px strip chart "Number of raises" under it.
    - Average %, grouped: one line per country or department with a legend, and no strip.
    - $ cost, All: stacked bars of payroll added by raises (`series-1`) and promotions (`series-2`).
    - $ cost, grouped: one stacked segment per country or department, covering raises and promotions together.
    - Choosing a year, by clicking its bar or point or its "Show changes" button in the table, sets "What changed recently?" to that year.
    - Captions: "Average raise per calendar year; raises within one currency only." and "Payroll added each calendar year by raises and promotions, in USD at today's FX rates."
  - **Do levels mean consistent pay?**
    - Control: "Country", a segmented control with the country names.
    - Chart: one row per level, L1 at the top. Each row has a bar from the bottom quarter to the top quarter of pay in `series-secondary`, a tick at the median in `accent`, and the median written beside it, in local currency. A level with fewer than 10 people reads "Too few people".
    - Caption: "Each bar spans the middle half of people at that level, in <currency>; the tick marks typical pay (median)."
    - Table: Level, People, Bottom quarter, Typical (median), Top quarter, and Step from level below ("1.35×").
    - Under the card, a "Full breakdown" button (with `aria-expanded`) opens the distribution table. A "Group" segmented control (Country | Department | Level) selects the rows. Columns: Group, People, Lowest, Bottom quarter earn under, Typical pay *(median)*, Average, Top quarter earn over, Top 10% earn over, Highest, in USD.
  - **Who needs attention?** Three rows, each with a count in 22px, a title, a one-line meaning, and "View these people →" (left out when the count is 0):
    - "Outside peer range": "Paid well above or below others at the same level in the same country.", with "142 above · 45 below".
    - "No raise in over 2 years": "Active employees whose last raise or promotion took effect more than 24 months ago."
    - "Paid less than new hires": "Long-tenured staff paid less than the median of people hired in the last year, in: India L2, India L3." It reads "No country and level where new hires are paid more." when there are none.

    This card has no chart, so it has no "View as table".
  - **What changed recently?**
    - The latest five changes, as on the salary changes page, then "See all changes →".
    - A year chosen in the raises card shows as a chip "2024 ×", and removing the chip returns the card to the last three years.
- **Salary changes page** (`/insights/changes`):
  - Header: "← Back to insights" and the title "Salary changes".
  - Controls:
    - "Range" 3Y | 5Y | 10Y | All (default 3Y);
    - a "Reason" select: All reasons, Hire, Raise, Promotion, Relocation, Correction;
    - a "Year" select: Any year, then the years with changes, newest first.

    Choosing a year replaces the range control with "In 2024" and a "Clear year" button.
  - Rows: 25 per page, newest first, with the shared pagination. Each row shows:
    - the reason badge;
    - the name, linked to the employee;
    - an "Inactive" badge for someone who has left;
    - from → to, with the new amount in `positive` when it went up in the same currency;
    - the date.

    A bulk revision is one row with a "Bulk revision" badge: "1,233 people · +3.57% · Annual increment 2026".
  - No match: "No salary changes match these filters." with a "Clear filters" link.
- **Loading states**: skeleton placeholders shaped like the content they stand in for (table-row skeletons for the employee list, axis-shaped skeletons for charts), scoped to the specific panel or table that's fetching rather than a full-page takeover. This is the standard pattern for data-heavy interfaces; matching the real content's shape (not a generic identical block everywhere) is what keeps it from feeling like an untouched library default.
- **Errors**: a toast for action failures (e.g. a failed save); inline field-level messages for validation errors in forms.
- **Empty states**: plain text + the relevant primary action (e.g. "No employees match these filters" with a "Clear filters" link), no illustration.
- **Login**: a solid `brand-panel` panel, about 55% of the width, carrying only the app mark and name and a faint bar-chart pattern in one corner. No headline, pitch or feature list. The right side reads "Sign in", the subline "Use your work email and password.", then email, password with a Show/Hide toggle, a full-width Sign in button, and the note "Sessions last a working day." This is the app's only dark surface. Below `md` the panel becomes a slim header band.

## 6. Content density

Tables default to compact row height — this is a data tool for someone used to spreadsheets, not a consumer app optimizing for whitespace. Favor showing more rows over more padding.

## 7. Responsive rules

This is one implementation, not a separate mobile build. Breakpoint: `md` (768px) is the line between the desktop table layout and the mobile layout.

- **≥768px (tablet/desktop)**: full table as described in §5, the left filter panel, drawer slides in from the right at a fixed width (not full-screen): 560px for employee detail and new employee, 960px for the bulk revision panel.
- **<768px (mobile)**: the employee list renders as a single-column list of compact rows (name, department/level, current salary — the fields that matter most at a glance), because a multi-column table physically cannot work at that width; this is a deliberate width-driven exception, not a default choice, since a real table is still used on desktop where it fits. Tapping a row opens the detail drawer as a full-screen sheet instead of a fixed-width side panel. The filter panel becomes a bottom sheet that opens from a "Filters (n)" button, where n is the number of ticked options. Rows are selected for a bulk revision by tapping a "Select" button above the list, which shows a checkbox on every row (tap a row to toggle it) and a "Select all N matching" option; tapping "Done" hides the checkboxes. The bulk revision panel is full-screen with the setup above the review; the review table becomes a stacked list of editable rows, and the footer stays pinned to the bottom with a full-width confirm button. The Employees header's export button reads "Export" below `sm` (its accessible name stays "Export current result"), and the header actions wrap instead of running off the screen. Insights cards stack in a single column, each full-width, and the tiles run two per row; the salary changes page's controls wrap above the list. The top nav's two links remain visible (there are only two; no hamburger menu needed).
- The employee drawer and the bulk revision panel are full-screen below `md`.
- Touch targets are at least 44px tall on any interactive element at the mobile breakpoint.

## 8. Accessibility baseline

- Color is never the only signal (e.g. outlier flags pair the warning color with a label/icon, not color alone).
- Flags and avatars are decorative: the person's name and the country name are always written beside them.
- A chip's remove button is named for what it removes ("Remove filter India"). Each option count in the filter panel is attached to its checkbox with `aria-describedby`.
- All interactive elements are keyboard-reachable: table sort headers, filter controls, drawer close, bulk selection bar.
- Text and background combinations meet WCAG AA contrast (all palette tokens are verified in §2; `text-secondary`/`inactive` on `surface` is the tightest pair at 4.5:1, so don't put them on anything darker).
- Focus states are visible (a 2px outline in `accent`), never suppressed.

## 9. Out of scope for this document

Pixel-level spacing for every individual screen, a full component-prop API, and dark mode are intentionally not specified here. The goal is consistency on the things that would otherwise visibly clash between sessions — palette, type, core patterns, responsive behavior — not a complete design spec for every screen.
