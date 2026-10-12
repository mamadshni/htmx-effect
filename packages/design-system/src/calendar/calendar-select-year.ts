/**
 * <ds-calendar-select-year>: a <select> with the years around the focused one, limited by
 * min/max.
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   maxYears ↔ max-years    how many years to list (default 20)
 */

import type { Messages } from "../messages.js";
import { accept, assertIsInteger, define, reflect } from "../shared.js";
import { CalendarSelect } from "./calendar-select.js";
import type { CalendarContext } from "./context.js";
import { daysInMonth, format, fromParts, partsOf } from "./date.js";

namespace Module {
  export const tagName = "ds-calendar-select-year" as const;

  export class CalendarSelectYear extends CalendarSelect {
    static observedAttributes = ["max-years"] as const;

    attributeChangedCallback(
      _name: (typeof CalendarSelectYear.observedAttributes)[number],
      oldValue: string | null,
      newValue: string | null,
    ) {
      if (newValue === oldValue) return;
      this.maxYears = newValue === null ? 20 : Number(newValue);
    }

    // ---- inputs ----

    #maxYears = 20;

    /** how many years to list, around the focused year */
    get maxYears() {
      return this.#maxYears;
    }
    set maxYears(value: number) {
      if (accept(() => assertIsInteger(value, `${tagName}.maxYears`, 1, 200))) this.#maxYears = value;
      reflect(this, "max-years", this.#maxYears === 20 ? null : this.#maxYears);
      if (this.isConnected) this.requestUpdate();
    }

    // ---- rendering ----

    protected label(messages: Messages) {
      return messages.year;
    }

    protected options({ cursor, min, max, locale }: CalendarContext) {
      const { year: current, month, day } = partsOf(cursor);
      const half = Math.floor(this.#maxYears / 2);
      const first = Math.max(current - half, min ? partsOf(min).year : -Infinity);
      const last = Math.min(first + this.#maxYears - 1, max ? partsOf(max).year : Infinity);
      return Array.from({ length: last - first + 1 }, (_, i) => {
        const year = first + i;
        return {
          date: fromParts(year, month, Math.min(day, daysInMonth(year, month))),
          label: format(fromParts(year, 0, 1), { year: "numeric" }, locale),
          selected: year === current,
          disabled: false,
        };
      });
    }
  }
}

define(Module.tagName, Module.CalendarSelectYear);

globalThis.DsCalendarSelectYear = Module.CalendarSelectYear;

/** instance type of <ds-calendar-select-year> */
export type DsCalendarSelectYear = Module.CalendarSelectYear;

declare global {
  export import DsCalendarSelectYear = Module.CalendarSelectYear;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendarSelectYear;
  }
}
