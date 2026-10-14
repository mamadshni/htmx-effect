/**
 * The filters page: the same filter form twice, to compare with a screen reader.
 *
 * A. "checkboxes" (recommended): native checkboxes (name="filter") in a disclosure panel
 *    (a popover <fieldset>). Saved on every change with htmx, or with Apply (also the form's
 *    default button, and the way to save without JavaScript).
 * B. "menu": a [popover][role="menu"] whose items are submit buttons with
 *    role="menuitemcheckbox" (name="toggle"); the chips carry the selection as hidden inputs.
 *
 * In both, each chip's × is a submit button (name="remove"), and the form posts to
 * /filters/<variant>. Answers to htmx carry the changed pieces by id (hx-swap-oob); the
 * status message keeps its element and only gets new text (innerHTML), so screen readers
 * announce it (a live region inserted with its text usually is not). Ids are prefixed with
 * the variant, so the two examples never touch each other.
 */

import { Layout } from "../layout.js";
import { activeFilters, filters, isActive, tasks, visibleTasks, type Filter, type Variant } from "./store.js";

const oob = (swap: boolean, how = "true") => (swap ? { "hx-swap-oob": how } : {});

/** "3 of 8 tasks" */
const countText = (v: Variant) => `${visibleTasks(v).length} of ${tasks.length} tasks`;

// ---- the two ways to pick filters ----

/** A: one filter's checkbox; swapped after a change (htmx keeps focus on it by its id) */
const FilterCheckbox = ({ filter, swap = false }: { filter: Filter; swap?: boolean }) => (
  <input
    type="checkbox"
    id={`checkboxes-filter-${filter.id}`}
    name="filter"
    value={filter.id}
    checked={isActive("checkboxes", filter.id)}
    {...oob(swap)}
  />
);

/**
 * B: one filter in the menu, a submit button sending toggle=<id>. The design system ticks
 * aria-checked on click right away; the response puts the saved state in place.
 */
const FilterMenuItem = ({ filter, swap = false }: { filter: Filter; swap?: boolean }) => (
  <button
    type="submit"
    name="toggle"
    value={filter.id}
    id={`menu-filter-${filter.id}`}
    role="menuitemcheckbox"
    aria-checked={String(isActive("menu", filter.id))}
    tabindex="-1"
    {...oob(swap)}
  >
    {filter.label}
  </button>
);

// ---- shared pieces ----

/** the active filters as chips; `focus`: the id to focus after this swap (a chip was removed) */
const ActiveFilters = ({ v, swap = false, focus }: { v: Variant; swap?: boolean; focus?: string | undefined }) => {
  const active = activeFilters(v);
  return (
    <ul
      id={`${v}-active-filters`}
      class="filter-chips"
      aria-label="Active filters"
      tabindex="-1"
      autofocus={focus === `${v}-active-filters`}
      {...oob(swap)}
    >
      {active.length === 0 ? (
        <li class="filter-chips__empty">No filters: all tasks are shown.</li>
      ) : (
        active.map((filter) => (
          <li class="filter-chip">
            {filter.label}
            {/* B has no checkboxes: the chips carry the selection */}
            {v === "menu" ? <input type="hidden" name="filter" value={filter.id} /> : null}
            <button
              type="submit"
              name="remove"
              value={filter.id}
              id={`${v}-remove-${filter.id}`}
              class="filter-chip__remove"
              aria-label={`Remove filter: ${filter.label}`}
              autofocus={focus === `${v}-remove-${filter.id}`}
            >
              ×
            </button>
          </li>
        ))
      )}
    </ul>
  );
};

const Results = ({ v, swap = false }: { v: Variant; swap?: boolean }) => (
  <div id={`${v}-results`} class="filter-results" {...oob(swap)}>
    <h3 class="filter-results__title">{countText(v)}</h3>
    <ul class="filter-results__list">
      {visibleTasks(v).map((task) => (
        <li>
          <span class="filter-results__name">{task.title}</span>
          <span class="filter-results__meta">
            {[task.status, task.priority === "high" ? "high priority" : "", task.kind, task.assignee ?? "unassigned", task.due ? `due ${task.due}` : ""]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  </div>
);

/** the announcement; on the page it starts empty (nothing to announce on load) */
const Status = ({ v }: { v: Variant }) => <p id={`${v}-status`} class="visually-hidden" role="status"></p>;

/** everything a change touches: every filter control (a chip may have unchecked one), chips, results, status text */
export const Changed = ({ v, focus }: { v: Variant; focus?: string | undefined }) => (
  <>
    {filters.map((filter) => (v === "checkboxes" ? <FilterCheckbox filter={filter} swap /> : <FilterMenuItem filter={filter} swap />))}
    <ActiveFilters v={v} swap focus={focus} />
    <Results v={v} swap />
    <p id={`${v}-status`} {...oob(true, "innerHTML")}>
      {`Filters saved. ${countText(v)} shown.`}
    </p>
  </>
);

// ---- the two forms ----

/** both forms: save on every change (htmx) or on submit; a newer request replaces one in flight */
const formProps = (v: Variant) => ({
  id: `${v}-form`,
  class: "filter-bar",
  method: "post",
  action: `/filters/${v}`,
  "hx-post": `/filters/${v}`,
  "hx-trigger": "change, submit",
  "hx-sync": "this:replace",
  "hx-swap": "none",
});

const CheckboxesForm = () => (
  <form {...formProps("checkboxes")}>
    {/* a disclosure: the browser exposes it as expanded/collapsed (popovertarget) */}
    <button type="button" id="checkboxes-button" class="button button--ghost" popovertarget="checkboxes-panel">
      Filters
    </button>
    <fieldset id="checkboxes-panel" class="filter-panel" popover>
      <legend class="filter-panel__legend">Show tasks that are</legend>
      {filters.map((filter) => (
        <label class="filter-panel__option">
          <FilterCheckbox filter={filter} /> {filter.label}
        </label>
      ))}
      {/* the first submit button, so it is the default one (Enter in the form) */}
      <button type="submit" class="button filter-panel__apply">
        Apply
      </button>
    </fieldset>
    <ActiveFilters v="checkboxes" />
  </form>
);

const MenuForm = () => (
  <form {...formProps("menu")}>
    <button type="button" id="menu-button" class="button button--ghost" popovertarget="menu-panel" aria-haspopup="menu">
      + Add filter
    </button>
    <div id="menu-panel" popover role="menu" aria-labelledby="menu-button">
      {filters.map((filter) => (
        <FilterMenuItem filter={filter} />
      ))}
    </div>
    <ActiveFilters v="menu" />
  </form>
);

const Example = ({ v, title, children }: { v: Variant; title: string; children: JSX.Node }) => (
  <section class="card" id={v} aria-labelledby={`${v}-title`}>
    <h2 id={`${v}-title`} class="card__title">
      {title}
    </h2>
    {children}
    <Status v={v} />
    <Results v={v} />
  </section>
);

export const FiltersPage = () => (
  <Layout title="Filters" current="filters">
    <main class="page">
      <header class="intro">
        <h1>Filters</h1>
        <p>
          The same filter form built two ways, to compare with a screen reader. Each has its own saved filters. In both,
          one <code>&lt;form&gt;</code> handles adding and removing, posts with htmx (or normally without JavaScript), and
          the server saves the selection and answers with the changed pieces and a status message. A chip's × removes
          its filter.
        </p>
      </header>

      <Example v="checkboxes" title="A. Checkboxes in a disclosure (recommended)">
        <ul class="filter-notes">
          <li>
            <strong>Filters</strong> is a disclosure button (expanded/collapsed); the panel is a group named “Show tasks
            that are” with native checkboxes.
          </li>
          <li>Keys: Tab or the arrow keys between checkboxes, Space toggles (saved at once), Escape closes.</li>
          <li>Without JavaScript: check, then Apply.</li>
        </ul>
        <CheckboxesForm />
      </Example>

      <Example v="menu" title="B. Menu with submit buttons">
        <ul class="filter-notes">
          <li>
            <strong>+ Add filter</strong> opens a menu; each item is a <code>menuitemcheckbox</code> that is also a
            submit button.
          </li>
          <li>Keys: arrows, Home/End, a letter; Space toggles and keeps the menu open, Enter toggles and closes it.</li>
          <li>Without JavaScript: the role still says “menu”, but no arrow keys work and each click reloads the page.</li>
        </ul>
        <MenuForm />
      </Example>
    </main>
  </Layout>
);
