/**
 * <ds-combobox>: behaviour for server-rendered combobox markup. Light DOM only; it renders
 * nothing and finds its parts by role, so the server owns the content.
 * Styles live in combobox.css.
 *
 *   <ds-combobox>
 *     <input type="search" role="combobox" aria-controls="list-id" aria-expanded="false" />
 *     <ul id="list-id" role="listbox" popover="manual">
 *       <li id="option-id" role="option">…</li>
 *       <!-- or, when nothing matches, an empty state that cannot be picked: -->
 *       <li id="empty-id" role="option" aria-disabled="true">No results</li>
 *     </ul>
 *   </ds-combobox>
 *
 * - aria-expanded on the input is the open state; only user actions change it.
 * - The option with aria-selected="true" is the active one (the server may pre-select it);
 *   the input's aria-activedescendant is derived from it.
 * - The listbox is a manual popover (top layer, anchored to the input in CSS) and may be
 *   replaced at any time (e.g. by a server swap); the component resyncs on its own.
 * - Picking an option sets the input's value and fires a `change` event on the input.
 */

namespace Module {
  export class Combobox extends HTMLElement {
    #listeners?: AbortController;
    // the listbox (or its options) may be replaced from outside; re-derive state when it is.
    // Mutation records arrive as a microtask, before the next paint, so a new popover
    // never paints closed.
    #swaps = new MutationObserver(() => this.#sync());
    // type="search" clears itself on Escape; that clear must not reopen the list
    #clearedByEscape = false;

    get input() {
      return this.querySelector<HTMLInputElement>('input[role="combobox"]');
    }

    get listbox() {
      return this.querySelector<HTMLElement>('[role="listbox"]');
    }

    get #options() {
      return Array.from(
        this.listbox?.querySelectorAll<HTMLElement>(
          '[role="option"]:not([aria-disabled="true"])',
        ) ?? [],
      );
    }

    get #selected() {
      return this.#options.find((o) => o.getAttribute("aria-selected") === "true");
    }

    get #expanded() {
      return this.input?.getAttribute("aria-expanded") === "true";
    }

    connectedCallback() {
      // children may not be parsed yet, so parts are looked up lazily in every handler
      this.#listeners = new AbortController();
      const { signal } = this.#listeners;
      const on = <K extends keyof HTMLElementEventMap>(
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
      ) => this.addEventListener(type, handler, { signal });

      on("keydown", (event) => this.#onKeyDown(event));
      on("focusin", (event) => {
        if (event.target === this.input) this.#setExpanded(true);
      });
      on("focusout", (event) => {
        if (event.target === this.input) this.#setExpanded(false);
      });
      on("input", (event) => {
        if (event.target !== this.input) return;
        // the current highlight belongs to the old query; the response decides the new one
        this.#setActive();
        if (this.#clearedByEscape) this.#clearedByEscape = false;
        else this.#setExpanded(true);
      });
      // keep focus in the input so clicking an option does not blur and close the list first
      on("mousedown", (event) => {
        if (this.listbox?.contains(event.target as Node)) event.preventDefault();
      });
      on("click", (event) => {
        this.#select(this.#options.find((o) => o.contains(event.target as Node)));
      });

      this.#swaps.observe(this, { childList: true, subtree: true });
    }

    disconnectedCallback() {
      this.#listeners?.abort();
      this.#swaps.disconnect();
    }

    /** derive popover visibility and aria-activedescendant from aria-expanded + the listbox */
    #sync() {
      const { input, listbox } = this;
      if (!input) return;
      const expanded = this.#expanded;

      if (listbox?.isConnected) {
        listbox.popover ||= "manual";
        listbox.togglePopover(expanded);
      }

      const active = expanded ? this.#selected : undefined;
      if (active) {
        input.setAttribute("aria-activedescendant", active.id);
        active.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    #setExpanded(expanded: boolean) {
      this.input?.setAttribute("aria-expanded", String(expanded));
      this.#sync();
    }

    #setActive(option?: HTMLElement) {
      for (const o of this.#options) {
        if (o === option) o.setAttribute("aria-selected", "true");
        else o.removeAttribute("aria-selected");
      }
      this.#sync();
    }

    #select(option: HTMLElement | undefined) {
      const { input } = this;
      if (!input || !option) return;
      input.value = option.textContent ?? "";
      this.#setActive(option);
      this.#setExpanded(false);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    #onKeyDown(event: KeyboardEvent) {
      const { input } = this;
      if (event.target !== input || !input) return;
      this.#clearedByEscape = false;

      if (!this.#expanded) {
        if (event.key === "ArrowDown") {
          // APG: Down Arrow opens the popup and moves into it (keeps a pre-selected option)
          event.preventDefault();
          this.#setActive(this.#selected ?? this.#options[0]);
          this.#setExpanded(true);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          this.#setExpanded(true);
        } else if (event.key === "Escape" && input.value !== "") {
          this.#clearedByEscape = true;
        }
        return;
      }

      if (event.key === "Escape") {
        // close the list first; a second Escape bubbles up (e.g. closes a dialog)
        event.preventDefault();
        this.#setExpanded(false);
        return;
      }

      const options = this.#options;
      if (options.length === 0) return;

      const selected = this.#selected;
      const current = selected ? options.indexOf(selected) : -1;

      switch (event.key) {
        case "ArrowDown":
          event.preventDefault();
          this.#setActive(options[(current + 1) % options.length]);
          break;
        case "ArrowUp":
          event.preventDefault();
          this.#setActive(options[current <= 0 ? options.length - 1 : current - 1]);
          break;
        case "Enter":
          if (current < 0) return;
          event.preventDefault();
          this.#select(options[current]);
          break;
        case "ArrowLeft":
        case "ArrowRight":
          // APG: visual focus returns to the input; the caret moves as usual
          this.#setActive();
          break;
      }
    }
  }
}

if (!customElements.get("ds-combobox")) {
  customElements.define("ds-combobox", Module.Combobox);
}

globalThis.DsCombobox = Module.Combobox;

/** instance type of <ds-combobox>: `import type { DsCombobox } from "@combo/design-system/bundle/index.js"` */
export type DsCombobox = Module.Combobox;

declare global {
  export import DsCombobox = Module.Combobox;

  interface HTMLElementTagNameMap {
    "ds-combobox": DsCombobox;
  }
}
