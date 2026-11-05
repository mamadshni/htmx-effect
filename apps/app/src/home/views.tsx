import { Layout } from "../layout.js";
import { Field, Section } from "../ui.js";

const countries = [
  "Åland Islands",
  "Austria",
  "Belgium",
  "Denmark",
  "France",
  "Germany",
  "Italy",
  "Netherlands",
  "Spain",
  "Switzerland",
];

export const Page = ({ items }: { items: ReadonlyArray<string> }) => (
  <Layout title="Home" current="home">
    <main class="page">
      <h1>Components</h1>

      <Section id="combobox" title="Combobox">
        <button type="button" class="button" commandfor="search-dialog" command="show-modal">
          Search fruits
        </button>
      </Section>

      <Section id="combobox-local" title="Combobox (filtered in the browser)">
        <Field id="country" label="Country">
          <ds-combobox-local filter="starts-with">
            <input
              id="country"
              type="search"
              name="country"
              autocomplete="off"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="country-options"
              aria-expanded="false"
              placeholder="Type to filter…"
            />
            <ul id="country-options" role="listbox" popover="manual">
              {countries.map((country) => (
                <li id={`country-${country.toLowerCase().replaceAll(" ", "-")}`} role="option">
                  {country}
                </li>
              ))}
            </ul>
          </ds-combobox-local>
        </Field>
      </Section>

      <Section id="menus" title="Menus">
        <div class="button-row">
          <button
            type="button"
            class="button"
            id="actions-button"
            popovertarget="actions-menu"
            aria-haspopup="menu"
          >
            Actions
          </button>
        </div>
        <ActionsMenu />
        <EditorMenubar />
      </Section>

      <Section id="sheets" title="Bottom sheets">
        <div class="button-row">
          <button type="button" class="button" popovertarget="places">
            Places (bottom sheet)
          </button>
          <button type="button" class="button" commandfor="sort" command="show-modal">
            Sort (modal sheet)
          </button>
        </div>
      </Section>

      <Section id="date-picker" title="Date picker">
        <Field id="due" label="Due date">
          <ds-date-picker id="due" name="due" min="2026-01-01" max="2026-12-31" />
        </Field>
      </Section>

      <Section id="date-range-picker" title="Date range picker">
        <Field id="stay" label="Stay">
          <ds-date-picker
            id="stay"
            name="stay"
            range
            months={2}
            min="2026-01-01"
            max="2026-12-31"
          />
        </Field>
      </Section>

      <Section id="calendar" title="Calendar">
        <ds-calendar show-outside-days>
          <ds-calendar-select-month />
          <ds-calendar-select-year />
          <ds-calendar-month />
        </ds-calendar>
      </Section>

      <Section id="calendar-range" title="Calendar range">
        <ds-calendar-range months={2}>
          <ds-calendar-month />
          <ds-calendar-month offset={1} />
        </ds-calendar-range>
      </Section>

      <Section id="calendar-multi" title="Calendar multi">
        <ds-calendar-multi disallowed-weekdays="0 6">
          <ds-calendar-month />
        </ds-calendar-multi>
      </Section>

      <Section id="german" title="Zeitraum (Deutsch)" lang="de">
        <Field id="aufenthalt" label="Aufenthalt">
          <ds-date-picker id="aufenthalt" name="aufenthalt" range months={2} required />
        </Field>
      </Section>
    </main>

    <SearchDialog items={items} />
    <PlacesSheet />
    <SortSheet />
  </Layout>
);

const places = [
  "Café Central",
  "Stadtpark",
  "Naschmarkt",
  "Albertina",
  "Prater",
  "Belvedere",
  "MuseumsQuartier",
  "Donauinsel",
];

/** non-modal: the page stays usable; drag between 25%, 50% and 90% of the screen */
const PlacesSheet = () => (
  <ds-bottom-sheet snap-points="25 50 90">
    <div id="places" popover="manual" aria-labelledby="places-title">
      <header class="sheet-header">
        <h2 id="places-title">Places nearby</h2>
        <button
          type="button"
          class="button button--ghost"
          popovertarget="places"
          popovertargetaction="hide"
        >
          Close
        </button>
      </header>
      <ul class="sheet-list">
        {places.map((place) => (
          <li>{place}</li>
        ))}
      </ul>
    </div>
  </ds-bottom-sheet>
);

/** modal: fits its content; Escape, the backdrop, Done or dragging down close it */
const SortSheet = () => (
  <ds-modal-sheet>
    <dialog id="sort" aria-labelledby="sort-title">
      <header class="sheet-header">
        <h2 id="sort-title">Sort by</h2>
      </header>
      <form method="dialog" class="sheet-form">
        {["Relevance", "Distance", "Rating", "Price"].map((option, i) => (
          <label>
            <input type="radio" name="sort" value={option.toLowerCase()} checked={i === 0} />{" "}
            {option}
          </label>
        ))}
        <button class="button">Done</button>
      </form>
    </dialog>
  </ds-modal-sheet>
);

/** a menu button with a submenu, a checkbox item and a radio group; keys: the design system's keyboard module */
const ActionsMenu = () => (
  <div id="actions-menu" popover role="menu" aria-labelledby="actions-button">
    <button type="button" role="menuitem">
      Edit
    </button>
    <button type="button" role="menuitem">
      Duplicate
    </button>
    <button type="button" role="menuitem" popovertarget="share-menu" aria-haspopup="menu">
      Share
    </button>
    <div id="share-menu" popover role="menu" aria-label="Share">
      <button type="button" role="menuitem">
        Email
      </button>
      <button type="button" role="menuitem">
        Copy link
      </button>
    </div>
    <button type="button" role="menuitem" aria-disabled="true">
      Archive
    </button>
    <div role="separator"></div>
    <button type="button" role="menuitemcheckbox" aria-checked="false">
      Show hidden files
    </button>
    <div role="group" aria-label="Sort by">
      <button type="button" role="menuitemradio" aria-checked="true">
        Sort by name
      </button>
      <button type="button" role="menuitemradio" aria-checked="false">
        Sort by date
      </button>
    </div>
    <div role="separator"></div>
    <button type="button" role="menuitem">
      Delete
    </button>
  </div>
);

const menubarMenus = [
  { id: "file", label: "File", items: ["New", "Open…", "Save"] },
  { id: "edit", label: "Edit", items: ["Undo", "Redo", "Cut", "Copy", "Paste"] },
  { id: "view", label: "View", items: ["Zoom in", "Zoom out"] },
];

/** a menubar: one tab stop, ArrowRight/ArrowLeft along the bar, ArrowDown opens a menu */
const EditorMenubar = () => (
  <div role="menubar" aria-label="Editor">
    {menubarMenus.map(({ id, label, items }, i) => (
      <>
        <button
          type="button"
          role="menuitem"
          popovertarget={`${id}-menu`}
          aria-haspopup="menu"
          tabindex={i === 0 ? "0" : "-1"}
        >
          {label}
        </button>
        <div id={`${id}-menu`} popover role="menu" aria-label={label}>
          {items.map((item) => (
            <button type="button" role="menuitem">
              {item}
            </button>
          ))}
        </div>
      </>
    ))}
  </div>
);

export const SearchDialog = ({ items }: { items: ReadonlyArray<string> }) => (
  <dialog id="search-dialog" class="search-dialog" aria-labelledby="search-dialog-title">
    <header class="search-dialog__header">
      <h2 id="search-dialog-title">Search fruits</h2>
      <button type="button" class="button button--ghost" commandfor="search-dialog" command="close">
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
          placeholder="Type to search…"
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
