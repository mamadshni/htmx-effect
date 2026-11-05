/**
 * C. "chips": filters with a value, each edited in a dialog under its chip.
 *
 * A chip is two buttons: its label ("Status: Open") opens the editor, × removes the filter.
 * The editor is a non-modal <dialog popover> right after its button (reading and Tab order
 * follow): the browser exposes the button as expanded/collapsed, moves focus into the
 * dialog, and closes it on Escape (focus back on the chip) or a click outside. Its form holds
 * the field (checkboxes, a combobox or a text input), Apply (the default button) and Cancel.
 * Closing without Apply discards the edits (the design system resets a form in a popover).
 *
 * "+ Add filter" is a menu (picking a filter is a command); each item opens that filter's
 * editor, anchored under the menu button since the filter has no chip yet.
 *
 * Every editor posts to /filters/chips (field=<id>, value=…, or remove=<id>); the answer
 * swaps the whole bar (chips, editors, menu), the results and the status text.
 */

import { oob, Results, Status, StatusText, countText } from "./views.js";
import { editedFields, editedTasks, fields, summary, valuesOf, type Field } from "./store.js";

const editorId = (field: Field) => `chips-edit-${field.id}`;
export const chipId = (field: Field) => `chips-chip-${field.id}`;
export const removeId = (field: Field) => `chips-remove-${field.id}`;

/** the field's control, labelled by the dialog's title */
const Control = ({ field, labelledby }: { field: Field; labelledby: string }) => {
  const values = valuesOf(field);
  const options = field.options ?? [];
  switch (field.kind) {
    case "checkboxes":
      return (
        <fieldset class="filter-editor__group" aria-labelledby={labelledby}>
          {options.map((option) => (
            <label class="filter-panel__option">
              <input type="checkbox" name="value" value={option.id} checked={values.includes(option.id)} /> {option.label}
            </label>
          ))}
        </fieldset>
      );
    case "combobox": {
      const listId = `${editorId(field)}-options`;
      return (
        <ds-combobox-local filter="starts-with">
          <input
            type="text"
            name="value"
            autocomplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded="false"
            aria-labelledby={labelledby}
            value={options.find((o) => o.id === values[0])?.label ?? ""}
          />
          <ul id={listId} role="listbox" popover="manual">
            {options.map((option) => (
              <li id={`${listId}-${option.id}`} role="option">
                {option.label}
              </li>
            ))}
          </ul>
        </ds-combobox-local>
      );
    }
    case "text":
      return <input type="text" name="value" class="filter-editor__input" aria-labelledby={labelledby} value={values[0] ?? ""} />;
  }
};

/** a filter's editor; `fresh`: the filter is not set yet (opened from the menu) */
const Editor = ({ field, fresh = false }: { field: Field; fresh?: boolean }) => {
  const id = editorId(field);
  return (
    <dialog id={id} class={fresh ? "filter-editor filter-editor--fresh" : "filter-editor"} popover aria-labelledby={`${id}-title`}>
      <form
        id={`${id}-form`}
        method="post"
        action="/filters/chips"
        hx-post="/filters/chips"
        hx-sync="this:replace"
        hx-swap="none"
      >
        <input type="hidden" name="field" value={field.id} />
        <h3 id={`${id}-title`} class="filter-editor__title">
          {field.label}
        </h3>
        <Control field={field} labelledby={`${id}-title`} />
        <div class="filter-editor__actions">
          {/* the first submit button, so it is the default one (Enter in the form) */}
          <button type="submit" class="button">
            Apply
          </button>
          <button type="button" class="button button--ghost" popovertarget={id} popovertargetaction="hide">
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
};

/** everything a change touches but the results: the menu, its editors and the chips */
const Bar = ({ swap = false, focus }: { swap?: boolean; focus?: string | undefined }) => {
  const edited = editedFields();
  const unset = fields.filter((field) => !edited.some((e) => e.field === field));
  return (
    <div id="chips-bar" class="filter-bar" {...oob(swap)}>
      {unset.length > 0 ? (
        <>
          <button
            type="button"
            id="chips-add"
            class="button button--ghost"
            popovertarget="chips-add-menu"
            aria-haspopup="menu"
            autofocus={focus === "chips-add"}
          >
            + Add filter
          </button>
          <div id="chips-add-menu" popover role="menu" aria-labelledby="chips-add">
            {unset.map((field) => (
              <button type="button" role="menuitem" tabindex="-1" popovertarget={editorId(field)} aria-haspopup="dialog">
                {field.label}…
              </button>
            ))}
          </div>
          {unset.map((field) => (
            <Editor field={field} fresh />
          ))}
        </>
      ) : null}
      <ul
        id="chips-active-filters"
        class="filter-chips"
        aria-label="Active filters"
        tabindex="-1"
        autofocus={focus === "chips-active-filters"}
      >
        {edited.length === 0 ? (
          <li class="filter-chips__empty">No filters: all tasks are shown.</li>
        ) : (
          edited.map(({ field, values }) => (
            <li class="filter-chip filter-chip--editable">
              <button
                type="button"
                id={chipId(field)}
                class="filter-chip__edit"
                popovertarget={editorId(field)}
                aria-haspopup="dialog"
                autofocus={focus === chipId(field)}
              >
                {field.label}: {summary(field, values)}
              </button>
              <Editor field={field} />
              <button
                type="submit"
                form={`${editorId(field)}-form`}
                name="remove"
                value={field.id}
                id={removeId(field)}
                class="filter-chip__remove"
                aria-label={`Remove filter: ${field.label}`}
                autofocus={focus === removeId(field)}
              >
                ×
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
};

/** the answer to a change: `message` when it was not saved, `focus` the id to focus */
export const ChipsChanged = ({ message, focus }: { message?: string | undefined; focus?: string | undefined }) => (
  <>
    <Bar swap focus={focus} />
    <Results v="chips" shown={editedTasks()} swap />
    <StatusText v="chips" text={message ?? `Filters saved. ${countText(editedTasks())} shown.`} />
  </>
);

export const ChipsExample = () => (
  <section class="card" id="chips" aria-labelledby="chips-title">
    <h2 id="chips-title" class="card__title">
      C. Chips with an editor dialog
    </h2>
    <ul class="filter-notes">
      <li>
        Each chip's label is a button (“Status: Open, collapsed”) that opens a <code>dialog</code> under it with
        checkboxes, a combobox or a text field, and Apply / Cancel.
      </li>
      <li>Keys: Enter applies, Escape (or Cancel, or a click outside) closes and discards the edits.</li>
      <li>
        <strong>+ Add filter</strong> is a menu; its items open a new filter's dialog.
      </li>
    </ul>
    <Bar />
    <Status v="chips" />
    <Results v="chips" shown={editedTasks()} />
  </section>
);
