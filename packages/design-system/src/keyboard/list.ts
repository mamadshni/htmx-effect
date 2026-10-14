/**
 * Keyboard navigation in a list of items: what menus and comboboxes share. Which elements
 * are lists and items, how the arrow keys, Home/End and typing move between items, Enter and
 * Escape, and opening a closed list from its opener.
 *
 * What differs between kinds is passed in as a Navigation: how an item becomes the current
 * one (a menu focuses it; a combobox marks it active and keeps focus in its input), what
 * Enter and Escape do, and keys only that kind has (submenus, a menubar).
 */

export const LIST = ':where([role="listbox"], [role="menu"], [role="menubar"])';

/**
 * Items. Disabled options are skipped (e.g. a combobox's "No results"); disabled menu items
 * stay focusable, as the APG recommends, and are only not activated.
 */
export const ITEM =
  ':where([role="option"]:not([aria-disabled="true"]), [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"]):not([hidden])';

/** the list an item belongs to (not a list around that one, e.g. a menu around a submenu) */
export const listOf = (item: Element) => item.closest<HTMLElement>(LIST);

export const itemsOf = (list: HTMLElement) =>
  Array.from(list.querySelectorAll<HTMLElement>(ITEM)).filter((item) => listOf(item) === list);

/** a menubar is horizontal, other lists vertical, unless aria-orientation says otherwise */
export const isHorizontal = (list: HTMLElement) =>
  (list.getAttribute("aria-orientation") ?? (list.getAttribute("role") === "menubar" ? "horizontal" : "vertical")) ===
  "horizontal";

/** one open list, as one kind (menu, combobox, checkbox panel) navigates it */
export interface Navigation {
  readonly list: HTMLElement;
  /** the items, when they are not the list's ARIA items (e.g. native checkboxes) */
  readonly items?: HTMLElement[];
  /** the current item: focused (menu) or active (combobox); undefined for none yet */
  readonly current: HTMLElement | undefined;
  /** make an item the current one */
  go(item: HTMLElement): void;
  /** Enter on the current item; none: Enter keeps its native meaning */
  activate?(item: HTMLElement): void;
  /** Escape; false (or none) when there is nothing to close here (e.g. a menubar) */
  close?(): boolean;
  /** keys only this kind has; true when the key was used (its default is prevented) */
  more?(event: KeyboardEvent): boolean;
}

/** opens a closed list (a menu button, a collapsed combobox) and returns how to navigate it */
export type Opener = () => Navigation | null;

/** an item's visible name: a form control's label, else its text */
const textOf = (item: HTMLElement) =>
  ((item instanceof HTMLInputElement ? item.labels?.[0]?.textContent : null) ?? item.textContent ?? "").trim();

/** the next item, from the one after `from`, whose text starts with the typed letter */
const typeahead = (items: HTMLElement[], from: number, key: string) => {
  const letter = key.toLocaleLowerCase();
  for (let i = 1; i <= items.length; i++) {
    const item = items[(from + i) % items.length]!;
    if (textOf(item).toLocaleLowerCase().startsWith(letter)) return item;
  }
  return undefined;
};

/** a field that takes typed text: there, Home/End and letters belong to the text */
const TEXT_FIELD = 'textarea, input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"])';

/** a key in an open list; true when it was used */
export const navigate = (event: KeyboardEvent, nav: Navigation) => {
  const { key } = event;
  const items = nav.items ?? itemsOf(nav.list);
  const index = nav.current ? items.indexOf(nav.current) : -1;
  // from no current item: forward goes to the first, backward to the last
  const step = (by: 1 | -1) =>
    index < 0 ? (by > 0 ? items[0] : items.at(-1)) : items[(index + by + items.length) % items.length];
  const typing = event.target instanceof Element && event.target.matches(TEXT_FIELD);
  // arrows follow the orientation and, across, the reading direction
  const rtl = nav.list.matches(":dir(rtl)");
  const [backward, forward] = isHorizontal(nav.list)
    ? rtl
      ? ["ArrowRight", "ArrowLeft"]
      : ["ArrowLeft", "ArrowRight"]
    : ["ArrowUp", "ArrowDown"];

  const target =
    key === forward
      ? step(1)
      : key === backward
        ? step(-1)
        : !typing && key === "Home"
          ? items[0]
          : !typing && key === "End"
            ? items.at(-1)
            : undefined;
  if (target) {
    nav.go(target);
    return true;
  }
  if (key === "Enter" && nav.current && nav.activate) {
    nav.activate(nav.current);
    return true;
  }
  if (key === "Escape") return nav.close?.() ?? false;
  if (nav.more?.(event)) return true;
  if (!typing && key.length === 1 && key !== " " && !event.ctrlKey && !event.metaKey && !event.altKey) {
    const match = typeahead(items, index, key);
    if (match) nav.go(match);
    return match !== undefined;
  }
  return false;
};

/** ArrowDown/ArrowUp on an opener: open the list on its current item, else the first/last; true when used */
export const openWith = (event: KeyboardEvent, open: Opener) => {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
  const nav = open();
  if (!nav) return false;
  const items = nav.items ?? itemsOf(nav.list);
  const item = nav.current ?? (event.key === "ArrowDown" ? items[0] : items.at(-1));
  if (item) nav.go(item);
  return true;
};
