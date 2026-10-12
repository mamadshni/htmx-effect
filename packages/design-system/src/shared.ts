/** Small helpers shared by the components. */

import { isIsoDate, parseDates, parseIso, parseWeekdays, weekdayOf, type IsoDate } from "./calendar/date.js";

export type Listen = <K extends keyof HTMLElementEventMap>(
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
) => void;

/** an `addEventListener` for the element whose listeners all go away when `signal` aborts */
export const listenOn =
  (element: HTMLElement, signal: AbortSignal): Listen =>
  (type, handler) =>
    element.addEventListener(type, handler, { signal });

/** set an ARIA state to "true", or remove it */
export const setAria = (element: Element | null, name: `aria-${string}`, on: boolean) => {
  if (on) element?.setAttribute(name, "true");
  else element?.removeAttribute(name);
};

export const define = (tag: string, element: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, element);
};

/** an ISO date attribute (min, max, today, …), or null when missing or invalid */
export const dateAttribute = (element: Element, name: string): IsoDate | null => {
  const value = element.getAttribute(name);
  return value && isIsoDate(value) ? value : null;
};

/**
 * Unavailable days from the `disallowed` (dates) and `disallowed-weekdays` (0 = Sunday … 6)
 * attributes plus an optional predicate. Parse once, then call per day.
 */
export const unavailableDays = (element: Element, predicate?: ((date: Date) => boolean) | undefined) => {
  const dates = new Set(parseDates(element.getAttribute("disallowed") ?? "") ?? []);
  const weekdays = parseWeekdays(element.getAttribute("disallowed-weekdays") ?? "");
  return (date: IsoDate) =>
    dates.has(date) || weekdays.has(weekdayOf(date)) || (predicate?.(parseIso(date)!) ?? false);
};
