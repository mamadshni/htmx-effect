import { isAfter, isBefore, parseDate, parseDates, parseRange, Temporal, type PlainDate } from "./date.js";

export const selectionModes = ["single", "range", "multiple"] as const;

export type SelectionMode = (typeof selectionModes)[number];

/** what views need to know to mark selected cells */
export interface SelectionState {
  includes(date: PlainDate): boolean;
  /** first / last day of a range */
  isStart(date: PlainDate): boolean;
  isEnd(date: PlainDate): boolean;
}

/**
 * How days are picked and how the value is written. The calendar uses it for picking,
 * the date picker for parsing typed text.
 */
export abstract class Selection implements SelectionState {
  abstract readonly mode: SelectionMode;
  /** sorted, without duplicates */
  protected dates: PlainDate[] = [];

  /** the value as written in the `value` attribute and sent with forms */
  abstract get value(): string;

  /** parse a value or typed text; undefined when it is not valid for this mode */
  abstract parse(text: string): PlainDate[] | undefined;

  /** a day was picked; true when the selection is complete */
  abstract pick(date: PlainDate): boolean;

  /** the current step, for modes that pick in steps */
  get step(): "start" | "end" | undefined {
    return undefined;
  }

  /** the first day of an unfinished pick */
  get anchor(): PlainDate | null {
    return null;
  }

  get first(): PlainDate | null {
    return this.dates[0] ?? null;
  }

  get last(): PlainDate | null {
    return this.dates.at(-1) ?? null;
  }

  /** set from a value; an invalid value clears the selection (like native inputs) */
  set(value: string) {
    this.dates = this.parse(value) ?? [];
    this.cancel();
  }

  /** drop an unfinished pick */
  cancel() {}

  includes(date: PlainDate) {
    return this.dates.some((selected) => selected.equals(date));
  }

  isStart(_date: PlainDate) {
    return false;
  }

  isEnd(_date: PlainDate) {
    return false;
  }
}

/** one day: "YYYY-MM-DD" */
export class SingleSelection extends Selection {
  readonly mode = "single";

  get value() {
    return this.first?.toString() ?? "";
  }

  parse(text: string) {
    const value = text.trim();
    if (!value) return [];
    const date = parseDate(value);
    return date ? [date] : undefined;
  }

  pick(date: PlainDate) {
    this.dates = [date];
    return true;
  }
}

/** a start and an end: "YYYY-MM-DD/YYYY-MM-DD" (ISO 8601 interval), picked in two steps */
export class RangeSelection extends Selection {
  readonly mode = "range";
  #anchor: PlainDate | null = null;

  get value() {
    return this.first && this.last ? `${this.first}/${this.last}` : "";
  }

  get step() {
    return this.#anchor ? ("end" as const) : ("start" as const);
  }

  get anchor() {
    return this.#anchor;
  }

  parse(text: string) {
    return text.trim() ? parseRange(text) : [];
  }

  pick(date: PlainDate) {
    if (!this.#anchor) {
      this.#anchor = date;
      return false;
    }
    this.dates = isAfter(this.#anchor, date) ? [date, this.#anchor] : [this.#anchor, date];
    this.#anchor = null;
    return true;
  }

  cancel() {
    this.#anchor = null;
  }

  includes(date: PlainDate) {
    return Boolean(this.first && this.last && !isBefore(date, this.first) && !isAfter(date, this.last));
  }

  isStart(date: PlainDate) {
    return this.first?.equals(date) ?? false;
  }

  isEnd(date: PlainDate) {
    return this.last?.equals(date) ?? false;
  }
}

/** any number of days: "YYYY-MM-DD YYYY-MM-DD …"; each pick toggles a day */
export class MultiSelection extends Selection {
  readonly mode = "multiple";

  get value() {
    return this.dates.join(" ");
  }

  parse(text: string) {
    return parseDates(text);
  }

  pick(date: PlainDate) {
    this.dates = this.includes(date)
      ? this.dates.filter((selected) => !selected.equals(date))
      : [...this.dates, date].sort(Temporal.PlainDate.compare);
    return true;
  }
}

export const createSelection = (mode: SelectionMode): Selection =>
  mode === "range"
    ? new RangeSelection()
    : mode === "multiple"
      ? new MultiSelection()
      : new SingleSelection();
