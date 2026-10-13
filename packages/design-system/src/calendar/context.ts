/**
 * How the calendar pieces talk. A container (<ds-calendar>, <ds-calendar-range>,
 * <ds-calendar-multi>) owns the state and pushes a CalendarContext down to its parts
 * (<ds-calendar-month>, <ds-calendar-select-month>, <ds-calendar-select-year>); parts send
 * what the user did up as bubbling events. Light DOM, so a part finds its container with
 * closest(), whichever of the two upgrades first.
 */

import type { Messages } from "../messages.js";
import type { PlainDate, YearMonth } from "./date.js";
import type { SelectionState } from "./selection.js";

export const CONTAINERS = "ds-calendar, ds-calendar-range, ds-calendar-multi";
export const PARTS = "ds-calendar-month, ds-calendar-select-month, ds-calendar-select-year";

export interface CalendarContext {
  /** the container's id, to derive ids for labels */
  readonly id: string;
  /** the first month shown */
  readonly page: YearMonth;
  /** the focused date */
  readonly cursor: PlainDate;
  readonly min: PlainDate | null;
  readonly max: PlainDate | null;
  readonly today: PlainDate;
  readonly locale: string;
  readonly messages: Messages;
  /** 0 = Sunday … 6 = Saturday */
  readonly firstDayOfWeek: number;
  readonly showOutsideDays: boolean;
  readonly selection: SelectionState;
  /** range picking: the first picked day and the day under the pointer/focus */
  readonly anchor: PlainDate | null;
  readonly hover: PlainDate;
  isDisallowed(date: PlainDate): boolean;
}

/** what parts send up (internal: the containers turn them into public events) */
export const PartEvent = {
  /** move the focus to a date; `reveal` shows its month first (select parts) */
  focus: "ds-calendar:focus",
  pick: "ds-calendar:pick",
  hover: "ds-calendar:hover",
  /** a part connected or changed (e.g. its offset): render it */
  update: "ds-calendar:update",
} as const;

export interface FocusDetail {
  date: PlainDate;
  reveal?: boolean;
}

/** the container a part belongs to */
export const containerOf = (part: Element) => part.parentElement?.closest(CONTAINERS) ?? null;

/** the base of all parts: the container calls update() with the current context */
export abstract class CalendarPart extends HTMLElement {
  abstract update(context: CalendarContext): void;

  connectedCallback() {
    this.requestUpdate();
  }

  /** ask the container for a render (if it is there yet; otherwise it renders when it connects) */
  protected requestUpdate() {
    this.dispatchEvent(new Event(PartEvent.update, { bubbles: true }));
  }

  protected send(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}
