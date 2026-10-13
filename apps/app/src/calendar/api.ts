/** The calendar's public API, as data for the showcase tables. */

export interface Input {
  readonly attribute: string;
  readonly property: string;
  readonly type: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface Output {
  readonly name: string;
  readonly detail: string;
  readonly description: string;
}

export interface Member {
  readonly name: string;
  readonly type: string;
  readonly description: string;
}

/** <ds-calendar>, <ds-calendar-range>, <ds-calendar-multi> */
export const containerInputs: ReadonlyArray<Input> = [
  {
    attribute: "value",
    property: "value",
    type: "string",
    defaultValue: '""',
    description:
      'The selection. <ds-calendar>: "YYYY-MM-DD"; <ds-calendar-range>: "start/end"; <ds-calendar-multi>: dates separated by spaces. Updated on every pick.',
  },
  {
    attribute: "min",
    property: "min",
    type: "YYYY-MM-DD",
    defaultValue: '""',
    description: "Earliest date. Earlier days are disabled and focus never moves before it.",
  },
  {
    attribute: "max",
    property: "max",
    type: "YYYY-MM-DD",
    defaultValue: '""',
    description: "Latest date. Later days are disabled and focus never moves after it.",
  },
  {
    attribute: "today",
    property: "today",
    type: "YYYY-MM-DD",
    defaultValue: "the real date",
    description: "Overrides today (marked with aria-current and bold). Handy for demos and tests.",
  },
  {
    attribute: "months",
    property: "months",
    type: "1 – 12",
    defaultValue: "1",
    description:
      "Months turned per page (prev/next, heading). Without a <ds-calendar-month> inside, this many are created.",
  },
  {
    attribute: "locale",
    property: "locale",
    type: "BCP 47 tag",
    defaultValue: "nearest lang, else the browser's",
    description: "Month and weekday names, first day of the week, and the interface text (English or German).",
  },
  {
    attribute: "first-day-of-week",
    property: "firstDayOfWeek",
    type: "0 – 6 | null",
    defaultValue: "the locale's",
    description: "0 = Sunday … 6 = Saturday.",
  },
  {
    attribute: "disallowed",
    property: "disallowed",
    type: "dates",
    defaultValue: '""',
    description: "Unavailable dates, separated by spaces. They can be focused, not picked.",
  },
  {
    attribute: "disallowed-weekdays",
    property: "disallowedWeekdays",
    type: "weekdays",
    defaultValue: '""',
    description: "Unavailable weekdays (0 = Sunday … 6), separated by spaces.",
  },
  {
    attribute: "show-outside-days",
    property: "showOutsideDays",
    type: "boolean",
    defaultValue: "false",
    description: "Fills the empty cells with the neighbouring months' days, dimmed.",
  },
  {
    attribute: "—",
    property: "isDateDisallowed",
    type: "(date: Temporal.PlainDate) => boolean",
    defaultValue: "undefined",
    description: "Property only: unavailable days by rule, on top of the two attributes, e.g. (date) => date.day === 10.",
  },
];

/** the parts inside a container */
export const partInputs: ReadonlyArray<Input & { readonly element: string }> = [
  {
    element: "<ds-calendar-month>",
    attribute: "offset",
    property: "offset",
    type: "0 – 23",
    defaultValue: "0",
    description: "Months after the container's first month: 0 is the first, 1 the next …",
  },
  {
    element: "<ds-calendar-select-year>",
    attribute: "max-years",
    property: "maxYears",
    type: "1 – 200",
    defaultValue: "20",
    description: "How many years to list around the focused one (limited by min/max).",
  },
  {
    element: "<ds-calendar-select-month>",
    attribute: "—",
    property: "—",
    type: "—",
    defaultValue: "—",
    description: "No inputs: the 12 months of the focused year; months outside min/max are disabled.",
  },
];

export const containerOutputs: ReadonlyArray<Output> = [
  {
    name: "change",
    detail: "— (read .value)",
    description: "A pick completed: a day (single), the second day (range), every toggle (multi).",
  },
  { name: "rangestart", detail: "{ date: PlainDate }", description: "Range: the first day was picked." },
  {
    name: "focusday",
    detail: "{ date: PlainDate }",
    description: "The focused day changed (keyboard, selects, clicking an unavailable day).",
  },
  {
    name: "pagechange",
    detail: "{ start: PlainDate, end: PlainDate }",
    description: "The visible months changed (first and last day shown), e.g. to load availability for them.",
  },
];

export const containerMembers: ReadonlyArray<Member> = [
  { name: "value", type: "string", description: "Read or set the selection (also the value attribute)." },
  {
    name: "focusedDate",
    type: "YYYY-MM-DD",
    description: 'Read or set the focused date and show its month; "" goes back to the selection (or today).',
  },
  { name: "focus(options?)", type: "method", description: "Focus the focused day." },
  { name: "cancel()", type: "method", description: "Drop an unfinished range (the first picked day)." },
];

/** <ds-date-picker>: its own inputs; the calendar inputs above are passed on (except show-outside-days) */
export const pickerInputs: ReadonlyArray<Input> = [
  {
    attribute: "value",
    property: "defaultValue",
    type: "string",
    defaultValue: '""',
    description: 'The default value, like <input>: "YYYY-MM-DD", or "start/end" with range. Comes back on form reset.',
  },
  {
    attribute: "—",
    property: "value",
    type: "string",
    defaultValue: "the default",
    description: "The current value (not reflected to the attribute, like <input>).",
  },
  { attribute: "name", property: "name", type: "string", defaultValue: '""', description: "Name in FormData." },
  {
    attribute: "required",
    property: "required",
    type: "boolean",
    defaultValue: "false",
    description: "An empty value is invalid.",
  },
  {
    attribute: "disabled",
    property: "disabled",
    type: "boolean",
    defaultValue: "false",
    description: "Also disabled by a <fieldset disabled>.",
  },
  {
    attribute: "range",
    property: "range",
    type: "boolean",
    defaultValue: "false",
    description: "Pick a start and an end; uses <ds-calendar-range> (and the calendar on touch devices too).",
  },
  {
    attribute: "min … disallowed-weekdays",
    property: "min … isDateDisallowed",
    type: "as above",
    defaultValue: "as above",
    description: "Passed on to the calendar. One month shows the neighbouring days.",
  },
];

export const pickerOutputs: ReadonlyArray<Output> = [
  { name: "input / change", detail: "— (read .value)", description: "From the inner input, after typing or picking." },
  { name: "FormData", detail: "name=value", description: "Form-associated: submitted with its form, reset with it." },
  {
    name: "validity",
    detail: "valueMissing, badInput, rangeUnderflow, rangeOverflow, customError",
    description: "With validationMessage in English or German; errors show after an edit or a submit.",
  },
  {
    name: "start / end",
    detail: "Temporal.PlainDate | null",
    description: "The two ends of the value (equal for a single date, null when empty).",
  },
  { name: ":state(…)", detail: "native, range, open", description: "Custom states for styling." },
];
