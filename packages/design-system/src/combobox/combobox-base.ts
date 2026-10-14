/**
 * The combobox behaviour shared by <ds-combobox> (the server filters) and
 * <ds-combobox-local> (filters its own options in the browser). Subclasses only choose
 * how a query finds options: `search`.
 *
 * Light DOM only; parts are found by role, so the page owns the markup:
 *
 *   <input type="search" role="combobox" aria-controls="list-id" aria-expanded="false" />
 *   <ul id="list-id" role="listbox" popover="manual">
 *     <li id="option-id" role="option">…</li>
 *     <!-- an option that cannot be picked, e.g. an empty state: -->
 *     <li id="empty-id" role="option" aria-disabled="true">No results</li>
 *   </ul>
 *
 * - Keys are handled for every combobox on the page by keyboard/combobox.ts (event
 *   delegation); this element opens the list on focus, filters on input and picks on click.
 * - aria-expanded on the input is the open state; only user actions change it.
 * - The option with aria-selected="true" is the active one; the input's
 *   aria-activedescendant is derived from it. Hidden and disabled options are skipped.
 * - The listbox is a manual popover (top layer, anchored to the input in CSS) and may be
 *   replaced at any time (e.g. by a server swap); the component resyncs on its own.
 * - Picking an option sets the input's value and fires a `change` event on the input.
 */

import { isExpanded, listboxOf, setActive, setExpanded, syncCombobox } from "../keyboard/combobox.js";
import { itemsOf } from "../keyboard/list.js";
import { listenOn } from "../shared.js";

export abstract class ComboboxBase extends HTMLElement {
  #listeners?: AbortController;
  // the listbox (or its options) may be replaced from outside; re-derive state when it is.
  // Mutation records arrive as a microtask, before the next paint, so a new popover
  // never paints closed.
  #swaps = new MutationObserver(() => {
    const { input } = this;
    if (input) syncCombobox(input);
  });

  /**
   * the query changed: show the options that match it, and return the one to highlight
   * (undefined: none, or whoever replaces the options decides)
   */
  protected abstract search(query: string): HTMLElement | undefined;

  get input() {
    return this.querySelector<HTMLInputElement>('input[role="combobox"]');
  }

  /** the listbox the input controls (aria-controls) */
  get listbox() {
    const { input } = this;
    return input ? listboxOf(input) : null;
  }

  connectedCallback() {
    // children may not be parsed yet, so parts are looked up lazily in every handler
    this.#listeners = new AbortController();
    const on = listenOn(this, this.#listeners.signal);
    /** the input, when it is the event's target */
    const inputOf = (event: Event) => (event.target === this.input ? this.input : null);

    on("focusin", (event) => {
      const input = inputOf(event);
      if (input) setExpanded(input, true);
    });
    on("focusout", (event) => {
      const input = inputOf(event);
      if (input) setExpanded(input, false);
    });
    on("input", (event) => {
      const input = inputOf(event);
      if (!input) return;
      // closed and emptied (Escape clears a search field): stays closed; typing opens it
      const open = isExpanded(input) || input.value !== "";
      // the old highlight belongs to the old query; search picks the new one
      setActive(input, this.search(input.value));
      if (open) setExpanded(input, true);
    });
    // keep focus in the input so clicking an option does not blur and close the list first
    on("mousedown", (event) => {
      if (this.listbox?.contains(event.target as Node)) event.preventDefault();
    });
    // a click, or Enter (which clicks the active option)
    on("click", (event) => {
      const { listbox } = this;
      this.#select(listbox ? itemsOf(listbox).find((o) => o.contains(event.target as Node)) : undefined);
    });

    this.#swaps.observe(this, { childList: true, subtree: true });
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#swaps.disconnect();
  }

  #select(option: HTMLElement | undefined) {
    const { input } = this;
    if (!input || !option) return;
    input.value = option.textContent ?? "";
    // the options for the picked text, as if it had been typed
    this.search(input.value);
    setActive(input, option);
    setExpanded(input, false);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
}
