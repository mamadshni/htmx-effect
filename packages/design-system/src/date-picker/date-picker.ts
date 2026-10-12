/**
 * <ds-date-picker>: a form-associated date (or date range) field: a text input, a toggle
 * button and a popover with a <ds-calendar>. Light DOM. Styles live in date-picker.css.
 *
 *   <label for="due">Due date</label>
 *   <ds-date-picker id="due" name="due" min="2026-01-01" max="2026-12-31" required></ds-date-picker>
 *
 *   <label for="stay">Stay</label>
 *   <ds-date-picker id="stay" name="stay" range months="2" disallowed-weekdays="0 6"></ds-date-picker>
 *
 * - Values are ISO dates (YYYY-MM-DD); with `range` an ISO 8601 interval (start/end).
 *   `start` and `end` expose the two ends (equal for a single date).
 * - Calendar attributes (min, max, months, locale, first-day-of-week, today, disallowed,
 *   disallowed-weekdays) and the isDateDisallowed property are passed to the calendar.
 * - The native <input type="date"> is used only on touch-first devices (`pointer: coarse`)
 *   and only when it can do everything asked for: `range` and unavailable days always get
 *   the calendar.
 * - ElementInternals makes it a real form control: value in FormData, validation
 *   (required, min/max, unavailable days, bad input), reset, restore, <fieldset disabled>
 *   and <label for>. ARIA lives on the focusable inner parts, where focus actually is.
 * - Inner `input`/`change` events bubble through the host.
 * - Custom states for styling: :state(native), :state(range), :state(open).
 */

import "../calendar/calendar.js";
import { createSelection, type Selection } from "../calendar/selection.js";
import { dateAttribute, define, listenOn, unavailableDays, type Listen } from "../shared.js";

namespace Module {
  const FORMAT = "YYYY-MM-DD";
  const RANGE_FORMAT = `${FORMAT} – ${FORMAT}`;
  const touchFirst = matchMedia("(pointer: coarse)");

  /** attributes passed straight to the calendar */
  const CALENDAR_ATTRIBUTES = [
    "min",
    "max",
    "months",
    "locale",
    "first-day-of-week",
    "today",
    "disallowed",
    "disallowed-weekdays",
  ];
  /** attributes the native picker cannot honour: when present, the calendar is used */
  const CALENDAR_ONLY = ["range", "disallowed", "disallowed-weekdays"];

  const CALENDAR_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 0h1v2h6V0h1v2h3v14H1V2h3zm10 5H2v10h12zM2 3v1h12V3z"/></svg>`;

  let nextId = 0;

  export class DatePicker extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ["value", "required", "disabled", "range", ...CALENDAR_ATTRIBUTES];

    #internals = this.attachInternals();
    #listeners?: AbortController;
    #id = "";
    #selection: Selection = createSelection(null);
    #isDateDisallowed?: ((date: Date) => boolean) | undefined;
    // like native inputs: once the value is edited, the `value` attribute is only the
    // default again after a form reset
    #dirty = false;
    // typed text that is not a valid value
    #badInput = false;
    // disabled by a <fieldset disabled>
    #disabledByForm = false;
    // like :user-invalid, errors are only shown after an edit or a submit attempt
    #showErrors = false;

    // ---- form control API (mirrors native inputs) ----

    /** "YYYY-MM-DD", or "YYYY-MM-DD/YYYY-MM-DD" with `range`; "" when empty */
    get value() {
      return this.#selection.value;
    }

    set value(value: string) {
      this.#dirty = true;
      this.#setValue(value);
    }

    get start() {
      return this.#selection.first;
    }

    get end() {
      return this.#selection.last;
    }

    /** unavailable days, on top of the disallowed attributes */
    get isDateDisallowed() {
      return this.#isDateDisallowed;
    }

    set isDateDisallowed(predicate: ((date: Date) => boolean) | undefined) {
      const wasNative = this.#useNative;
      this.#isDateDisallowed = predicate;
      if (this.isConnected && wasNative !== this.#useNative) {
        this.#render();
      } else {
        this.#syncCalendar();
        this.#validate();
      }
    }

    get name() {
      return this.getAttribute("name") ?? "";
    }

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

    // ---- lifecycle ----

    connectedCallback() {
      this.#id = this.id || `ds-date-picker-${nextId++}`;
      const value = this.#dirty ? this.value : (this.getAttribute("value") ?? "");
      this.#selection = createSelection(this.#isRange ? "range" : "single");
      this.#selection.set(value);
      this.#render();
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    attributeChangedCallback(name: string, previous: string | null, next: string | null) {
      if (!this.isConnected || previous === next) return;
      if (name === "value") {
        if (!this.#dirty) this.#setValue(next ?? "");
      } else if (name === "range") {
        const value = this.value;
        this.#selection = createSelection(this.#isRange ? "range" : "single");
        this.#selection.set(value);
        this.#render();
      } else if (CALENDAR_ONLY.includes(name) && touchFirst.matches) {
        // may switch between the native input and the calendar
        this.#render();
      } else {
        this.#syncInput();
        this.#syncCalendar();
        this.#validate();
      }
    }

    formResetCallback() {
      this.#dirty = false;
      this.#showErrors = false;
      this.#setValue(this.getAttribute("value") ?? "");
    }

    formStateRestoreCallback(state: unknown) {
      if (typeof state === "string") this.#setValue(state);
    }

    formDisabledCallback(disabled: boolean) {
      this.#disabledByForm = disabled;
      if (disabled) this.#close(false);
      this.#syncInput();
    }

    // ---- parts and derived state ----

    #part<T extends HTMLElement = HTMLElement>(name: string) {
      return this.querySelector<T>(`.ds-date-picker__${name}`);
    }

    get #input() {
      return this.#part<HTMLInputElement>("input");
    }

    get #calendar() {
      return this.querySelector("ds-calendar");
    }

    get #isOpen() {
      return this.#internals.states.has("open");
    }

    get #isRange() {
      return this.hasAttribute("range");
    }

    get #isDisabled() {
      return this.#disabledByForm || this.hasAttribute("disabled");
    }

    get #format() {
      return this.#isRange ? RANGE_FORMAT : FORMAT;
    }

    /** native picker only on touch-first devices, and only for what it supports */
    get #useNative() {
      return (
        touchFirst.matches &&
        !CALENDAR_ONLY.some((name) => this.hasAttribute(name)) &&
        !this.#isDateDisallowed
      );
    }

    /** the selection as shown in the text input */
    get #text() {
      const { first, last } = this.#selection;
      return this.#isRange && first ? `${first} – ${last}` : first;
    }

    // ---- rendering ----

    #render() {
      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const { signal } = this.#listeners;
      const on = listenOn(this, signal);

      const states = this.#internals.states;
      states.delete("open");
      if (this.#isRange) states.add("range");
      else states.delete("range");

      const native = this.#useNative;
      if (native) {
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

      this.#syncInput();
      this.#syncCalendar();
      this.#syncLabels();
      this.#commit();
    }

    #renderCustom(on: Listen, signal: AbortSignal) {
      const id = this.#id;
      const label = this.#isRange ? "Choose dates" : "Choose date";

      this.innerHTML = `
        <div class="ds-date-picker__field">
          <input type="text" class="ds-date-picker__input" role="combobox" autocomplete="off"
            placeholder="${this.#format}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog" aria-describedby="${id}-hint">
          <button type="button" class="ds-date-picker__toggle" tabindex="-1"
            aria-label="${label}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog">${CALENDAR_ICON}</button>
        </div>
        <span id="${id}-hint" hidden>Format: ${this.#format}</span>
        <div id="${id}-dialog" class="ds-date-picker__dialog" role="dialog" aria-label="${label}"
          popover="manual">
          <ds-calendar></ds-calendar>
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
        if (this.#part("dialog")?.contains(event.target as Node)) event.preventDefault();
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

    // ---- state ----

    /** a value from code: the attribute, the property, a reset or a restore */
    #setValue(value: string) {
      this.#badInput = false;
      this.#selection.set(value);
      this.#commit();
    }

    /** a value from the user: typed, picked in the calendar or in the native picker */
    #edit(text: string) {
      this.#dirty = true;
      this.#showErrors = true;
      this.#badInput = text.trim() !== "" && !this.#selection.parse(text);
      this.#selection.set(this.#badInput ? "" : text);
      // bad text stays in the input so it can be corrected
      this.#commit(this.#badInput);
    }

    /** push the selection to the form, the input and the validity state */
    #commit(keepText = false) {
      const value = this.value;
      this.#internals.setFormValue(value || null, value);

      const input = this.#input;
      if (input && !keepText) {
        const text = input.type === "date" ? this.#selection.first : this.#text;
        if (input.value !== text) input.value = text;
      }
      this.#validate();
    }

    #validate() {
      const input = this.#input ?? undefined;
      const { first, last } = this.#selection;
      const min = dateAttribute(this, "min");
      const max = dateAttribute(this, "max");
      const what = this.#isRange ? "dates" : "a date";
      const unavailable = first ? unavailableDays(this, this.#isDateDisallowed) : undefined;

      const [flag, message]: [keyof ValidityStateFlags, string] | [] = this.#badInput
        ? ["badInput", `Enter ${what} as ${this.#format}.`]
        : this.hasAttribute("required") && !first
          ? ["valueMissing", `Please choose ${what}.`]
          : first && min && first < min
            ? ["rangeUnderflow", `Choose ${min} or later.`]
            : last && max && last > max
              ? ["rangeOverflow", `Choose ${max} or earlier.`]
              : unavailable && (unavailable(first) || unavailable(last))
                ? ["customError", "This date is not available."]
                : [];

      if (flag) this.#internals.setValidity({ [flag]: true }, message, input);
      else this.#internals.setValidity({});
      input?.setAttribute("aria-invalid", String(this.#showErrors && Boolean(flag)));
    }

    // ---- syncing inner parts ----

    /** mirror host attributes onto the inner input and toggle */
    #syncInput() {
      const input = this.#input;
      if (!input) return;
      input.disabled = this.#isDisabled;
      const toggle = this.#part<HTMLButtonElement>("toggle");
      if (toggle) toggle.disabled = this.#isDisabled;
      input.setAttribute("aria-required", String(this.hasAttribute("required")));
      if (input.type === "date") {
        // limits for the native picker; validity itself is reported by the host
        for (const name of ["min", "max"]) {
          const value = this.getAttribute(name);
          if (value) input.setAttribute(name, value);
          else input.removeAttribute(name);
        }
      }
    }

    /** pass the calendar attributes on */
    #syncCalendar() {
      const calendar = this.#calendar;
      if (!calendar) return;
      calendar.setAttribute("selection", this.#isRange ? "range" : "single");
      for (const name of CALENDAR_ATTRIBUTES) {
        const value = this.getAttribute(name);
        if (value === null) calendar.removeAttribute(name);
        else calendar.setAttribute(name, value);
      }
      calendar.isDateDisallowed = this.#isDateDisallowed;
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

define("ds-date-picker", Module.DatePicker);

globalThis.DsDatePicker = Module.DatePicker;

/** instance type of <ds-date-picker>: `import type { DsDatePicker } from "@combo/design-system/bundle/index.js"` */
export type DsDatePicker = Module.DatePicker;

declare global {
  export import DsDatePicker = Module.DatePicker;

  interface HTMLElementTagNameMap {
    "ds-date-picker": DsDatePicker;
  }
}
