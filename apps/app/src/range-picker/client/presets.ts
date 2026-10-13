/**
 * Relative date ranges for the sidebar ("this week", "last month", "June 2026" …), and the
 * text in English and German. Browser code; pure functions of `today`.
 */

import { Intl as TemporalIntl, Temporal } from "@js-temporal/polyfill";

export type PlainDate = Temporal.PlainDate;

/** a range of days; null for "all time" (no limit) */
export type Range = { readonly start: PlainDate; readonly end: PlainDate } | null;

export interface Preset {
  /** stable id, kept in the `preset` attribute: the range is recomputed from it every day */
  readonly id: string;
  readonly label: string;
  readonly range: Range;
}

export interface Messages {
  thisWeek: string;
  lastWeek: string;
  thisMonth: string;
  lastMonth: string;
  thisYear: string;
  lastYear: string;
  all: string;
  cancel: string;
  apply: string;
  placeholder: string;
  presets: string;
  previous: string;
  next: string;
}

const en: Messages = {
  thisWeek: "This week",
  lastWeek: "Last week",
  thisMonth: "This month",
  lastMonth: "Last month",
  thisYear: "This year",
  lastYear: "Last year",
  all: "All time",
  cancel: "Cancel",
  apply: "Apply",
  placeholder: "Choose a period",
  presets: "Quick select",
  previous: "Previous months",
  next: "Next months",
};

const de: Messages = {
  thisWeek: "Diese Woche",
  lastWeek: "Letzte Woche",
  thisMonth: "Diesen Monat",
  lastMonth: "Letzter Monat",
  thisYear: "Dieses Jahr",
  lastYear: "Letztes Jahr",
  all: "Alle",
  cancel: "Abbrechen",
  apply: "Übernehmen",
  placeholder: "Zeitraum wählen",
  presets: "Schnellauswahl",
  previous: "Vorherige Monate",
  next: "Nächste Monate",
};

export const messagesFor = (locale: string) => (locale.toLowerCase().startsWith("de") ? de : en);

/** 0 = Sunday … 6 = Saturday, from the locale (Monday when the browser does not know) */
export const firstDayOfWeek = (locale: string) => {
  const info = new Intl.Locale(locale) as Intl.Locale & {
    getWeekInfo?: () => { firstDay: number };
    weekInfo?: { firstDay: number };
  };
  return ((info.getWeekInfo?.() ?? info.weekInfo)?.firstDay ?? 1) % 7;
};

/** months listed by name after "last month" */
const EXTRA_MONTHS = 4;

/** the presets for a day; ranges never go past `today` (the future is not selectable) */
export const presetsFor = (today: PlainDate, locale: string): Preset[] => {
  const t = messagesFor(locale);
  const upToToday = (start: PlainDate, end: PlainDate): Range => ({
    start,
    end: Temporal.PlainDate.compare(end, today) > 0 ? today : end,
  });
  const week = (date: PlainDate) => {
    // days since the locale's first day of the week (Temporal: 1 = Monday … 7 = Sunday)
    const start = date.subtract({ days: (date.dayOfWeek - firstDayOfWeek(locale) + 7) % 7 });
    return upToToday(start, start.add({ days: 6 }));
  };
  const month = (yearMonth: Temporal.PlainYearMonth) =>
    upToToday(yearMonth.toPlainDate({ day: 1 }), yearMonth.toPlainDate({ day: yearMonth.daysInMonth }));
  const year = (y: number) => upToToday(Temporal.PlainDate.from({ year: y, month: 1, day: 1 }), Temporal.PlainDate.from({ year: y, month: 12, day: 31 }));

  const thisMonth = today.toPlainYearMonth();
  const monthName = new TemporalIntl.DateTimeFormat(locale, { month: "short", year: "numeric" });

  return [
    { id: "this-week", label: t.thisWeek, range: week(today) },
    { id: "last-week", label: t.lastWeek, range: week(today.subtract({ weeks: 1 })) },
    { id: "this-month", label: t.thisMonth, range: month(thisMonth) },
    { id: "last-month", label: t.lastMonth, range: month(thisMonth.subtract({ months: 1 })) },
    ...Array.from({ length: EXTRA_MONTHS }, (_, i) => {
      const yearMonth = thisMonth.subtract({ months: i + 2 });
      return {
        id: `month-${yearMonth}`, // e.g. month-2026-06: a fixed month, not relative
        label: monthName.format(yearMonth.toPlainDate({ day: 1 })),
        range: month(yearMonth),
      };
    }),
    { id: "this-year", label: t.thisYear, range: year(today.year) },
    { id: "last-year", label: t.lastYear, range: year(today.year - 1) },
    { id: "all", label: t.all, range: null },
  ];
};

/** "start/end" (ISO 8601 interval) or "" for all time */
export const toValue = (range: Range) => (range ? `${range.start}/${range.end}` : "");

/** the range of a value; undefined when it is not a valid "start/end" */
export const fromValue = (value: string): Range | undefined => {
  if (value === "") return null;
  const match = /^(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})$/.exec(value);
  if (!match) return undefined;
  try {
    const start = Temporal.PlainDate.from(match[1]!, { overflow: "reject" });
    const end = Temporal.PlainDate.from(match[2]!, { overflow: "reject" });
    return Temporal.PlainDate.compare(start, end) <= 0 ? { start, end } : { start: end, end: start };
  } catch {
    return undefined;
  }
};

/** the preset whose range is exactly this one ("" matches none: nothing chosen is not "all time") */
export const matchPreset = (presets: ReadonlyArray<Preset>, value: string) =>
  value ? presets.find((preset) => toValue(preset.range) === value) : undefined;

/** the range as text: "3.–9. Aug. 2026" */
export const formatRange = (range: NonNullable<Range>, locale: string) =>
  new TemporalIntl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).formatRange(
    range.start,
    range.end,
  );

/** "August 2026" */
export const formatMonth = (month: Temporal.PlainYearMonth, locale: string) =>
  new TemporalIntl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(month.toPlainDate({ day: 1 }));
