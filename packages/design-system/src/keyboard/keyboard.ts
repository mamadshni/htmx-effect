/**
 * Keyboard navigation for the whole page, by event delegation: one set of listeners on the
 * document handles every menu, combobox and checkbox panel, including ones added later.
 * list.ts moves between items for all; menu.ts, combobox.ts and checkboxes.ts only say how
 * their kind differs.
 * Components keep only the behaviour that is not about keys.
 *
 * Listeners run when the event reaches the document, so a page's own handler can take a key
 * first with preventDefault().
 */

import { checkboxNavigation, checkboxPanelOpener } from "./checkboxes.js";
import { comboboxNavigation, comboboxOpener } from "./combobox.js";
import { navigate, openWith } from "./list.js";
import { menuNavigation, menuOpener, onMenuClick, onMenuFocusIn, onMenuToggle } from "./menu.js";

const onKeyDown = (event: KeyboardEvent) => {
  if (event.defaultPrevented) return;
  const { target } = event;
  // in an open list, or on what opens one
  const nav = menuNavigation(target) ?? comboboxNavigation(target) ?? checkboxNavigation(target);
  const open = nav ? null : (menuOpener(target) ?? comboboxOpener(target) ?? checkboxPanelOpener(target));
  const used = nav ? navigate(event, nav) : open ? openWith(event, open) : false;
  if (used) event.preventDefault();
};

// once per page, even if the bundle is loaded twice
const installed = Symbol.for("@combo/design-system/keyboard");
const page = globalThis as typeof globalThis & { [installed]?: true };

if (!page[installed]) {
  page[installed] = true;
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("click", onMenuClick);
  document.addEventListener("focusin", onMenuFocusIn);
  // toggle does not bubble
  document.addEventListener("toggle", onMenuToggle, true);
}
