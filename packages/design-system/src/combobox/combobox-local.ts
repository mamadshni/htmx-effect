/**
 * <ds-combobox-local>: a combobox over a short, fixed list that filters its own options in
 * the browser, no server round trip. Same markup as <ds-combobox>; all options are rendered
 * up front and the ones that do not match are hidden.
 *
 *   <ds-combobox-local filter="starts-with">
 *     <input type="search" role="combobox" aria-controls="list-id" aria-expanded="false" />
 *     <ul id="list-id" role="listbox" popover="manual">
 *       <li id="option-id" role="option">…</li>
 *     </ul>
 *   </ds-combobox-local>
 *
 * Matching ignores case and accents ("apf" finds "Äpfel"); an option exactly equal to the
 * query is highlighted. When nothing matches, a "No results" option (aria-disabled) is shown.
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   filter ↔ filter    "contains" (default) | "starts-with": where the query must match
 *   locale ↔ locale    "" = the nearest lang, else the browser's (text: en/de)
 * Shared behaviour (keys, popover, `change` on the input): combobox-base.ts.
 */

import { messagesFor } from "../messages.js";
import { accept, assertIsOneOf, assertIsString, define, reflect, resolveLocale } from "../shared.js";
import { ComboboxBase } from "./combobox-base.js";

namespace Module {
  export const tagName = "ds-combobox-local" as const;

  const FILTERS = ["contains", "starts-with"] as const;
  export type Filter = (typeof FILTERS)[number];

  export class ComboboxLocal extends ComboboxBase {
    static observedAttributes = ["filter", "locale"] as const;

    attributeChangedCallback(
      name: (typeof ComboboxLocal.observedAttributes)[number],
      oldValue: string | null,
      newValue: string | null,
    ) {
      if (newValue === oldValue) return;
      switch (name) {
        case "filter":
          this.filter = (newValue ?? "contains") as Filter;
          break;
        case "locale":
          this.locale = newValue ?? "";
          break;
      }
    }

    // ---- inputs ----

    #filter: Filter = "contains";

    get filter() {
      return this.#filter;
    }
    set filter(value: Filter) {
      if (accept(() => assertIsOneOf(value, FILTERS, `${tagName}.filter`))) this.#filter = value;
      reflect(this, "filter", this.#filter === "contains" ? null : this.#filter);
      this.#refresh();
    }

    #locale = "";

    get locale() {
      return this.#locale;
    }
    set locale(value: string) {
      if (accept(() => assertIsString(value, `${tagName}.locale`))) this.#locale = value;
      reflect(this, "locale", this.#locale);
      this.#refresh();
    }

    // ---- searching ----

    /** the shown "No results" option; made on first need */
    #empty?: HTMLElement;

    get #resolvedLocale() {
      return resolveLocale(this.#locale, this);
    }

    /** text to compare: lower case, without accents */
    #normalize(text: string) {
      return text
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase(this.#resolvedLocale)
        .trim();
    }

    protected search(query: string) {
      const listbox = this.listbox;
      if (!listbox) return undefined;
      const wanted = this.#normalize(query);
      let exact: HTMLElement | undefined;
      let shown = 0;

      for (const option of listbox.querySelectorAll<HTMLElement>('[role="option"]')) {
        if (option === this.#empty) continue;
        const text = this.#normalize(option.textContent ?? "");
        const matches = this.#filter === "starts-with" ? text.startsWith(wanted) : text.includes(wanted);
        option.hidden = !matches;
        if (!matches) continue;
        shown++;
        if (text === wanted && wanted !== "" && option.getAttribute("aria-disabled") !== "true") exact ??= option;
      }

      this.#showEmpty(listbox, shown === 0);
      return exact;
    }

    #showEmpty(listbox: HTMLElement, show: boolean) {
      if (!show) {
        if (this.#empty) this.#empty.hidden = true;
        return;
      }
      if (!this.#empty) {
        this.#empty = document.createElement(listbox.localName === "ul" || listbox.localName === "ol" ? "li" : "div");
        this.#empty.role = "option";
        this.#empty.ariaDisabled = "true";
        this.#empty.id = `${listbox.id || tagName}-empty`;
      }
      this.#empty.textContent = messagesFor(this.#resolvedLocale).noResults;
      this.#empty.hidden = false;
      if (this.#empty.parentElement !== listbox) listbox.append(this.#empty);
    }

    /** an input changed: filter again for what is typed */
    #refresh() {
      const { input } = this;
      if (input) this.search(input.value);
    }
  }
}

define(Module.tagName, Module.ComboboxLocal);

globalThis.DsComboboxLocal = Module.ComboboxLocal;

/** instance type of <ds-combobox-local>: `import type { DsComboboxLocal } from "@combo/design-system/bundle/index.js"` */
export type DsComboboxLocal = Module.ComboboxLocal;
export type ComboboxFilter = Module.Filter;

declare global {
  export import DsComboboxLocal = Module.ComboboxLocal;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsComboboxLocal;
  }
}
