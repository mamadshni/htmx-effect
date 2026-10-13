/**
 * Date helpers on Temporal (the @js-temporal/polyfill): a day is a Temporal.PlainDate, a
 * month a Temporal.PlainYearMonth. No time zones, no Date: a day is just a day.
 *
 * Strings ("YYYY-MM-DD") only exist at the edges: attributes, form values and typed text.
 */

import { Intl as TemporalIntl, Temporal } from "@js-temporal/polyfill";

export { Temporal };

export type PlainDate = Temporal.PlainDate;
export type YearMonth = Temporal.PlainYearMonth;

// ---- parsing (strict: exactly YYYY-MM-DD, a real day) ----

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** the day for "YYYY-MM-DD", undefined for anything else (e.g. 2026-02-30 or 2026-10-12T10:00) */
export const parseDate = (value: string): PlainDate | undefined => {
  if (!ISO_DATE.test(value)) return undefined;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return undefined;
  }
};

export const isIsoDate = (value: string) => parseDate(value) !== undefined;

/** "" or a valid date → the day or null (for inputs that were already checked) */
export const optionalDate = (value: string) => parseDate(value) ?? null;

/** sorted, without duplicates */
const sortedUnique = (dates: PlainDate[]) =>
  [...new Map(dates.map((date) => [date.toString(), date])).values()].sort(Temporal.PlainDate.compare);

/**
 * a typed date or date range: "2026-10-01", "2026-10-01/2026-10-05" (ISO 8601 interval),
 * "2026-10-01 – 2026-10-05" or "2026-10-01 - 2026-10-05"; ends are sorted.
 * Returns undefined for anything else.
 */
export const parseRange = (text: string): [PlainDate, PlainDate] | undefined => {
  const match = /^\s*(\d{4}-\d{2}-\d{2})\s*(?:(?:\/|–|—|\s-\s)\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(text);
  const start = match?.[1] ? parseDate(match[1]) : undefined;
  const end = match?.[2] ? parseDate(match[2]) : start;
  if (!start || !end) return undefined;
  return isAfter(start, end) ? [end, start] : [start, end];
};

/** dates separated by spaces or commas: sorted, without duplicates; undefined if any is invalid */
export const parseDates = (text: string): PlainDate[] | undefined => {
  const dates = text.split(/[\s,]+/).filter(Boolean).map(parseDate);
  return dates.every((date) => date !== undefined) ? sortedUnique(dates) : undefined;
};

/** weekday numbers (0 = Sunday … 6 = Saturday) separated by spaces or commas */
export const parseWeekdays = (text: string) =>
  new Set(
    text
      .split(/[\s,]+/)
      .filter(Boolean) // "" would become 0 (Sunday)
      .map(Number)
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  );

// ---- days ----

export const today = () => Temporal.Now.plainDateISO();

export const isBefore = (a: PlainDate, b: PlainDate) => Temporal.PlainDate.compare(a, b) < 0;
export const isAfter = (a: PlainDate, b: PlainDate) => Temporal.PlainDate.compare(a, b) > 0;

/** is the day before min or after max? */
export const isOutside = (date: PlainDate, min: PlainDate | null, max: PlainDate | null) =>
  Boolean((min && isBefore(date, min)) || (max && isAfter(date, max)));

export const clamp = (date: PlainDate, min: PlainDate | null, max: PlainDate | null) =>
  min && isBefore(date, min) ? min : max && isAfter(date, max) ? max : date;

/** 0 = Sunday … 6 = Saturday (Temporal counts 1 = Monday … 7 = Sunday) */
export const weekdayOf = (date: PlainDate) => date.dayOfWeek % 7;

// ---- months ----

export const firstDayOf = (month: YearMonth) => month.toPlainDate({ day: 1 });

export const lastDayOf = (month: YearMonth) => month.toPlainDate({ day: month.daysInMonth });

/** whole months from one month to another (negative when `to` is earlier) */
export const monthsBetween = (from: YearMonth, to: YearMonth) => from.until(to, { largestUnit: "months" }).months;

/** is the whole month before min or after max? */
export const isMonthOutside = (month: YearMonth, min: PlainDate | null, max: PlainDate | null) =>
  isOutside(lastDayOf(month), min, null) || isOutside(firstDayOf(month), null, max);

// ---- locales ----

/** 0 = Sunday … 6 = Saturday, from the locale when the browser knows it (Monday otherwise) */
export const localeFirstDayOfWeek = (locale: string) => {
  const info = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  const firstDay = (info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1;
  return firstDay % 7; // Intl uses 1 = Monday … 7 = Sunday
};

// the polyfill's DateTimeFormat formats Temporal values (the browser's may not yet)
const formatters = new Map<string, TemporalIntl.DateTimeFormat>();

const formatter = (locale: string, options: Intl.DateTimeFormatOptions) => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new TemporalIntl.DateTimeFormat(locale, options);
    formatters.set(key, cached);
  }
  return cached;
};

/** a month is formatted through its first day: ISO year-months only format in ISO locales */
const dayOf = (value: PlainDate | YearMonth) => (value instanceof Temporal.PlainYearMonth ? firstDayOf(value) : value);

export const format = (value: PlainDate | YearMonth, options: Intl.DateTimeFormatOptions, locale: string) =>
  formatter(locale, options).format(dayOf(value));

export const formatRange = (
  start: PlainDate | YearMonth,
  end: PlainDate | YearMonth,
  options: Intl.DateTimeFormatOptions,
  locale: string,
) => formatter(locale, options).formatRange(dayOf(start), dayOf(end));
