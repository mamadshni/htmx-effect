/**
 * Checkboxes in a popover panel (e.g. a filter disclosure): arrow keys on top of the native
 * behaviour. Nothing changes roles; Tab, Space, Enter (the form's default button) and Escape
 * (closes the popover) stay native. Screen readers in browse mode keep their own arrow keys.
 *
 *   <button popovertarget="filters">Filters</button>
 *   <fieldset id="filters" popover>
 *     <legend>Show tasks that are</legend>
 *     <label><input type="checkbox" name="filter" value="open"> Open</label> …
 *   </fieldset>
 *
 * - ArrowDown/ArrowUp move to the next/previous checkbox of the same fieldset (or popover),
 *   wrapping; Home/End; a letter moves to the next checkbox whose label starts with it.
 * - ArrowDown/ArrowUp on the popover's button open it on the first/last checkbox.
 * Radio buttons are left alone: they have arrow keys of their own.
 */

import { LIST, type Navigation, type Opener } from "./list.js";

const CHECKBOX = 'input[type="checkbox"]:not(:disabled)';

/** a popover that is not a menu or listbox (those have their own navigation) */
const panelOf = (element: Element) => {
  const popover = element.closest<HTMLElement>("[popover]");
  return popover && !popover.matches(LIST) ? popover : null;
};

/** a checkbox's group: its fieldset inside the panel, else the panel */
const groupOf = (checkbox: Element) => {
  const panel = panelOf(checkbox);
  const fieldset = checkbox.closest<HTMLElement>("fieldset");
  return panel && fieldset && panel.contains(fieldset) ? fieldset : panel;
};

const checkboxesOf = (group: HTMLElement) =>
  Array.from(group.querySelectorAll<HTMLElement>(CHECKBOX)).filter((box) => groupOf(box) === group);

const navigation = (group: HTMLElement, current: HTMLElement | undefined): Navigation => ({
  list: group,
  items: checkboxesOf(group),
  current,
  go: (checkbox) => checkbox.focus(),
});

/** a focused checkbox in a popover panel */
export const checkboxNavigation = (target: EventTarget | null): Navigation | null => {
  if (!(target instanceof HTMLInputElement) || !target.matches(CHECKBOX)) return null;
  const group = groupOf(target);
  return group ? navigation(group, target) : null;
};

/** the button of a popover panel with checkboxes */
export const checkboxPanelOpener = (target: EventTarget | null): Opener | null => {
  if (!(target instanceof HTMLButtonElement)) return null;
  const id = target.getAttribute("popovertarget");
  const panel = id ? document.getElementById(id) : null;
  const first = panel?.matches("[popover]") ? panel.querySelector<HTMLElement>(CHECKBOX) : null;
  const group = first && groupOf(first);
  if (!panel || !group) return null;
  return () => {
    if (!panel.matches(":popover-open")) target.click();
    return navigation(group, undefined);
  };
};
