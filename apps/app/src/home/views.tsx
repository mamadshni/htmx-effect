import { Layout } from "../layout.js";
import { Field, Section } from "../ui.js";

export const Page = ({ items }: { items: ReadonlyArray<string> }) => (
  <Layout title="Home" current="home">
    <main class="page">
      <h1>Components</h1>

      <Section id="combobox" title="Combobox">
        <button type="button" class="button" commandfor="search-dialog" command="show-modal">
          Search fruits
        </button>
      </Section>

      <Section id="date-picker" title="Date picker">
        <Field id="due" label="Due date">
          <ds-date-picker id="due" name="due" min="2026-01-01" max="2026-12-31" />
        </Field>
      </Section>

      <Section id="date-range-picker" title="Date range picker">
        <Field id="stay" label="Stay">
          <ds-date-picker id="stay" name="stay" range months={2} min="2026-01-01" max="2026-12-31" />
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
  </Layout>
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
