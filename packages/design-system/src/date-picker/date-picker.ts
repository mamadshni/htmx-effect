/**
 * <ds-date-picker>: a form-associated date (or date range) field: a text input, a toggle
 * button and a popover with a <ds-calendar>. Light DOM. Styles live in date-picker.css.
 *
 *   <label for="due">Due date</label>
 *   <ds-date-picker id="due" name="due" min="2026-01-01" max="2026-12-31" required></ds-date-picker>
 *
 *   <label for="stay">Aufenthalt</label>
 *   <ds-date-picker id="stay" name="stay" range months="2" locale="de"></ds-date-picker>
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   defaultValue ↔ value              the default; `value` is the current value (not reflected,
 *                                     like <input>): "YYYY-MM-DD", or "start/end" with `range`
 *   name, required, disabled, range ↔ same names
 *   min, max, today, months, locale, firstDayOfWeek, disallowed, disallowedWeekdays,
 *   isDateDisallowed                  as on <ds-calendar>, passed on to it
 *                                     (isDateDisallowed: (date: Temporal.PlainDate) => boolean)
 *
 * - `start` and `end` expose the two ends as Temporal.PlainDate (equal for a single date; null
 *   when empty).
 * - The native <input type="date"> is used only on touch-first devices (`pointer: coarse`)
 *   and only when it can do everything asked for: ranges and unavailable days always get
 *   the calendar.
 * - Text is English or German, by the locale (else the nearest lang, else the browser's).
 * - ElementInternals makes it a real form control: value in FormData, validation
 *   (required, min/max, unavailable days, bad input), reset, restore, <fieldset disabled>
 *   and <label for>. ARIA lives on the focusable inner parts, where focus actually is.
 * - Inner `input`/`change` events bubble through the host.
 * - Custom states for styling: :state(native), :state(range), :state(open).
 */

import "../calendar/calendar-date.js";
import "../calendar/calendar-range.js";
import "../calendar/calendar-select-month.js";
import "../calendar/calendar-select-year.js";
import type { CalendarBase } from "../calendar/calendar-base.js";
import { format, isOutside, optionalDate, type PlainDate } from "../calendar/date.js";
import { RangeSelection, SingleSelection, type Selection } from "../calendar/selection.js";
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
  define,
  listenOn,
  reflect,
  resolveLocale,
  unavailableDays,
  type DatePredicate,
  type Listen,
} from "../shared.js";

namespace Module {
  export const tagName = "ds-date-picker" as const;

  const touchFirst = matchMedia("(pointer: coarse)");
  const FULL_DATE = { day: "numeric", month: "long", year: "numeric" } as const;
  const CALENDAR_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 0h1v2h6V0h1v2h3v14H1V2h3zm10 5H2v10h12zM2 3v1h12V3z"/></svg>`;

  let nextId = 0;

  export class DatePicker extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = [
      "value",
      "name",
      "required",
      "disabled",
      "range",
      "min",
      "max",
      "today",
      "months",
      "locale",
      "first-day-of-week",
      "disallowed",
      "disallowed-weekdays",
    ] as const;

    attributeChangedCallback(
      name: (typeof DatePicker.observedAttributes)[number],
      oldValue: string | null,
      newValue: string | null,
    ) {
      if (newValue === oldValue) return;
      switch (name) {
        case "value":
          this.defaultValue = newValue ?? "";
          break;
        case "required":
        case "disabled":
        case "range":
          this[name] = newValue !== null;
          break;
        case "name":
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
      }
    }

    #internals = this.attachInternals();

    // ---- inputs ----

    #defaultValue = "";

    /** the `value` attribute: the value until the user edits it, and again after a reset */
    get defaultValue() {
      return this.#defaultValue;
    }
    set defaultValue(value: string) {
      if (accept(() => assertIsString(value, `${tagName}.defaultValue`))) this.#defaultValue = value;
      reflect(this, "value", this.#defaultValue);
      if (!this.#dirty) this.#setValue(this.#defaultValue);
    }

    // the value as given (attributes may arrive before `range`), parsed by the selection
    #value = "";
    #selection: Selection = new SingleSelection();

    /** the current value: "YYYY-MM-DD", or "YYYY-MM-DD/YYYY-MM-DD" with `range`; "" when empty */
    get value() {
      return this.#selection.value;
    }
    set value(value: string) {
      if (!accept(() => assertIsString(value, `${tagName}.value`))) return;
      this.#dirty = true;
      this.#setValue(value);
    }

    /** the first day of the value, or null */
    get start() {
      return this.#selection.first;
    }

    /** the last day of the value (the start for a single date), or null */
    get end() {
      return this.#selection.last;
    }

    #name = "";

    get name() {
      return this.#name;
    }
    set name(value: string) {
      if (accept(() => assertIsString(value, `${tagName}.name`))) this.#name = value;
      reflect(this, "name", this.#name);
    }

    #required = false;

    get required() {
      return this.#required;
    }
    set required(value: boolean) {
      if (accept(() => assertIsBoolean(value, `${tagName}.required`))) this.#required = value;
      reflect(this, "required", this.#required);
      this.#syncInput();
      this.#validate();
    }

    #disabled = false;

    get disabled() {
      return this.#disabled;
    }
    set disabled(value: boolean) {
      if (accept(() => assertIsBoolean(value, `${tagName}.disabled`))) this.#disabled = value;
      reflect(this, "disabled", this.#disabled);
      if (this.#isDisabled) this.#close(false);
      this.#syncInput();
    }

    #range = false;

    /** pick a start and an end */
    get range() {
      return this.#range;
    }
    set range(value: boolean) {
      if (accept(() => assertIsBoolean(value, `${tagName}.range`))) {
        if (value !== this.#range) {
          this.#range = value;
          this.#selection = value ? new RangeSelection() : new SingleSelection();
          this.#selection.set(this.#value);
        }
      }
      reflect(this, "range", this.#range);
      this.#rerender();
    }

    #min: PlainDate | null = null;

    get min() {
      return this.#min?.toString() ?? "";
    }
    set min(value: string) {
      if (accept(() => assertIsDate(value, `${tagName}.min`))) this.#min = optionalDate(value);
      reflect(this, "min", this.min);
      this.#syncAll();
    }

    #max: PlainDate | null = null;

    get max() {
      return this.#max?.toString() ?? "";
    }
    set max(value: string) {
      if (accept(() => assertIsDate(value, `${tagName}.max`))) this.#max = optionalDate(value);
      reflect(this, "max", this.max);
      this.#syncAll();
    }

    #today: PlainDate | null = null;

    get today() {
      return this.#today?.toString() ?? "";
    }
    set today(value: string) {
      if (accept(() => assertIsDate(value, `${tagName}.today`))) this.#today = optionalDate(value);
      reflect(this, "today", this.today);
      this.#syncCalendar();
    }

    #months = 1;

    get months() {
      return this.#months;
    }
    set months(value: number) {
      if (accept(() => assertIsInteger(value, `${tagName}.months`, 1, 12))) this.#months = value;
      reflect(this, "months", this.#months === 1 ? null : this.#months);
      this.#syncCalendar();
    }

    #locale = "";

    /** "" = the nearest lang, else the browser's */
    get locale() {
      return this.#locale;
    }
    set locale(value: string) {
      if (accept(() => assertIsString(value, `${tagName}.locale`))) this.#locale = value;
      reflect(this, "locale", this.#locale);
      // new text everywhere
      this.#rerender();
    }

    #firstDayOfWeek: number | null = null;

    get firstDayOfWeek() {
      return this.#firstDayOfWeek;
    }
    set firstDayOfWeek(value: number | null) {
      const valid = accept(() => {
        if (value !== null) assertIsInteger(value, `${tagName}.firstDayOfWeek`, 0, 6);
      });
      if (valid) this.#firstDayOfWeek = value;
      reflect(this, "first-day-of-week", this.#firstDayOfWeek);
      this.#syncCalendar();
    }

    #disallowed = "";

    get disallowed() {
      return this.#disallowed;
    }
    set disallowed(value: string) {
      if (accept(() => assertIsDateList(value, `${tagName}.disallowed`))) this.#disallowed = value;
      reflect(this, "disallowed", this.#disallowed);
      this.#availabilityChanged();
    }

    #disallowedWeekdays = "";

    get disallowedWeekdays() {
      return this.#disallowedWeekdays;
    }
    set disallowedWeekdays(value: string) {
      if (accept(() => assertIsWeekdayList(value, `${tagName}.disallowedWeekdays`))) {
        this.#disallowedWeekdays = value;
      }
      reflect(this, "disallowed-weekdays", this.#disallowedWeekdays);
      this.#availabilityChanged();
    }

    #isDateDisallowed: DatePredicate | undefined;

    /** unavailable days, on top of `disallowed` and `disallowedWeekdays` (property only) */
    get isDateDisallowed() {
      return this.#isDateDisallowed;
    }
    set isDateDisallowed(value: DatePredicate | undefined) {
      if (accept(() => assertIsPredicate(value, `${tagName}.isDateDisallowed`))) {
        this.#isDateDisallowed = value;
      }
      this.#availabilityChanged();
    }

    // ---- form control API (mirrors native inputs) ----

    get form() {
      return this.#internals.form;
    }

    get labels() {
      return this.#internals.labels;
    }

    get validity() {
      return this.#internals.validity;
    }

    get validationMessage() {
      return this.#internals.validationMessage;
    }

    get willValidate() {
      return this.#internals.willValidate;
    }

    checkValidity() {
      return this.#internals.checkValidity();
    }

    reportValidity() {
      return this.#internals.reportValidity();
    }

    // ---- state ----

    #listeners?: AbortController;
    #id = "";
    // like native inputs: once edited, the default only comes back with a form reset
    #dirty = false;
    // typed text that is not a valid value
    #badInput = false;
    // disabled by a <fieldset disabled>
    #disabledByForm = false;
    // like :user-invalid, errors are only shown after an edit or a submit attempt
    #showErrors = false;

    // ---- lifecycle ----

    connectedCallback() {
      this.#id = this.id || `${tagName}-${nextId++}`;
      this.#render();
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    formResetCallback() {
      this.#dirty = false;
      this.#showErrors = false;
      this.#setValue(this.#defaultValue);
    }

    formStateRestoreCallback(state: unknown) {
      if (typeof state === "string") this.#setValue(state);
    }

    formDisabledCallback(disabled: boolean) {
      this.#disabledByForm = disabled;
      if (disabled) this.#close(false);
      this.#syncInput();
    }

    // ---- derived state ----

    #part<T extends HTMLElement = HTMLElement>(name: string) {
      return this.querySelector<T>(`.ds-date-picker__${name}`);
    }

    get #input() {
      return this.#part<HTMLInputElement>("input");
    }

    /** the calendar container in the popover: <ds-calendar> or <ds-calendar-range> */
    get #calendar() {
      return this.querySelector<CalendarBase>("ds-calendar, ds-calendar-range");
    }

    get #isOpen() {
      return this.#internals.states.has("open");
    }

    get #isDisabled() {
      return this.#disabledByForm || this.#disabled;
    }

    get #resolvedLocale() {
      return resolveLocale(this.#locale, this);
    }

    get #messages() {
      return messagesFor(this.#resolvedLocale);
    }

    /** the typed format as shown in hints: YYYY-MM-DD (JJJJ-MM-TT in German), doubled for ranges */
    get #pattern() {
      const { datePattern } = this.#messages;
      return this.#range ? `${datePattern} – ${datePattern}` : datePattern;
    }

    /** native picker only on touch-first devices, and only for what it supports */
    get #useNative() {
      return (
        touchFirst.matches &&
        !this.#range &&
        !this.#disallowed &&
        !this.#disallowedWeekdays &&
        !this.#isDateDisallowed
      );
    }

    get #calendarTag() {
      return this.#range ? "ds-calendar-range" : "ds-calendar";
    }

    /** the selection as shown in the text input */
    get #text() {
      const { first, last } = this.#selection;
      return this.#range && first ? `${first} – ${last}` : (first?.toString() ?? "");
    }

    // ---- rendering ----

    /** new parts (another mode, language or native ↔ calendar), once connected */
    #rerender() {
      if (this.isConnected) this.#render();
      else this.#validate();
    }

    /** availability changed: may switch native ↔ calendar */
    #availabilityChanged() {
      if (this.isConnected && touchFirst.matches) this.#render();
      else this.#syncAll();
    }

    #render() {
      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const { signal } = this.#listeners;
      const on = listenOn(this, signal);

      const states = this.#internals.states;
      states.delete("open");
      if (this.#range) states.add("range");
      else states.delete("range");

      if (this.#useNative) {
        states.add("native");
        this.innerHTML = `<input type="date" class="ds-date-picker__input">`;
        // the browser picker always produces a valid ISO date
        on("input", (event) => {
          const input = this.#input;
          if (input && event.target === input) this.#edit(input.value);
        });
      } else {
        states.delete("native");
        this.#renderCustom(on, signal);
      }

      // re-render if the primary pointer changes (e.g. a tablet keyboard is attached)
      touchFirst.addEventListener("change", () => this.#render(), { signal });

      // a <label for> click is forwarded to the host: move focus to the real control
      on("click", (event) => {
        if (event.target === this) this.#input?.focus();
      });
      on("invalid", () => {
        this.#showErrors = true;
        this.#validate();
      });

      this.#syncLabels();
      this.#syncAll();
      this.#commit();
    }

    #renderCustom(on: Listen, signal: AbortSignal) {
      const id = this.#id;
      const messages = this.#messages;
      const label = this.#range ? messages.chooseDates : messages.chooseDate;

      this.innerHTML = `
        <div class="ds-date-picker__field">
          <input type="text" class="ds-date-picker__input" role="combobox" autocomplete="off"
            placeholder="${this.#pattern}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog" aria-describedby="${id}-hint">
          <button type="button" class="ds-date-picker__toggle" tabindex="-1"
            aria-label="${label}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog">${CALENDAR_ICON}</button>
        </div>
        <span id="${id}-hint" hidden>${messages.formatHint(this.#pattern)}</span>
        <div id="${id}-dialog" class="ds-date-picker__dialog" role="dialog" aria-label="${label}"
          popover="manual">
          <${this.#calendarTag}>
            <ds-calendar-select-month></ds-calendar-select-month>
            <ds-calendar-select-year></ds-calendar-select-year>
          </${this.#calendarTag}>
        </div>`;

      // a completed pick; the calendar's own change stays inside (the input reports one)
      this.#calendar?.addEventListener(
        "change",
        (event) => {
          event.stopPropagation();
          this.#edit(this.#calendar?.value ?? "");
          this.#close(true);
          this.#input?.dispatchEvent(new Event("input", { bubbles: true }));
          this.#input?.dispatchEvent(new Event("change", { bubbles: true }));
        },
        { signal },
      );

      on("click", (event) => {
        if (!(event.target as Element).closest(".ds-date-picker__toggle")) return;
        if (this.#isOpen) this.#close(true);
        else this.#open();
      });

      // clicks inside the popover keep focus where it is (Safari does not focus clicked
      // buttons, so focus would jump to <body> and close the popover); the calendar
      // moves focus itself when a day is clicked
      on("mousedown", (event) => {
        const target = event.target as Element;
        // except form controls: a <select> would not open
        if (this.#part("dialog")?.contains(target) && !target.closest("select")) event.preventDefault();
      });

      on("focusout", (event) => {
        if (this.contains(event.relatedTarget as Node | null)) return;
        // no target: either focus really left, or the calendar re-rendered (which removes
        // the focused day right before the new one gets focus)
        queueMicrotask(() => {
          if (!this.contains(document.activeElement)) this.#close(false);
        });
      });

      on("keydown", (event) => {
        if (event.key === "ArrowDown" && event.target === this.#input && !this.#isOpen) {
          event.preventDefault();
          this.#open();
        } else if (event.key === "Escape" && this.#isOpen) {
          event.preventDefault();
          this.#close(true);
        }
      });

      // typed text is committed on change (blur or Enter)
      on("change", (event) => {
        const input = this.#input;
        if (input && event.target === input) this.#edit(input.value);
      });
    }

    // ---- value ----

    /** a value from code: the default, the property, a reset or a restore */
    #setValue(value: string) {
      this.#badInput = false;
      this.#value = value;
      this.#selection.set(value);
      this.#commit();
    }

    /** a value from the user: typed, picked in the calendar or in the native picker */
    #edit(text: string) {
      this.#dirty = true;
      this.#showErrors = true;
      this.#badInput = text.trim() !== "" && !this.#selection.parse(text);
      this.#value = this.#badInput ? "" : text;
      this.#selection.set(this.#value);
      // bad text stays in the input so it can be corrected
      this.#commit(this.#badInput);
    }

    /** push the selection to the form, the input and the validity state */
    #commit(keepText = false) {
      const value = this.value;
      this.#internals.setFormValue(value || null, value);

      const input = this.#input;
      if (input && !keepText) {
        const text = input.type === "date" ? (this.#selection.first?.toString() ?? "") : this.#text;
        if (input.value !== text) input.value = text;
      }
      this.#validate();
    }

    #validate() {
      const input = this.#input ?? undefined;
      const { first, last } = this.#selection;
      const messages = this.#messages;
      const range = this.#range;
      const date = (day: PlainDate) => format(day, FULL_DATE, this.#resolvedLocale);
      const unavailable = unavailableDays(this.#disallowed, this.#disallowedWeekdays, this.#isDateDisallowed);

      const [flag, message]: [keyof ValidityStateFlags, string] | [] = this.#badInput
        ? ["badInput", (range ? messages.badInputRange : messages.badInput)(this.#pattern)]
        : !first || !last
          ? this.#required
            ? ["valueMissing", range ? messages.valueMissingRange : messages.valueMissing]
            : []
          : this.#min && isOutside(first, this.#min, null)
            ? ["rangeUnderflow", messages.rangeUnderflow(date(this.#min))]
            : this.#max && isOutside(last, null, this.#max)
              ? ["rangeOverflow", messages.rangeOverflow(date(this.#max))]
              : unavailable(first) || unavailable(last)
                ? ["customError", messages.unavailable]
                : [];

      if (flag) this.#internals.setValidity({ [flag]: true }, message, input);
      else this.#internals.setValidity({});
      input?.setAttribute("aria-invalid", String(this.#showErrors && Boolean(flag)));
    }

    // ---- syncing inner parts ----

    #syncAll() {
      this.#syncInput();
      this.#syncCalendar();
      this.#validate();
    }

    /** the inner input and toggle follow disabled / required (and min/max on the native input) */
    #syncInput() {
      const input = this.#input;
      if (!input) return;
      input.disabled = this.#isDisabled;
      const toggle = this.#part<HTMLButtonElement>("toggle");
      if (toggle) toggle.disabled = this.#isDisabled;
      input.setAttribute("aria-required", String(this.#required));
      if (input.type === "date") {
        // limits for the native picker; validity itself is reported by the host
        input.min = this.min;
        input.max = this.max;
      }
    }

    /** pass the calendar inputs on */
    #syncCalendar() {
      const calendar = this.#calendar;
      if (!calendar) return;
      calendar.min = this.min;
      calendar.max = this.max;
      calendar.today = this.today;
      calendar.months = this.#months;
      calendar.locale = this.#locale;
      calendar.firstDayOfWeek = this.#firstDayOfWeek;
      calendar.disallowed = this.#disallowed;
      calendar.disallowedWeekdays = this.#disallowedWeekdays;
      calendar.isDateDisallowed = this.#isDateDisallowed;
      // one month: fill the empty cells with the neighbouring days
      calendar.showOutsideDays = this.#months === 1;
    }

    /** the accessible name comes from <label for> (via ElementInternals) or aria-label */
    #syncLabels() {
      const input = this.#input;
      if (!input) return;
      const ids = Array.from(this.#internals.labels, (label, i) => {
        if (!(label instanceof HTMLElement)) return "";
        label.id ||= `${this.#id}-label-${i}`;
        return label.id;
      }).filter(Boolean);
      if (ids.length) input.setAttribute("aria-labelledby", ids.join(" "));
      else if (this.hasAttribute("aria-label")) {
        input.setAttribute("aria-label", this.getAttribute("aria-label")!);
      }
    }

    // ---- popover ----

    #setExpanded(expanded: boolean) {
      if (expanded) this.#internals.states.add("open");
      else this.#internals.states.delete("open");
      for (const name of ["input", "toggle"]) {
        this.#part(name)?.setAttribute("aria-expanded", String(expanded));
      }
    }

    #open() {
      const dialog = this.#part("dialog");
      const calendar = this.#calendar;
      if (!dialog || !calendar || this.#isDisabled) return;
      this.#setExpanded(true);
      if (!dialog.matches(":popover-open")) dialog.showPopover();
      // start on the selection (or today) in the day view
      calendar.value = this.value;
      calendar.focusedDate = "";
      calendar.focus();
    }

    #close(focusInput: boolean) {
      if (!this.#isOpen) return;
      this.#calendar?.cancel();
      this.#setExpanded(false);
      const dialog = this.#part("dialog");
      if (dialog?.matches(":popover-open")) dialog.hidePopover();
      if (focusInput) this.#input?.focus();
    }
  }
}

define(Module.tagName, Module.DatePicker);

globalThis.DsDatePicker = Module.DatePicker;

/** instance type of <ds-date-picker>: `import type { DsDatePicker } from "@combo/design-system/bundle/index.js"` */
export type DsDatePicker = Module.DatePicker;

declare global {
  export import DsDatePicker = Module.DatePicker;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsDatePicker;
  }
}
