/**
 * <ds-calendar-month>: one month of its calendar container, as a table of day buttons
 * (6 weeks, so the layout never jumps).
 *
 *   <ds-calendar-range months="2">
 *     <ds-calendar-month></ds-calendar-month>
 *     <ds-calendar-month offset="1"></ds-calendar-month>
 *   </ds-calendar-range>
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   offset ↔ offset    months after the container's first month (0 = the first)
 *
 * Days are buttons; aria-pressed marks selected days. Days outside min/max are disabled;
 * unavailable days are aria-disabled (focusable, not pickable). Arrow keys follow the
 * reading direction; Home/End go to the start/end of the week, PageUp/PageDown move a
 * month (with Shift a year).
 */

import { accept, assertIsInteger, define, listenOn, reflect } from "../shared.js";
import { CalendarPart, PartEvent, type CalendarContext } from "./context.js";
import {
  addDays,
  addMonths,
  addYears,
  format,
  fromParts,
  partsOf,
  weekdayOf,
  type IsoDate,
} from "./date.js";

namespace Module {
  export const tagName = "ds-calendar-month" as const;

  const WEEKS = 6;
  const MONTH_YEAR = { month: "long", year: "numeric" } as const;
  const FULL_DATE = { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const;

  export class CalendarMonth extends CalendarPart {
    static observedAttributes = ["offset"] as const;

    attributeChangedCallback(
      _name: (typeof CalendarMonth.observedAttributes)[number],
      oldValue: string | null,
      newValue: string | null,
    ) {
      if (newValue === oldValue) return;
      this.offset = newValue === null ? 0 : Number(newValue);
    }

    // ---- inputs ----

    #offset = 0;

    /** months after the container's first month */
    get offset() {
      return this.#offset;
    }
    set offset(value: number) {
      if (accept(() => assertIsInteger(value, `${tagName}.offset`, 0, 23))) this.#offset = value;
      reflect(this, "offset", this.#offset || null);
      if (this.isConnected) this.requestUpdate();
    }

    // ---- lifecycle ----

    #listeners?: AbortController;
    #context?: CalendarContext;

    connectedCallback() {
      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const on = listenOn(this, this.#listeners.signal);
      const dateOf = (event: Event) =>
        (event.target as Element).closest<HTMLElement>("button[data-date]")?.dataset.date;

      on("click", (event) => {
        const date = dateOf(event);
        if (date) this.send(PartEvent.pick, date);
      });
      on("pointerover", (event) => {
        const date = dateOf(event);
        if (date) this.send(PartEvent.hover, date);
      });
      on("keydown", (event) => {
        const date = dateOf(event);
        const next = date && this.#context ? this.#keyMove(event, date, this.#context) : undefined;
        if (!next) return;
        event.preventDefault();
        this.send(PartEvent.focus, { date: next });
      });

      super.connectedCallback();
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    // ---- rendering ----

    update(context: CalendarContext) {
      this.#context = context;
      const month = addMonths(context.page, this.#offset);
      const id = `${context.id}-${month.slice(0, 7)}`;
      this.innerHTML = `
        <h3 id="${id}" class="ds-calendar-month__title">${format(month, MONTH_YEAR, context.locale)}</h3>
        <table class="ds-calendar-month__table" aria-labelledby="${id}">
          <thead><tr>${this.#weekdays(context)}</tr></thead>
          <tbody>${this.#weeks(month, context)}</tbody>
        </table>`;
    }

    #weekdays({ firstDayOfWeek, locale }: CalendarContext) {
      return Array.from({ length: 7 }, (_, i) => {
        // 2023-01-01 was a Sunday
        const day = fromParts(2023, 0, 1 + ((firstDayOfWeek + i) % 7));
        const long = format(day, { weekday: "long" }, locale);
        const short = format(day, { weekday: "short" }, locale);
        return `<th scope="col" abbr="${long}">${short}</th>`;
      }).join("");
    }

    #weeks(month: IsoDate, context: CalendarContext) {
      const { month: monthIndex } = partsOf(month);
      const leading = (weekdayOf(month) - context.firstDayOfWeek + 7) % 7;
      const cells = Array.from({ length: WEEKS * 7 }, (_, i) => {
        const date = addDays(month, i - leading);
        const outside = partsOf(date).month !== monthIndex;
        return outside && !context.showOutsideDays ? "<td></td>" : `<td>${this.#day(date, outside, context)}</td>`;
      });
      const rows: string[] = [];
      for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).join("")}</tr>`);
      return rows.join("");
    }

    #day(date: IsoDate, outside: boolean, context: CalendarContext) {
      const { min, max, selection, anchor, hover } = context;
      const [from, to] = anchor <= hover ? [anchor, hover] : [hover, anchor];
      const attributes = [
        `type="button"`,
        `data-date="${date}"`,
        `tabindex="${date === context.cursor && !outside ? 0 : -1}"`,
        `aria-label="${format(date, FULL_DATE, context.locale)}"`,
        `aria-pressed="${!outside && selection.includes(date)}"`,
        date === context.today ? `aria-current="date"` : "",
        (min && date < min) || (max && date > max) ? "disabled" : "",
        context.isDisallowed(date) ? `aria-disabled="true"` : "",
        outside ? "data-outside" : "",
        selection.isStart(date) ? "data-range-start" : "",
        selection.isEnd(date) ? "data-range-end" : "",
        anchor && date === anchor ? "data-anchor" : "",
        anchor && date >= from && date <= to ? "data-preview" : "",
      ];
      return `<button ${attributes.filter(Boolean).join(" ")}>${format(date, { day: "numeric" }, context.locale)}</button>`;
    }

    /** the date a key moves to, or undefined when the key is not a move */
    #keyMove(event: KeyboardEvent, date: IsoDate, { firstDayOfWeek }: CalendarContext) {
      // right-to-left: the arrow keys follow the visual direction
      const forward = (event.target as Element).matches(":dir(rtl)") ? -1 : 1;
      const column = (weekdayOf(date) - firstDayOfWeek + 7) % 7;
      switch (event.key) {
        case "ArrowLeft":
          return addDays(date, -forward);
        case "ArrowRight":
          return addDays(date, forward);
        case "ArrowUp":
          return addDays(date, -7);
        case "ArrowDown":
          return addDays(date, 7);
        case "Home":
          return addDays(date, -column);
        case "End":
          return addDays(date, 6 - column);
        case "PageUp":
          return event.shiftKey ? addYears(date, -1) : addMonths(date, -1);
        case "PageDown":
          return event.shiftKey ? addYears(date, 1) : addMonths(date, 1);
        default:
          return undefined;
      }
    }
  }
}

define(Module.tagName, Module.CalendarMonth);

globalThis.DsCalendarMonth = Module.CalendarMonth;

/** instance type of <ds-calendar-month> */
export type DsCalendarMonth = Module.CalendarMonth;

declare global {
  export import DsCalendarMonth = Module.CalendarMonth;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendarMonth;
  }
}
