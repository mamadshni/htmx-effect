import { isIsoDate, parseDates, parseRange, type IsoDate } from "./date.js";

export type SelectionMode = "single" | "range" | "multiple";

/** what views need to know to mark selected cells */
export interface SelectionState {
  includes(date: IsoDate): boolean;
  /** does any selected day fall inside [start, end]? */
  overlaps(start: IsoDate, end: IsoDate): boolean;
  /** first / last day of a range */
  isStart(date: IsoDate): boolean;
  isEnd(date: IsoDate): boolean;
}

/**
 * How days are picked and how the value is written. The calendar uses it for picking,
 * the date picker for parsing typed text.
 */
export abstract class Selection implements SelectionState {
  abstract readonly mode: SelectionMode;
  /** sorted, without duplicates */
  protected dates: IsoDate[] = [];

  /** the value as written in the `value` attribute and sent with forms */
  abstract get value(): string;

  /** parse a value or typed text; undefined when it is not valid for this mode */
  abstract parse(text: string): IsoDate[] | undefined;

  /** a day was picked; true when the selection is complete */
  abstract pick(date: IsoDate): boolean;

  /** an instruction for the current step, for modes that have steps */
  get status(): string | undefined {
    return undefined;
  }

  /** the first day of an unfinished pick, else "" */
  get anchor(): IsoDate | "" {
    return "";
  }

  get first(): IsoDate | "" {
    return this.dates[0] ?? "";
  }

  get last(): IsoDate | "" {
    return this.dates.at(-1) ?? "";
  }

  /** set from a value; an invalid value clears the selection (like native inputs) */
  set(value: string) {
    this.dates = this.parse(value) ?? [];
    this.cancel();
  }

  /** drop an unfinished pick */
  cancel() {}

  includes(date: IsoDate) {
    return this.dates.includes(date);
  }

  overlaps(start: IsoDate, end: IsoDate) {
    return this.dates.some((date) => date >= start && date <= end);
  }

  isStart(_date: IsoDate) {
    return false;
  }

  isEnd(_date: IsoDate) {
    return false;
  }
}

/** one day: "YYYY-MM-DD" */
export class SingleSelection extends Selection {
  readonly mode = "single";

  get value() {
    return this.first;
  }

  parse(text: string) {
    const value = text.trim();
    if (!value) return [];
    return isIsoDate(value) ? [value] : undefined;
  }

  pick(date: IsoDate) {
    this.dates = [date];
    return true;
  }
}

/** a start and an end: "YYYY-MM-DD/YYYY-MM-DD" (ISO 8601 interval), picked in two steps */
export class RangeSelection extends Selection {
  readonly mode = "range";
  #anchor: IsoDate | "" = "";

  get value() {
    return this.first ? `${this.first}/${this.last}` : "";
  }

  get status() {
    return this.#anchor ? "Select end date" : "Select start date";
  }

  get anchor() {
    return this.#anchor;
  }

  parse(text: string) {
    return text.trim() ? parseRange(text) : [];
  }

  pick(date: IsoDate) {
    if (!this.#anchor) {
      this.#anchor = date;
      return false;
    }
    this.dates = this.#anchor <= date ? [this.#anchor, date] : [date, this.#anchor];
    this.#anchor = "";
    return true;
  }

  cancel() {
    this.#anchor = "";
  }

  includes(date: IsoDate) {
    return Boolean(this.first) && date >= this.first && date <= this.last;
  }

  overlaps(start: IsoDate, end: IsoDate) {
    return Boolean(this.first) && this.first <= end && this.last >= start;
  }

  isStart(date: IsoDate) {
    return date === this.first;
  }

  isEnd(date: IsoDate) {
    return date === this.last;
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

  pick(date: IsoDate) {
    this.dates = this.includes(date)
      ? this.dates.filter((d) => d !== date)
      : [...this.dates, date].sort();
    return true;
  }
}

export const createSelection = (mode: string | null): Selection =>
  mode === "range"
    ? new RangeSelection()
    : mode === "multiple"
      ? new MultiSelection()
      : new SingleSelection();
