export const Page = ({ items }: { items: ReadonlyArray<string> }) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>combo-htmx</title>
      <link rel="stylesheet" href="/assets/design-system/index.css" />
      <script src="/assets/htmx.js"></script>
      <script src="/assets/design-system/index.js"></script>
    </head>
    <body>
      <button type="button" commandfor="search-dialog" command="show-modal">
        Search
      </button>
      <SearchDialog items={items} />
    </body>
  </html>
);

export const SearchDialog = ({ items }: { items: ReadonlyArray<string> }) => (
  <dialog id="search-dialog" aria-label="Search">
    <header>
      <button type="button" commandfor="search-dialog" command="close">
        Close
      </button>
    </header>
    <search>
      <ds-combobox>
        <input
          type="search"
          name="q"
          autofocus
          autocomplete="off"
          role="combobox"
          aria-label="Search fruits"
          aria-autocomplete="list"
          aria-controls="search-options"
          aria-expanded="false"
          hx-get="/search-options"
          hx-trigger="input changed delay:150ms"
          hx-target="#search-options"
          hx-swap="outerHTML"
        />
        <SearchOptions items={items} />
      </ds-combobox>
    </search>
  </dialog>
);

export const SearchOptions = ({
  items,
  selected,
}: {
  items: ReadonlyArray<string>;
  selected?: string | undefined;
}) => (
  <ul id="search-options" role="listbox" popover="manual">
    {items.length === 0 ? (
      <li id="search-option-empty" role="option" aria-disabled="true">
        No results found
      </li>
    ) : (
      items.map((item) => (
        <li
          id={`search-option-${item.toLowerCase()}`}
          role="option"
          aria-selected={item === selected ? "true" : undefined}
        >
          {item}
        </li>
      ))
    )}
  </ul>
);
