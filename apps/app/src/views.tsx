export const Page = () => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>combo-htmx</title>
      <script src="/assets/htmx.js"></script>
      <script type="module" src="/assets/design-system/index.js"></script>
    </head>
    <body>
      <button hx-get="/search-dialog" hx-target="#dialog-slot">
        Search
      </button>
      <div id="dialog-slot"></div>
    </body>
  </html>
);

export const SearchDialog = ({ items }: { items: ReadonlyArray<string> }) => (
  <dialog hx-on--load="this.showModal()">
    <ds-search
      name="q"
      hx-get="/search-options"
      hx-trigger="input changed delay:150ms"
      hx-include="find input"
      hx-target="find [role=listbox]"
      hx-swap="outerHTML"
    >
      <SearchOptions items={items} />
    </ds-search>
  </dialog>
);

export const SearchOptions = ({ items }: { items: ReadonlyArray<string> }) => (
  <ul id="search-options" role="listbox">
    {items.map((item) => (
      <li role="option">{item}</li>
    ))}
  </ul>
);
