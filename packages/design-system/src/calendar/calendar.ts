/**
 * <ds-calendar>: an inline calendar for picking a date, a range or several dates.
 * Light DOM; it renders its own parts. Styles live in calendar.css.
 *
 *   <ds-calendar value="2026-10-12" min="2026-01-01" max="2026-12-31"></ds-calendar>
 *   <ds-calendar selection="range" months="2" value="2026-10-01/2026-10-05"></ds-calendar>
 *   <ds-calendar selection="multiple" value="2026-10-01 2026-10-03"></ds-calendar>
 *
 * Attributes: value, selection (single | range | multiple), min, max, months, locale,
 * first-day-of-week (0 = Sunday … 6), today, disallowed (dates), disallowed-weekdays.
 * Properties: value, isDateDisallowed(date), focusedDate. Methods: focus(), cancel().
 * Events: change (a pick completed), rangestart, focusday, pagechange ({ start, end }).
 *
 * - Three views (day, month, year), each a CalendarView: the heading zooms out, picking a
 *   month or year zooms back in. How days are picked is a Selection.
 * - Days are buttons in a table (aria-pressed marks selected days). Days outside min/max
 *   are disabled and focus never moves past min/max; unavailable days can be focused but
 *   not picked. Arrow keys follow the reading direction.
 */

import {
  addMonths,
  clamp,
  daysInMonth,
  endOfMonth,
  fromParts,
  isIsoDate,
  localeFirstDayOfWeek,
  monthsBetween,
  partsOf,
  startOfMonth,
  todayIso,
  type IsoDate,
} from "./date.js";
import { DayView } from "./day-view.js";
import { MonthView } from "./month-view.js";
import { createSelection, type Selection } from "./selection.js";
import type { CalendarView, ViewContext } from "./view.js";
import { YearView } from "./year-view.js";
import { dateAttribute, define, listenOn, setAria, unavailableDays } from "../shared.js";

namespace Module {
  const views = { day: new DayView(), month: new MonthView(), year: new YearView() };
  /** the heading zooms out one level */
  const zoomOut = { day: views.month, month: views.year, year: undefined };
  /** picking a month or year zooms in one level (a day is picked instead) */
  const zoomIn = { day: undefined, month: views.day, year: views.month };

  let nextId = 0;

  export class Calendar extends HTMLElement {
    static observedAttributes = [
      "value",
      "selection",
      "min",
      "max",
      "months",
      "locale",
      "first-day-of-week",
      "today",
      "disallowed",
      "disallowed-weekdays",
    ];

    #listeners?: AbortController;
    #id = "";
    #selection: Selection = createSelection(null);
    // a value set through the property before connecting wins over the attribute
    #valueSet = false;
    #isDateDisallowed?: ((date: Date) => boolean) | undefined;
    #view: CalendarView = views.day;
    /** the focused date (or the one that would be) */
    #cursor: IsoDate = todayIso();
    /** the first month shown in the day view */
    #page: IsoDate = startOfMonth(this.#cursor);

    // ---- public API ----

    /** "YYYY-MM-DD", "YYYY-MM-DD/YYYY-MM-DD" (range) or "YYYY-MM-DD YYYY-MM-DD …" (multiple) */
    get value() {
      return this.#selection.value;
    }

    set value(value: string) {
      this.#valueSet = true;
      this.#selection.set(value);
      this.#render();
    }

    /** unavailable days, on top of the disallowed attributes */
    get isDateDisallowed() {
      return this.#isDateDisallowed;
    }

    set isDateDisallowed(predicate: ((date: Date) => boolean) | undefined) {
      this.#isDateDisallowed = predicate;
      this.#render();
    }

    get focusedDate() {
      return this.#cursor;
    }

    /** show a date in the day view; anything but a date goes back to the selection (or today) */
    set focusedDate(date: string) {
      this.#view = views.day;
      this.#cursor = this.#clamp(isIsoDate(date) ? date : this.#selection.first || this.#today);
      this.#page = startOfMonth(this.#cursor);
      this.#render();
    }

    /** focus the focused day */
    focus(options?: FocusOptions) {
      this.#focusedButton()?.focus(options);
    }

    /** drop an unfinished range */
    cancel() {
      this.#selection.cancel();
      this.#render();
    }

    // ---- lifecycle ----

    connectedCallback() {
      this.#id = this.id || `ds-calendar-${nextId++}`;
      const value = this.#valueSet ? this.value : (this.getAttribute("value") ?? "");
      this.#selection = createSelection(this.getAttribute("selection"));
      this.#selection.set(value);
      this.#build();
      this.focusedDate = "";
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    attributeChangedCallback(name: string, previous: string | null, next: string | null) {
      if (!this.isConnected || previous === next) return;
      if (name === "selection") {
        const value = this.value;
        this.#selection = createSelection(next);
        this.#selection.set(value);
      } else if (name === "value") {
        this.#selection.set(next ?? "");
      }
      this.#cursor = this.#clamp(this.#cursor);
      this.#render();
    }

    // ---- derived state ----

    get #today() {
      return dateAttribute(this, "today") ?? todayIso();
    }

    get #months() {
      const months = Number(this.getAttribute("months"));
      return Number.isInteger(months) && months > 1 ? Math.min(months, 12) : 1;
    }

    get #context(): ViewContext {
      const locale = this.getAttribute("locale") || undefined;
      const firstDay = Number(this.getAttribute("first-day-of-week") ?? NaN);
      return {
        id: this.#id,
        min: dateAttribute(this, "min"),
        max: dateAttribute(this, "max"),
        today: this.#today,
        locale,
        firstDayOfWeek:
          Number.isInteger(firstDay) && firstDay >= 0 && firstDay <= 6
            ? firstDay
            : localeFirstDayOfWeek(locale),
        months: this.#months,
        selection: this.#selection,
        isDisallowed: unavailableDays(this, this.#isDateDisallowed),
      };
    }

    #clamp(date: IsoDate) {
      return clamp(date, dateAttribute(this, "min"), dateAttribute(this, "max"));
    }

    // ---- parts ----

    #part(name: string) {
      return this.querySelector<HTMLElement>(`.ds-calendar__${name}`);
    }

    #focusedButton() {
      const date = this.#view.unitOf(this.#cursor);
      return this.#part("body")?.querySelector<HTMLButtonElement>(`button[data-date="${date}"]`) ?? null;
    }

    // ---- rendering ----

    #build() {
      const id = this.#id;
      this.innerHTML = `
        <div class="ds-calendar__header">
          <button type="button" class="ds-calendar__previous" data-page="-1">‹</button>
          <button type="button" class="ds-calendar__heading" id="${id}-heading" aria-live="polite"></button>
          <button type="button" class="ds-calendar__next" data-page="1">›</button>
        </div>
        <div class="ds-calendar__body" role="group" aria-labelledby="${id}-heading"></div>
        <p class="ds-calendar__status" aria-live="polite"></p>`;

      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const on = listenOn(this, this.#listeners.signal);

      on("click", (event) => {
        const target = event.target as Element;
        const up = zoomOut[this.#view.name];
        const page = target.closest<HTMLElement>("[data-page]");
        const cell = target.closest<HTMLButtonElement>(".ds-calendar__body button");

        if (target.closest(".ds-calendar__heading") && up) {
          this.#view = up;
          this.#render(true);
        } else if (page && page.getAttribute("aria-disabled") !== "true") {
          this.#turnPage(Number(page.dataset.page));
        } else if (cell) {
          this.#pick(cell);
        }
      });

      on("keydown", (event) => {
        if (!(event.target as Element).closest(".ds-calendar__body button")) return;
        const next = this.#view.cursorForKey(event, this.#cursor, this.#context);
        if (!next) return;
        event.preventDefault();
        this.#goto(next);
      });

      // the range preview follows the pointer (and the keyboard, through #goto)
      on("pointerover", (event) => {
        const date = (event.target as Element).closest<HTMLElement>("[data-date]")?.dataset.date;
        if (date) this.#preview(date);
      });
    }

    /** render the current view; focus follows the cursor when asked or when the body had it */
    #render(focus?: boolean) {
      const body = this.#part("body");
      const heading = this.#part("heading");
      if (!body || !heading) return;
      const keepFocus = focus ?? body.contains(document.activeElement);

      const context = this.#context;
      const view = this.#view;
      const page = view.name === "day" ? this.#page : this.#cursor;

      this.dataset.months = String(context.months);
      view.render(body, page, this.#cursor, context);

      heading.textContent = view.heading(page, context);
      setAria(heading, "aria-disabled", !zoomOut[view.name]);

      // prev/next stay focusable at min/max (aria-disabled), so focus is never lost
      const [start, end] = view.bounds(page, context);
      this.#setNav("previous", view.previousLabel, Boolean(context.min && start <= context.min));
      this.#setNav("next", view.nextLabel, Boolean(context.max && end >= context.max));

      const status = this.#part("status");
      if (status) {
        status.textContent = this.#selection.status ?? "";
        status.hidden = !this.#selection.status;
      }

      this.#preview(this.#cursor);
      if (keepFocus) this.#focusedButton()?.focus();
    }

    #setNav(name: string, label: string, disabled: boolean) {
      const button = this.#part(name);
      button?.setAttribute("aria-label", label);
      setAria(button, "aria-disabled", disabled);
    }

    // ---- navigation ----

    /** keyboard: move the cursor (clamped to min/max) and focus it */
    #goto(date: IsoDate) {
      const cursor = this.#clamp(date);
      if (cursor !== this.#cursor) {
        this.#cursor = cursor;
        this.#dispatch("focusday", { date: cursor });
      }

      const button = this.#focusedButton();
      if (button && !button.hasAttribute("data-outside")) {
        // still on the page: move the roving tabindex only
        for (const other of this.#part("body")!.querySelectorAll("button")) {
          other.tabIndex = other === button ? 0 : -1;
        }
        button.focus();
        this.#preview(cursor);
      } else {
        this.#followCursor();
        this.#render(true);
      }
    }

    /** day view: turn the page so that the cursor is on it */
    #followCursor() {
      if (this.#view.name !== "day") return;
      const months = this.#months;
      const offset = monthsBetween(this.#page, this.#cursor);
      if (offset < 0) this.#setPage(startOfMonth(this.#cursor));
      else if (offset >= months) this.#setPage(addMonths(startOfMonth(this.#cursor), 1 - months));
    }

    #setPage(page: IsoDate) {
      if (page === this.#page) return;
      this.#page = page;
      this.#dispatch("pagechange", { start: page, end: endOfMonth(addMonths(page, this.#months - 1)) });
    }

    /** prev/next: the day keeps its place on the new page */
    #turnPage(direction: number) {
      if (this.#view.name === "day") {
        this.#setPage(addMonths(this.#page, direction));
        this.#cursor = this.#clamp(addMonths(this.#cursor, direction));
      } else {
        this.#cursor = this.#clamp(this.#view.page(this.#cursor, direction, false));
      }
      this.#render();
    }

    /** a cell was chosen: zoom in, or pick the day */
    #pick(cell: HTMLButtonElement) {
      const date = cell.dataset.date;
      if (!date || cell.disabled) return;

      const down = zoomIn[this.#view.name];
      if (down) {
        // keep the cursor's day (and month, when picking a year) where possible
        const picked = partsOf(date);
        const cursor = partsOf(this.#cursor);
        const month = this.#view.name === "year" ? cursor.month : picked.month;
        this.#view = down;
        this.#cursor = this.#clamp(fromParts(picked.year, month, Math.min(cursor.day, daysInMonth(picked.year, month))));
        this.#page = startOfMonth(this.#cursor);
        this.#render(true);
        return;
      }

      // unavailable: it can be focused, not picked
      if (cell.getAttribute("aria-disabled") === "true") {
        this.#goto(date);
        return;
      }

      this.#cursor = date;
      const done = this.#selection.pick(date);
      this.#followCursor();
      this.#render(true);
      if (done) this.#dispatch("change");
      else this.#dispatch("rangestart", { date });
    }

    /** range mode: highlight anchor…date while the second end is being chosen */
    #preview(date: IsoDate) {
      const body = this.#part("body");
      if (!body) return;
      const anchor = this.#view.name === "day" ? this.#selection.anchor : "";
      const [from, to] = anchor <= date ? [anchor, date] : [date, anchor];
      body.toggleAttribute("data-picking", Boolean(anchor));
      for (const button of body.querySelectorAll<HTMLElement>("button[data-date]")) {
        const day = button.dataset.date!;
        button.toggleAttribute("data-anchor", Boolean(anchor) && day === anchor);
        button.toggleAttribute("data-preview", Boolean(anchor) && day >= from && day <= to);
      }
    }

    #dispatch(type: string, detail?: unknown) {
      this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
    }
  }
}

define("ds-calendar", Module.Calendar);

globalThis.DsCalendar = Module.Calendar;

/** instance type of <ds-calendar>: `import type { DsCalendar } from "@combo/design-system/bundle/index.js"` */
export type DsCalendar = Module.Calendar;

declare global {
  export import DsCalendar = Module.Calendar;

  interface HTMLElementTagNameMap {
    "ds-calendar": DsCalendar;
  }
}
