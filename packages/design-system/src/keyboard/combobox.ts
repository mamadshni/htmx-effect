/**
 * Comboboxes with a listbox popup (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/):
 * the ARIA state, and their Navigation for list.ts. Focus stays in the input; the active
 * option is the one with aria-selected="true", announced through aria-activedescendant.
 *
 *   <input role="combobox" aria-controls="list-id" aria-expanded="false">
 *   <ul id="list-id" role="listbox" popover="manual"><li id="…" role="option">…</li></ul>
 *
 * The state helpers are shared with <ds-combobox>, which adds the rest (opening on focus,
 * filtering on input, picking with the mouse, resyncing after swaps).
 */

import { itemsOf, type Navigation, type Opener } from "./list.js";

/** the listbox a combobox controls; null when it controls something else (e.g. a dialog) */
export const listboxOf = (input: Element) => {
  const id = input.getAttribute("aria-controls");
  const listbox = id ? document.getElementById(id) : null;
  return listbox?.getAttribute("role") === "listbox" ? listbox : null;
};

const activeOf = (listbox: HTMLElement) => itemsOf(listbox).find((o) => o.getAttribute("aria-selected") === "true");

export const isExpanded = (input: Element) => input.getAttribute("aria-expanded") === "true";

/** derive the popover's visibility and aria-activedescendant from aria-expanded and aria-selected */
export const syncCombobox = (input: HTMLElement) => {
  const listbox = listboxOf(input);
  const expanded = isExpanded(input);
  if (listbox?.isConnected) {
    listbox.popover ||= "manual";
    listbox.togglePopover(expanded);
  }
  const active = expanded && listbox ? activeOf(listbox) : undefined;
  if (active) {
    input.setAttribute("aria-activedescendant", active.id);
    active.scrollIntoView({ block: "nearest" });
  } else {
    input.removeAttribute("aria-activedescendant");
  }
};

export const setExpanded = (input: HTMLElement, expanded: boolean) => {
  input.setAttribute("aria-expanded", String(expanded));
  syncCombobox(input);
};

/** make an option the active one (none: undefined) */
export const setActive = (input: HTMLElement, option?: HTMLElement) => {
  const listbox = listboxOf(input);
  for (const o of listbox ? itemsOf(listbox) : []) {
    if (o === option) o.setAttribute("aria-selected", "true");
    else o.removeAttribute("aria-selected");
  }
  syncCombobox(input);
};

/** the combobox input an event is on, with its listbox */
const comboboxOf = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "combobox") return null;
  const listbox = listboxOf(target);
  return listbox ? { input: target, listbox } : null;
};

/** an expanded combobox's list; an option is picked by a click on it (Enter clicks the active one) */
export const comboboxNavigation = (target: EventTarget | null): Navigation | null => {
  const combobox = comboboxOf(target);
  if (!combobox || !isExpanded(combobox.input)) return null;
  const { input, listbox } = combobox;
  return {
    list: listbox,
    current: activeOf(listbox),
    go: (option) => setActive(input, option),
    activate: (option) => option.click(),
    // close the list first; a second Escape goes on (clears a search field, closes a dialog)
    close: () => {
      setExpanded(input, false);
      return true;
    },
    more: (event) => {
      // the caret moves as usual; visual focus goes back to the input
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") setActive(input);
      return false;
    },
  };
};

/** a collapsed combobox opens its list (keeping an option the server pre-selected) */
export const comboboxOpener = (target: EventTarget | null): Opener | null => {
  const combobox = comboboxOf(target);
  if (!combobox || isExpanded(combobox.input)) return null;
  return () => {
    setExpanded(combobox.input, true);
    return comboboxNavigation(combobox.input);
  };
};
