/**
 * The calendar container shared by <ds-calendar> (one date), <ds-calendar-range> and
 * <ds-calendar-multi>. Subclasses only choose how days are picked (a Selection).
 *
 * It owns the state, adds a header (previous / heading / next) at the start and a status
 * line at the end, and renders its parts with one CalendarContext. Without a
 * <ds-calendar-month> inside, it adds `months` of them itself. Month/year selects placed
 * directly inside are moved into the header, between previous and next.
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   value ↔ value                     "YYYY-MM-DD", "start/end" (range) or dates (multi)
 *   min, max, today ↔ same names      "YYYY-MM-DD" or ""
 *   months ↔ months                   1…12, months turned per page
 *   locale ↔ locale                   "" = the nearest lang, else the browser's (text: en/de)
 *   firstDayOfWeek ↔ first-day-of-week  0 (Sunday) … 6, or null for the locale's
 *   disallowed ↔ disallowed           unavailable dates, separated by spaces
 *   disallowedWeekdays ↔ disallowed-weekdays  unavailable weekdays (0-6)
 *   showOutsideDays ↔ show-outside-days  show the neighbouring months' days, dimmed
 *   isDateDisallowed (property only)  (date: Temporal.PlainDate) => boolean
 * Also: focusedDate ("YYYY-MM-DD"), focus(), cancel().
 * Events: change (a pick completed), rangestart ({ date }), focusday ({ date }),
 * pagechange ({ start, end }); dates in details are Temporal.PlainDate.
 */

import { messagesFor } from "../messages.js";
import {
  accept,
  assertIsBoolean,
  assertIsDate,
  assertIsDateList,
  assertIsInteger,
  assertIsPredicate,
  assertIsString,
  assertIsWeekdayList,
  listenOn,
  reflect,
  resolveLocale,
  setAria,
  unavailableDays,
  type DatePredicate,
} from "../shared.js";
import { CalendarPart, PartEvent, PARTS, containerOf, type CalendarContext, type FocusDetail } from "./context.js";
import {
  clamp,
  firstDayOf,
  format,
  formatRange,
  isOutside,
  lastDayOf,
  localeFirstDayOfWeek,
  monthsBetween,
  optionalDate,
  parseDate,
  today,
  type PlainDate,
  type YearMonth,
} from "./date.js";
import type { Selection } from "./selection.js";

const MONTH_YEAR = { month: "long", year: "numeric" } as const;

let nextId = 0;

export abstract class CalendarBase extends HTMLElement {
  static observedAttributes = [
    "value",
    "min",
    "max",
    "today",
    "months",
    "locale",
    "first-day-of-week",
    "disallowed",
    "disallowed-weekdays",
    "show-outside-days",
  ] as const;

  attributeChangedCallback(
    name: (typeof CalendarBase.observedAttributes)[number],
    oldValue: string | null,
    newValue: string | null,
  ) {
    if (newValue === oldValue) return;
    switch (name) {
      case "value":
      case "min":
      case "max":
      case "today":
      case "locale":
      case "disallowed":
        this[name] = newValue ?? "";
        break;
      case "months":
        this.months = newValue === null ? 1 : Number(newValue);
        break;
      case "first-day-of-week":
        this.firstDayOfWeek = newValue === null ? null : Number(newValue);
        break;
      case "disallowed-weekdays":
        this.disallowedWeekdays = newValue ?? "";
        break;
      case "show-outside-days":
        this.showOutsideDays = newValue !== null;
        break;
    }
  }

  /** how days are picked: one date, a range or several dates */
  protected abstract createSelection(): Selection;

  // ---- inputs ----

  #selection: Selection = this.createSelection();

  get value() {
    return this.#selection.value;
  }
  set value(value: string) {
    if (accept(() => assertIsString(value, `${this.localName}.value`))) this.#selection.set(value);
    reflect(this, "value", this.#selection.value);
    this.#render();
  }

  #min: PlainDate | null = null;

  get min() {
    return this.#min?.toString() ?? "";
  }
  set min(value: string) {
    if (accept(() => assertIsDate(value, `${this.localName}.min`))) this.#min = optionalDate(value);
    reflect(this, "min", this.min);
    this.#refresh();
  }

  #max: PlainDate | null = null;

  get max() {
    return this.#max?.toString() ?? "";
  }
  set max(value: string) {
    if (accept(() => assertIsDate(value, `${this.localName}.max`))) this.#max = optionalDate(value);
    reflect(this, "max", this.max);
    this.#refresh();
  }

  #today: PlainDate | null = null;

  /** "" = the real today */
  get today() {
    return this.#today?.toString() ?? "";
  }
  set today(value: string) {
    if (accept(() => assertIsDate(value, `${this.localName}.today`))) this.#today = optionalDate(value);
    reflect(this, "today", this.today);
    this.#render();
  }

  #months = 1;

  /** months turned per page (and created when there is no <ds-calendar-month> inside) */
  get months() {
    return this.#months;
  }
  set months(value: number) {
    if (accept(() => assertIsInteger(value, `${this.localName}.months`, 1, 12))) this.#months = value;
    reflect(this, "months", this.#months === 1 ? null : this.#months);
    this.#addMonths();
    this.#refresh();
  }

  #locale = "";

  /** "" = the nearest lang, else the browser's */
  get locale() {
    return this.#locale;
  }
  set locale(value: string) {
    if (accept(() => assertIsString(value, `${this.localName}.locale`))) this.#locale = value;
    reflect(this, "locale", this.#locale);
    this.#render();
  }

  #firstDayOfWeek: number | null = null;

  /** 0 = Sunday … 6 = Saturday; null = the locale's */
  get firstDayOfWeek() {
    return this.#firstDayOfWeek;
  }
  set firstDayOfWeek(value: number | null) {
    const valid = accept(() => {
      if (value !== null) assertIsInteger(value, `${this.localName}.firstDayOfWeek`, 0, 6);
    });
    if (valid) this.#firstDayOfWeek = value;
    reflect(this, "first-day-of-week", this.#firstDayOfWeek);
    this.#render();
  }

  #disallowed = "";

  /** unavailable dates, separated by spaces */
  get disallowed() {
    return this.#disallowed;
  }
  set disallowed(value: string) {
    if (accept(() => assertIsDateList(value, `${this.localName}.disallowed`))) this.#disallowed = value;
    reflect(this, "disallowed", this.#disallowed);
    this.#render();
  }

  #disallowedWeekdays = "";

  /** unavailable weekdays (0 = Sunday … 6), separated by spaces */
  get disallowedWeekdays() {
    return this.#disallowedWeekdays;
  }
  set disallowedWeekdays(value: string) {
    if (accept(() => assertIsWeekdayList(value, `${this.localName}.disallowedWeekdays`))) {
      this.#disallowedWeekdays = value;
    }
    reflect(this, "disallowed-weekdays", this.#disallowedWeekdays);
    this.#render();
  }

  #showOutsideDays = false;

  /** show the neighbouring months' days (dimmed) in the empty cells */
  get showOutsideDays() {
    return this.#showOutsideDays;
  }
  set showOutsideDays(value: boolean) {
    if (accept(() => assertIsBoolean(value, `${this.localName}.showOutsideDays`))) {
      this.#showOutsideDays = value;
    }
    reflect(this, "show-outside-days", this.#showOutsideDays);
    this.#render();
  }

  #isDateDisallowed: DatePredicate | undefined;

  /** unavailable days, on top of `disallowed` and `disallowedWeekdays` (property only) */
  get isDateDisallowed() {
    return this.#isDateDisallowed;
  }
  set isDateDisallowed(value: DatePredicate | undefined) {
    if (accept(() => assertIsPredicate(value, `${this.localName}.isDateDisallowed`))) {
      this.#isDateDisallowed = value;
    }
    this.#render();
  }

  // ---- state and methods ----

  #listeners?: AbortController;
  #id = "";
  /** the focused date (or the one that would be) */
  #cursor: PlainDate = today();
  /** the first month shown */
  #page: YearMonth = this.#cursor.toPlainYearMonth();
  /** range picking: the day under the pointer or focus */
  #hover: PlainDate = this.#cursor;

  /** "YYYY-MM-DD" */
  get focusedDate() {
    return this.#cursor.toString();
  }

  /** show and focus a date; anything but a date goes back to the selection (or today) */
  set focusedDate(date: string) {
    this.#cursor = this.#clamp(parseDate(date) ?? this.#selection.first ?? this.#todayOrNow);
    this.#page = this.#cursor.toPlainYearMonth();
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
    // parsed from the page's HTML: the children are not there yet, so wait for them
    // before arranging (otherwise default months would be added next to the author's)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#setup(), { once: true });
    } else {
      this.#setup();
    }
  }

  #setup() {
    if (!this.isConnected) return;
    this.#id = this.id || `${this.localName}-${nextId++}`;
    this.setAttribute("role", "group");
    this.setAttribute("aria-labelledby", `${this.#id}-heading`);
    this.#addHeaderAndStatus();
    this.#placeSelects();
    this.#addMonths();
    this.#listen();
    this.focusedDate = "";
  }

  disconnectedCallback() {
    this.#listeners?.abort();
  }

  // ---- derived state ----

  get #todayOrNow() {
    return this.#today ?? today();
  }

  get #context(): CalendarContext {
    const locale = resolveLocale(this.#locale, this);
    return {
      id: this.#id,
      page: this.#page,
      cursor: this.#cursor,
      min: this.#min,
      max: this.#max,
      today: this.#todayOrNow,
      locale,
      messages: messagesFor(locale),
      firstDayOfWeek: this.#firstDayOfWeek ?? localeFirstDayOfWeek(locale),
      showOutsideDays: this.#showOutsideDays,
      selection: this.#selection,
      anchor: this.#selection.anchor,
      hover: this.#hover,
      isDisallowed: unavailableDays(this.#disallowed, this.#disallowedWeekdays, this.#isDateDisallowed),
    };
  }

  #clamp(date: PlainDate) {
    return clamp(date, this.#min, this.#max);
  }

  /** min/max/months changed: keep the cursor inside, then render */
  #refresh() {
    this.#cursor = this.#clamp(this.#cursor);
    this.#render();
  }

  // ---- parts ----

  /** the header or status this container added */
  #part(name: "header" | "status") {
    return this.querySelector<HTMLElement>(`:scope > .ds-calendar__${name}`);
  }

  #headerPart(name: "previous" | "heading" | "next") {
    return this.#part("header")?.querySelector<HTMLElement>(`.ds-calendar__${name}`) ?? null;
  }

  /** the parts that belong to this container (not to a nested one) */
  #parts(selector = PARTS) {
    return Array.from(this.querySelectorAll(selector)).filter((part) => containerOf(part) === this);
  }

  #focusedButton() {
    return this.querySelector<HTMLButtonElement>(`button[data-date="${this.#cursor}"]:not([data-outside])`);
  }

  #addHeaderAndStatus() {
    if (!this.#part("header")) {
      const header = document.createElement("div");
      header.className = "ds-calendar__header";
      header.innerHTML = `
        <button type="button" class="ds-calendar__previous" data-page="-1">‹</button>
        <h2 class="ds-calendar__heading" id="${this.#id}-heading" aria-live="polite"></h2>
        <div class="ds-calendar__selects"></div>
        <button type="button" class="ds-calendar__next" data-page="1">›</button>`;
      this.prepend(header);
    }
    if (!this.#part("status")) {
      const status = document.createElement("p");
      status.className = "ds-calendar__status";
      status.setAttribute("aria-live", "polite");
      this.append(status);
    }
  }

  /** month/year selects placed directly inside go into the header, between ‹ and › */
  #placeSelects() {
    const slot = this.#part("header")?.querySelector(".ds-calendar__selects");
    if (!slot) return;
    for (const select of this.querySelectorAll(":scope > :is(ds-calendar-select-month, ds-calendar-select-year)")) {
      slot.append(select);
    }
    // the selects stand in for the visible heading (it still labels the calendar)
    this.toggleAttribute("data-selects", slot.childElementCount > 0);
  }

  /** without months of its own, the container adds (and keeps) `months` of them */
  #addMonths() {
    if (!this.isConnected) return;
    const months = this.#parts("ds-calendar-month");
    if (months.some((month) => !month.hasAttribute("data-auto"))) return;
    for (const month of months) month.remove();
    const status = this.#part("status");
    for (let offset = 0; offset < this.#months; offset++) {
      const month = document.createElement("ds-calendar-month");
      month.setAttribute("data-auto", "");
      if (offset) month.setAttribute("offset", String(offset));
      this.insertBefore(month, status);
    }
  }

  // ---- rendering ----

  #listen() {
    this.#listeners?.abort();
    this.#listeners = new AbortController();
    const on = listenOn(this, this.#listeners.signal);
    /** only events from this container's own parts */
    const own = (event: Event) => {
      const part = (event.target as Element).closest(PARTS);
      return part !== null && containerOf(part) === this;
    };

    on("click", (event) => {
      const page = (event.target as Element).closest<HTMLElement>("[data-page]");
      if (!page || page.closest(".ds-calendar__header") !== this.#part("header")) return;
      if (page.getAttribute("aria-disabled") !== "true") this.#turnPage(Number(page.dataset.page));
    });

    this.addEventListener(
      PartEvent.update,
      (event) => {
        if (!own(event)) return;
        event.stopPropagation();
        this.#placeSelects();
        this.#render();
      },
      { signal: this.#listeners.signal },
    );
    this.addEventListener(
      PartEvent.focus,
      (event) => {
        if (!own(event)) return;
        const { date, reveal } = (event as CustomEvent<FocusDetail>).detail;
        this.#goto(date, reveal ?? false);
      },
      { signal: this.#listeners.signal },
    );
    this.addEventListener(
      PartEvent.pick,
      (event) => {
        if (own(event)) this.#pick((event as CustomEvent<PlainDate>).detail);
      },
      { signal: this.#listeners.signal },
    );
    this.addEventListener(
      PartEvent.hover,
      (event) => {
        const date = (event as CustomEvent<PlainDate>).detail;
        // only while a range is being picked, and only for a new day: a render puts a new
        // button under the pointer, which fires pointerover again
        if (!own(event) || !this.#selection.anchor || date.equals(this.#hover)) return;
        this.#hover = date;
        this.#render();
      },
      { signal: this.#listeners.signal },
    );
  }

  /** render the header, status and parts; focus follows the cursor when asked or when a day had it */
  #render(focus?: boolean) {
    const heading = this.#headerPart("heading");
    if (!this.isConnected || !heading) return;
    const active = document.activeElement;
    const keepFocus = focus ?? Boolean(active?.closest("ds-calendar-month") && this.contains(active));

    const context = this.#context;
    const last = this.#page.add({ months: this.#months - 1 });
    heading.textContent =
      this.#months > 1
        ? formatRange(this.#page, last, MONTH_YEAR, context.locale)
        : format(this.#page, MONTH_YEAR, context.locale);

    // prev/next stay focusable at min/max (aria-disabled), so focus is never lost
    // disabled when the day just before/after the page is out of range
    const before = firstDayOf(this.#page).subtract({ days: 1 });
    const after = lastDayOf(last).add({ days: 1 });
    this.#setNav("previous", context.messages.previousMonth, isOutside(before, context.min, null));
    this.#setNav("next", context.messages.nextMonth, isOutside(after, null, context.max));

    const status = this.#part("status");
    if (status) {
      // the status line stays last, after any parts added since
      if (this.lastElementChild !== status) this.append(status);
      const step = this.#selection.step;
      status.textContent = step ? context.messages[step === "start" ? "selectStart" : "selectEnd"] : "";
      status.hidden = !step;
    }
    this.toggleAttribute("data-picking", Boolean(context.anchor));

    for (const part of this.#parts()) {
      if (part instanceof CalendarPart) part.update(context);
    }
    if (keepFocus) this.#focusedButton()?.focus();
  }

  #setNav(name: "previous" | "next", label: string, disabled: boolean) {
    const button = this.#headerPart(name);
    button?.setAttribute("aria-label", label);
    setAria(button, "aria-disabled", disabled);
  }

  // ---- navigation ----

  /** move the cursor (clamped to min/max); `reveal` starts the page at its month */
  #goto(date: PlainDate, reveal: boolean) {
    const cursor = this.#clamp(date);
    if (!cursor.equals(this.#cursor)) {
      this.#cursor = cursor;
      this.#dispatch("focusday", { date: cursor });
    }
    this.#hover = cursor;
    if (reveal) this.#setPage(cursor.toPlainYearMonth());
    else this.#followCursor();
    // keyboard: focus the day; a select keeps the focus
    this.#render(reveal ? undefined : true);
  }

  /** turn the page so that the cursor is on it */
  #followCursor() {
    const month = this.#cursor.toPlainYearMonth();
    const offset = monthsBetween(this.#page, month);
    if (offset < 0) this.#setPage(month);
    else if (offset >= this.#months) this.#setPage(month.subtract({ months: this.#months - 1 }));
  }

  #setPage(page: YearMonth) {
    if (page.equals(this.#page)) return;
    this.#page = page;
    const last = page.add({ months: this.#months - 1 });
    this.#dispatch("pagechange", { start: firstDayOf(page), end: lastDayOf(last) });
  }

  /** prev/next: the day keeps its place on the new page */
  #turnPage(direction: number) {
    this.#setPage(this.#page.add({ months: direction }));
    this.#cursor = this.#clamp(this.#cursor.add({ months: direction }));
    this.#render();
  }

  /** a day was picked */
  #pick(date: PlainDate) {
    const { min, max, isDisallowed } = this.#context;
    if (isOutside(date, min, max)) return;
    // unavailable: it can be focused, not picked
    if (isDisallowed(date)) {
      this.#goto(date, false);
      return;
    }

    this.#cursor = date;
    this.#hover = date;
    const done = this.#selection.pick(date);
    if (done) reflect(this, "value", this.#selection.value);
    this.#followCursor();
    this.#render(true);
    if (done) this.dispatchEvent(new Event("change", { bubbles: true }));
    else this.#dispatch("rangestart", { date });
  }

  #dispatch(type: string, detail: unknown) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }
}
