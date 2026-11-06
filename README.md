# combo-htmx

Web components for server-rendered pages (htmx), and a playground app to try them.

```
apps/app                 playground: Effect HTTP server, JSX rendered to HTML, htmx
packages/design-system   @combo/design-system: the components (light DOM, no framework)
```

## Commands

```sh
pnpm install
pnpm dev         # builds the design system, then runs the app on http://localhost:3000
pnpm test        # component tests in headless Chrome (the installed one)
pnpm typecheck
```

`pnpm dev` watches the app only; after a design-system change run
`pnpm --filter @combo/design-system build` and reload.

## Design system

One script and one stylesheet (`bundle/index.js`, `bundle/index.css`) define every element.
Inputs are attributes and properties, kept in sync and checked: an invalid value is
rejected with a warning and the previous one is kept. Text is English or German, from
`locale` or the nearest `lang`. The components know nothing about htmx.

| Element | What it is |
| --- | --- |
| `ds-combobox` | Combobox whose options come from the server (e.g. htmx swaps the listbox) |
| `ds-combobox-local` | Combobox that filters its own options in the browser (`filter`: `contains` \| `starts-with`) |
| `ds-calendar`, `ds-calendar-range`, `ds-calendar-multi` | Calendar containers: one date, a range, several dates |
| `ds-calendar-month`, `ds-calendar-select-month`, `ds-calendar-select-year` | Parts placed inside a container |
| `ds-date-picker` | Form-associated date or range field (text input + calendar popover; native picker on touch) |
| `ds-bottom-sheet` | Non-modal sheet around a `[popover]`, dragged between sizes (`snap-points`, e.g. `25 50 90`) |
| `ds-modal-sheet` | Modal dialog around a `<dialog>`, always shown as a draggable bottom sheet; dragging it down closes it |

**Keyboard navigation is delegated**: one set of listeners on the document
(`src/keyboard/`) handles every combobox (`role="combobox"` → `role="listbox"`, focus stays in
the input) and every menu (`[popover][role="menu"]`, `[role="menubar"]` with `menuitem`,
`menuitemcheckbox`, `menuitemradio`), following the ARIA APG. Native checkboxes in a popover
panel get arrow keys on top of their own behaviour, without any role changes. Plain markup gets it too, also
when added later by htmx; no element needed. A form inside a popover (e.g. an editor dialog
under a filter chip) is a draft: closing the popover without saving resets it (`src/popover/draft.ts`).

Dates are `YYYY-MM-DD` strings in attributes and form values, and `Temporal.PlainDate`
(`@js-temporal/polyfill`) in JavaScript: event details, `isDateDisallowed`, `start`/`end`.

## Playground pages

| Route | Shows |
| --- | --- |
| `/` | Every component once; the server combobox is backed by `/search-options` |
| `/calendar` | Calendar and date picker API tables, live examples with their code and events |
| `/compare` | [cally](https://github.com/WickyNilliams/cally) next to our calendar, scenario by scenario |
| `/filters` | The same htmx filter form two ways, to compare with a screen reader: native checkboxes in a disclosure (recommended) and a menu of submit buttons; then chips whose label opens an editor `<dialog popover>` under them (checkboxes, combobox or text, Apply / Cancel); each example saves its own filters |
| `/range-picker` | `<app-range-picker>`: cally range calendar with relative presets (app code, not the design system) |
| `/grid` | Grid builder: two layouts of the same blocks, edited separately: 12 columns for wide screens and 6 for narrow ones. Drag blocks to place them and their right edge to set how many columns they span; blocks in the way are pushed down, a drop past the side snaps inside; rows only order blocks (on a page each row is as tall as its content). Save both as a pattern (CSS with `grid-template-areas` and a `@media` switch), open one as a page (`/grid/patterns/:id`) |
