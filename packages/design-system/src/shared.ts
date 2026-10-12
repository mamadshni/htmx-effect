/** Small helpers shared by the components. */

import { isIsoDate, parseDates, parseIso, parseWeekdays, weekdayOf, type IsoDate } from "./calendar/date.js";

// ---- elements ----

export const define = (tag: string, element: CustomElementConstructor) => {
  if (!customElements.get(tag)) customElements.define(tag, element);
};

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

/** write a property back to its attribute; "", null and false remove it */
export const reflect = (element: Element, name: string, value: string | number | boolean | null) => {
  if (value === null || value === false || value === "") element.removeAttribute(name);
  else element.setAttribute(name, value === true ? "" : String(value));
};

// ---- inputs: every property is checked before it is used ----

const fail = (name: string, expected: string, value: unknown): never => {
  throw new TypeError(`${name}: expected ${expected}, got ${JSON.stringify(value)}`);
};

export function assertIsString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string") fail(name, "a string", value);
}

export function assertIsBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== "boolean") fail(name, "a boolean", value);
}

/** a date (YYYY-MM-DD), or "" for none */
export function assertIsDate(value: unknown, name: string): asserts value is IsoDate | "" {
  assertIsString(value, name);
  if (value !== "" && !isIsoDate(value)) fail(name, "a date (YYYY-MM-DD)", value);
}

/** dates (YYYY-MM-DD) separated by spaces or commas */
export function assertIsDateList(value: unknown, name: string): asserts value is string {
  assertIsString(value, name);
  if (!parseDates(value)) fail(name, "dates (YYYY-MM-DD) separated by spaces", value);
}

/** weekdays (0 = Sunday … 6 = Saturday) separated by spaces or commas */
export function assertIsWeekdayList(value: unknown, name: string): asserts value is string {
  assertIsString(value, name);
  if (value.split(/[\s,]+/).some((day) => day !== "" && !/^[0-6]$/.test(day))) {
    fail(name, "weekdays (0-6) separated by spaces", value);
  }
}

export function assertIsInteger(
  value: unknown,
  name: string,
  min: number,
  max: number,
): asserts value is number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(name, `an integer from ${min} to ${max}`, value);
  }
}

export function assertIsOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
  name: string,
): asserts value is T {
  if (!options.includes(value as T)) fail(name, options.join(" | "), value);
}

export function assertIsPredicate(
  value: unknown,
  name: string,
): asserts value is ((date: Date) => boolean) | undefined {
  if (value !== undefined && typeof value !== "function") fail(name, "a function or undefined", value);
}

/** run an input's check: a failing value is reported and the previous one is kept */
export const accept = (check: () => void) => {
  try {
    check();
    return true;
  } catch (error) {
    console.warn(error);
    return false;
  }
};

// ---- dates and locales ----

/** the locale: the given one, else the nearest `lang` (the element, an ancestor, <html>), else the browser's */
export const resolveLocale = (locale: string, element: Element) =>
  locale || element.closest("[lang]")?.getAttribute("lang") || navigator.language;

/** unavailable days: listed dates, weekdays and a predicate. Parse once, then call per day. */
export const unavailableDays = (
  dates: string,
  weekdays: string,
  predicate: ((date: Date) => boolean) | undefined,
) => {
  const dateSet = new Set(parseDates(dates) ?? []);
  const weekdaySet = parseWeekdays(weekdays);
  return (date: IsoDate) =>
    dateSet.has(date) || weekdaySet.has(weekdayOf(date)) || (predicate?.(parseIso(date)!) ?? false);
};
