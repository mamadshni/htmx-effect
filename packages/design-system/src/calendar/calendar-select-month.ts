/**
 * <ds-calendar-select-month>: a <select> with the 12 months of the focused year. Months
 * entirely outside min/max are disabled.
 *
 *   <ds-calendar>
 *     <ds-calendar-select-month></ds-calendar-select-month>
 *     <ds-calendar-select-year></ds-calendar-select-year>
 *     <ds-calendar-month></ds-calendar-month>
 *   </ds-calendar>
 */

import type { Messages } from "../messages.js";
import { define } from "../shared.js";
import { CalendarSelect } from "./calendar-select.js";
import type { CalendarContext } from "./context.js";
import { daysInMonth, endOfMonth, format, fromParts, overlaps, partsOf } from "./date.js";

namespace Module {
  export const tagName = "ds-calendar-select-month" as const;

  export class CalendarSelectMonth extends CalendarSelect {
    protected label(messages: Messages) {
      return messages.month;
    }

    protected options({ cursor, min, max, locale }: CalendarContext) {
      const { year, month: current, day } = partsOf(cursor);
      return Array.from({ length: 12 }, (_, month) => {
        const first = fromParts(year, month, 1);
        return {
          date: fromParts(year, month, Math.min(day, daysInMonth(year, month))),
          label: format(first, { month: "long" }, locale),
          selected: month === current,
          disabled: !overlaps(first, endOfMonth(first), min, max),
        };
      });
    }
  }
}

define(Module.tagName, Module.CalendarSelectMonth);

globalThis.DsCalendarSelectMonth = Module.CalendarSelectMonth;

/** instance type of <ds-calendar-select-month> */
export type DsCalendarSelectMonth = Module.CalendarSelectMonth;

declare global {
  export import DsCalendarSelectMonth = Module.CalendarSelectMonth;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendarSelectMonth;
  }
}
