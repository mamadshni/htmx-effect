/**
 * Menus (https://www.w3.org/WAI/ARIA/apg/patterns/menubar/ and menu-button/): every
 * [popover][role="menu"] and [role="menubar"] on the page, with their items
 * [role="menuitem"], [role="menuitemradio"] and [role="menuitemcheckbox"]. No setup: the
 * listeners are on the document (see keyboard.ts), so menus added later (e.g. by a server
 * swap) just work.
 *
 *   <button popovertarget="actions">Actions</button>
 *   <div id="actions" popover role="menu">
 *     <button role="menuitem">Edit</button>
 *     <button role="menuitem" popovertarget="share" aria-haspopup="menu">Share</button>
 *     <div id="share" popover role="menu">…</div>
 *     <div role="separator"></div>
 *     <button role="menuitemcheckbox" aria-checked="false">Show hidden</button>
 *     <div role="group" aria-label="Sort"><button role="menuitemradio" aria-checked="true">Name</button>…</div>
 *   </div>
 *
 * A submenu goes inside its parent menu (then menu.css opens it beside its item).
 * - Opening a menu focuses its first item (ArrowUp on the button: the last).
 * - In a menu: ArrowDown/ArrowUp (menubar: ArrowRight/ArrowLeft) move and wrap, Home/End,
 *   a letter moves to the next item starting with it.
 * - Enter (and Space) clicks an item and closes the menus; Space on a checkbox or radio item
 *   only toggles it. Items with a submenu (popovertarget, commandfor or aria-controls naming
 *   a menu popover) open it with Enter, Space or ArrowRight; ArrowLeft and Escape close it.
 * - Escape closes a menu and focuses what opened it; Tab closes all and moves on.
 * - In a menubar, ArrowRight/ArrowLeft inside an open menu move to the next/previous menu;
 *   the bar keeps one tab stop (roving tabindex).
 * - Clicking a menuitemcheckbox toggles aria-checked; a menuitemradio checks itself and
 *   unchecks the others of its group (role="group", else the menu).
 * - Items with aria-disabled="true" can be focused, not activated.
 */

import { ITEM, isHorizontal, itemsOf, listOf, type Navigation, type Opener } from "./list.js";

const MENU = ':where([role="menu"], [role="menubar"])';
const MENU_POPOVER = ':where([role="menu"][popover])';

// ---- structure ----

/** the menu (or menubar) an item belongs to */
const menuOf = (item: Element) => {
  const list = listOf(item);
  return list?.matches(MENU) ? list : null;
};

const isPopover = (menu: HTMLElement) => menu.matches(MENU_POPOVER);
const isOpen = (menu: HTMLElement) => menu.matches(":popover-open");
const isToggle = (item: Element) => item.matches('[role="menuitemcheckbox"], [role="menuitemradio"]');
const isDisabled = (item: Element) => item.getAttribute("aria-disabled") === "true";

/** the menu popover a button or item opens */
const submenuOf = (element: Element) => {
  const id = element.getAttribute("popovertarget") ?? element.getAttribute("commandfor") ?? element.getAttribute("aria-controls");
  const menu = id ? document.getElementById(id) : null;
  return menu?.matches(MENU_POPOVER) ? menu : null;
};

/** what opens a menu popover: its invoker, or the element that names it in aria-controls */
const openerOf = (menu: HTMLElement) => {
  if (!menu.id) return null;
  const id = CSS.escape(menu.id);
  return document.querySelector<HTMLElement>(`[popovertarget="${id}"], [commandfor="${id}"], [aria-controls="${id}"]`);
};

/** the menu that a submenu's opener sits in (null for a menu opened by a plain button) */
const parentMenuOf = (menu: HTMLElement) => {
  const opener = openerOf(menu);
  return opener?.matches(ITEM) ? menuOf(opener) : null;
};

/** the outermost menu popover of a chain of submenus */
const rootOf = (menu: HTMLElement) => {
  let root = menu;
  for (let parent = parentMenuOf(root); parent && isPopover(parent); parent = parentMenuOf(parent)) root = parent;
  return root;
};

// ---- focus ----

/** a menubar has one tab stop: the item last focused */
const rove = (item: HTMLElement) => {
  const menu = menuOf(item);
  if (menu?.getAttribute("role") !== "menubar") return;
  for (const other of itemsOf(menu)) other.tabIndex = other === item ? 0 : -1;
};

const focusItem = (item: HTMLElement | undefined) => {
  if (!item) return;
  item.focus();
  rove(item);
};

/** items are focused by the arrow keys, not by Tab */
const prepare = (menu: HTMLElement) => {
  for (const item of itemsOf(menu)) if (!item.hasAttribute("tabindex")) item.tabIndex = -1;
};

// ---- opening and closing ----

const showMenu = (menu: HTMLElement, opener: HTMLElement) => {
  if (!isOpen(menu)) {
    // through the invoker when there is one: that nests the popover in its opener's
    if (opener.matches("[popovertarget], [commandfor]")) opener.click();
    else menu.showPopover();
  }
  rove(opener);
  prepare(menu);
};

const openMenu = (menu: HTMLElement, opener: HTMLElement, focus: "first" | "last") => {
  showMenu(menu, opener);
  const items = itemsOf(menu);
  focusItem(focus === "first" ? items[0] : items.at(-1));
};

/** close one menu and focus what opened it */
const closeMenu = (menu: HTMLElement) => {
  if (isOpen(menu)) menu.hidePopover();
  const opener = openerOf(menu);
  if (opener) focusItem(opener);
};

/** close a menu and the menus it was opened from */
const closeAll = (menu: HTMLElement) => {
  const root = rootOf(menu);
  for (let current: HTMLElement | null = menu; current && isPopover(current); current = parentMenuOf(current)) {
    if (isOpen(current)) current.hidePopover();
    if (current === root) break;
  }
  const opener = openerOf(root);
  if (opener) focusItem(opener);
};

/** inside a menubar's menu: close it and open the next (step 1) or previous (-1) one */
const moveInMenubar = (menu: HTMLElement, step: number) => {
  const opener = openerOf(rootOf(menu));
  const bar = opener && menuOf(opener);
  if (!opener || bar?.getAttribute("role") !== "menubar") return false;
  closeAll(menu);
  const items = itemsOf(bar);
  const next = items[(items.indexOf(opener) + step + items.length) % items.length];
  const submenu = next && submenuOf(next);
  if (next && submenu) openMenu(submenu, next, "first");
  else focusItem(next);
  return true;
};

/** Enter or Space on an item: open its submenu, or click it */
const activate = (item: HTMLElement, menu: HTMLElement, close: boolean) => {
  if (isDisabled(item)) return;
  const submenu = submenuOf(item);
  if (submenu) {
    openMenu(submenu, item, "first");
    return;
  }
  item.click(); // a plain menuitem closes the menus on click (onMenuClick)
  if (close && isToggle(item) && isPopover(menu)) closeAll(menu);
};

// ---- navigation (list.ts does the moving) ----

/** the keys only menus have: Space, submenus, the menubar, Tab */
const menuKeys = (event: KeyboardEvent, item: HTMLElement, menu: HTMLElement) => {
  const { key } = event;
  const horizontal = isHorizontal(menu);
  const rtl = item.matches(":dir(rtl)");
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const backward = rtl ? "ArrowRight" : "ArrowLeft";
  const submenu = submenuOf(item);

  if (key === " ") {
    activate(item, menu, !isToggle(item));
    return true;
  }
  if (key === "Tab") {
    // close everything; Tab itself moves on from the opener
    if (isPopover(menu)) closeAll(menu);
    return false;
  }
  if (horizontal) {
    if (!submenu || (key !== "ArrowDown" && key !== "ArrowUp")) return false;
    openMenu(submenu, item, key === "ArrowDown" ? "first" : "last");
    return true;
  }
  if (key === forward) {
    if (!submenu) return moveInMenubar(menu, 1);
    openMenu(submenu, item, "first");
    return true;
  }
  if (key === backward) {
    const parent = parentMenuOf(menu);
    if (!parent || isHorizontal(parent)) return moveInMenubar(menu, -1);
    closeMenu(menu);
    return true;
  }
  return false;
};

const navigation = (menu: HTMLElement, current: HTMLElement | undefined): Navigation => ({
  list: menu,
  current,
  go: focusItem,
  activate: (item) => activate(item, menu, true),
  close: () => {
    if (!isPopover(menu)) return false;
    closeMenu(menu);
    return true;
  },
  more: (event) => (current ? menuKeys(event, current, menu) : false),
});

/** a focused menu item */
export const menuNavigation = (target: EventTarget | null): Navigation | null => {
  const item = target instanceof HTMLElement ? target.closest<HTMLElement>(ITEM) : null;
  const menu = item && menuOf(item);
  return item && menu ? navigation(menu, item) : null;
};

/** a menu button (Enter and Space click it, which opens the menu too) */
export const menuOpener = (target: EventTarget | null): Opener | null => {
  const submenu = target instanceof HTMLElement ? submenuOf(target) : null;
  if (!submenu) return null;
  return () => {
    showMenu(submenu, target as HTMLElement);
    return navigation(submenu, undefined);
  };
};

// ---- other delegated events ----

export const onMenuClick = (event: MouseEvent) => {
  const item = (event.target as Element).closest<HTMLElement>(ITEM);
  const menu = item && menuOf(item);
  if (!item || !menu) return;
  if (isDisabled(item)) {
    event.preventDefault();
    return;
  }
  const role = item.getAttribute("role");
  if (role === "menuitemcheckbox") {
    item.setAttribute("aria-checked", String(item.getAttribute("aria-checked") !== "true"));
  } else if (role === "menuitemradio") {
    const group = item.closest('[role="group"]');
    const scope = group && menu.contains(group) ? group : menu;
    for (const radio of scope.querySelectorAll('[role="menuitemradio"]')) {
      if (menuOf(radio) === menu) radio.setAttribute("aria-checked", String(radio === item));
    }
  } else if (!submenuOf(item) && isPopover(menu)) {
    closeAll(menu);
  }
};

/** a menu popover opened (also with the mouse): focus its first item */
export const onMenuToggle = (event: Event) => {
  const menu = event.target;
  if (!(menu instanceof HTMLElement) || !menu.matches(MENU_POPOVER)) return;
  if ((event as ToggleEvent).newState !== "open" || menu.contains(document.activeElement)) return;
  prepare(menu);
  focusItem(itemsOf(menu)[0]);
};

/** focus entered a menubar: it becomes the bar's tab stop */
export const onMenuFocusIn = (event: FocusEvent) => {
  const item = event.target instanceof HTMLElement ? event.target.closest<HTMLElement>(ITEM) : null;
  if (item) rove(item);
};
