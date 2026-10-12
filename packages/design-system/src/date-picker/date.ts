/**
 * Pure helpers for ISO dates (YYYY-MM-DD). All math is done in UTC so local
 * daylight-saving changes never shift a day.
 */

export type IsoDate = string;

const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

export const toIso = (date: Date): IsoDate =>
  `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export const fromParts = (year: number, month: number, day: number): IsoDate =>
  toIso(new Date(Date.UTC(year, month, day)));

/** the Date for a valid ISO date, undefined otherwise (rejects e.g. 2026-02-30) */
export const parseIso = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return toIso(date) === value ? date : undefined;
};

export const isIsoDate = (value: string): value is IsoDate => parseIso(value) !== undefined;

/** year, month (0-11), day of a valid ISO date */
export const partsOf = (iso: IsoDate) => {
  const date = parseIso(iso)!;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth(), day: date.getUTCDate() };
};

export const todayIso = (): IsoDate => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

export const daysInMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

export const addDays = (iso: IsoDate, days: number) =>
  toIso(new Date(parseIso(iso)!.getTime() + days * DAY_MS));

/** keeps the day of month, clamped to the target month's length */
export const addMonths = (iso: IsoDate, months: number) => {
  const { year, month, day } = partsOf(iso);
  const target = new Date(Date.UTC(year, month + months, 1));
  const lastDay = daysInMonth(target.getUTCFullYear(), target.getUTCMonth());
  return fromParts(target.getUTCFullYear(), target.getUTCMonth(), Math.min(day, lastDay));
};

export const addYears = (iso: IsoDate, years: number) => addMonths(iso, years * 12);

/** does any day of [start, end] fall inside [min, max]? (ISO strings compare correctly) */
export const overlaps = (start: IsoDate, end: IsoDate, min: IsoDate | null, max: IsoDate | null) =>
  !(min && end < min) && !(max && start > max);

/**
 * a typed date or date range: "2026-10-01", "2026-10-01/2026-10-05" (ISO 8601 interval),
 * "2026-10-01 – 2026-10-05" or "2026-10-01 - 2026-10-05"; ends are sorted.
 * Returns undefined for anything else.
 */
export const parseRange = (text: string): [IsoDate, IsoDate] | undefined => {
  const match = /^\s*(\d{4}-\d{2}-\d{2})\s*(?:(?:\/|–|—|\s-\s)\s*(\d{4}-\d{2}-\d{2}))?\s*$/.exec(text);
  const start = match?.[1];
  const end = match?.[2] ?? start;
  if (!start || !end || !isIsoDate(start) || !isIsoDate(end)) return undefined;
  return start <= end ? [start, end] : [end, start];
};

export const clamp = (iso: IsoDate, min: IsoDate | null, max: IsoDate | null) =>
  min && iso < min ? min : max && iso > max ? max : iso;

/** 0 = Sunday … 6 = Saturday, from the user's locale when the browser knows it */
export const firstDayOfWeek = (() => {
  const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay ?? 1;
  return firstDay % 7; // Intl uses 1 = Monday … 7 = Sunday
})();

export const format = (options: Intl.DateTimeFormatOptions) => {
  const formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: "UTC" });
  return (iso: IsoDate) => formatter.format(parseIso(iso));
};
