/**
 * <ds-date-picker>: a form-associated date (or date range) field. Light DOM; it renders its
 * own parts. Styles live in date-picker.css.
 *
 *   <label for="due">Due date</label>
 *   <ds-date-picker id="due" name="due" value="2026-10-12" min="2026-01-01" max="2026-12-31" required>
 *   </ds-date-picker>
 *
 *   <label for="stay">Stay</label>
 *   <ds-date-picker id="stay" name="stay" range value="2026-10-01/2026-10-05"></ds-date-picker>
 *
 * - Values are ISO dates (YYYY-MM-DD); with `range` an ISO 8601 interval (start/end).
 *   `start` and `end` expose the two ends (equal for a single date).
 * - Native <input type="date"> is used only on touch-first devices (`pointer: coarse`) and
 *   only for features it supports; `range` always uses the calendar popover.
 * - The calendar has three views (day, month, year), each a DatePickerView. The heading
 *   button zooms out (days → months → years); picking a year or month zooms back in.
 *   In range mode the first picked day is an anchor; the second one completes the range.
 *   This element owns the state (selection, cursor, current view), the popover and focus.
 * - ElementInternals makes it a real form control: value in FormData, validation
 *   (required/min/max/bad input), reset, restore, <fieldset disabled>, and <label for>.
 *   ARIA lives on the focusable inner parts (input, dialog, grid), where focus actually is.
 * - Inner `input`/`change` events bubble through the host.
 * - Custom states for styling: :state(native), :state(range), :state(open).
 */

import {
  clamp,
  daysInMonth,
  fromParts,
  isIsoDate,
  parseRange,
  partsOf,
  todayIso,
  type IsoDate,
} from "./date.js";
import { DayView } from "./day-view.js";
import { MonthView } from "./month-view.js";
import type { DatePickerView, ViewContext } from "./view.js";
import { YearView } from "./year-view.js";

namespace Module {
  const FORMAT = "YYYY-MM-DD";
  const RANGE_FORMAT = `${FORMAT} – ${FORMAT}`;
  const touchFirst = matchMedia("(pointer: coarse)");

  const views = { day: new DayView(), month: new MonthView(), year: new YearView() };
  /** heading button: one level up */
  const zoomOut = { day: views.month, month: views.year, year: undefined };
  /** picking a cell: one level down (undefined = pick the day) */
  const zoomIn = { day: undefined, month: views.day, year: views.month };

  const CALENDAR_ICON = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 0h1v2h6V0h1v2h3v14H1V2h3zm10 5H2v10h12zM2 3v1h12V3z"/></svg>`;

  type Listen = <K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (event: HTMLElementEventMap[K]) => void,
  ) => void;

  let nextId = 0;

  export class DatePicker extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ["value", "min", "max", "required", "disabled", "range"];

    #internals = this.attachInternals();
    #listeners?: AbortController;
    #id = "";
    // the selection; a single date has start === end
    #start: IsoDate | "" = "";
    #end: IsoDate | "" = "";
    // like native inputs: once the user (or code) sets the value, the `value` attribute
    // only provides the default again after a form reset
    #dirty = false;
    // text the user typed that is not a valid date (custom mode)
    #badInput = false;
    #disabled = false;
    // like :user-invalid, errors are only shown after an edit or a submit attempt
    #showErrors = false;
    // calendar state
    #view: DatePickerView = views.day;
    #cursor: IsoDate = todayIso();
    // range mode: the first picked day, waiting for the second
    #anchor: IsoDate | "" = "";

    // ---- form control API (mirrors native inputs) ----

    /** "YYYY-MM-DD", or "YYYY-MM-DD/YYYY-MM-DD" with `range`; "" when empty */
    get value() {
      if (!this.#start) return "";
      return this.#isRange ? `${this.#start}/${this.#end}` : this.#start;
    }

    set value(value: string) {
      this.#dirty = true;
      this.#setValue(value);
    }

    get start() {
      return this.#start;
    }

    get end() {
      return this.#end;
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
      if (!this.#dirty) this.#assign(this.getAttribute("value") ?? "");
      this.#render();
    }

    disconnectedCallback() {
      this.#listeners?.abort();
    }

    attributeChangedCallback(name: string) {
      if (!this.isConnected) return;
      if (name === "range") {
        // single ↔ range changes the parts (and possibly native ↔ custom)
        this.#setValue(this.value);
        this.#render();
      } else if (name === "value") {
        if (!this.#dirty) this.#setValue(this.getAttribute("value") ?? "");
      } else {
        this.#syncInput();
        this.#validate();
        if (this.#isOpen) this.#show(this.#view, this.#cursor, this.#gridHasFocus);
      }
    }

    formResetCallback() {
      this.#dirty = false;
      this.#badInput = false;
      this.#showErrors = false;
      this.#setValue(this.getAttribute("value") ?? "");
    }

    formStateRestoreCallback(state: unknown) {
      if (typeof state === "string") this.#setValue(state);
    }

    formDisabledCallback(disabled: boolean) {
      this.#disabled = disabled;
      if (disabled) this.#close(false);
      this.#syncInput();
    }

    // ---- parts and derived state ----

    #part<T extends HTMLElement>(name: string) {
      return this.querySelector<T>(`.ds-date-picker__${name}`);
    }

    get #input() {
      return this.#part<HTMLInputElement>("input");
    }

    get #toggle() {
      return this.#part<HTMLButtonElement>("toggle");
    }

    get #dialog() {
      return this.#part("dialog");
    }

    get #grid() {
      return this.#part<HTMLTableElement>("grid");
    }

    get #isOpen() {
      return this.#internals.states.has("open");
    }

    get #isRange() {
      return this.hasAttribute("range");
    }

    /** native picker only on touch-first devices, and only for what it supports */
    get #useNative() {
      return touchFirst.matches && !this.#isRange;
    }

    get #gridHasFocus() {
      return this.#grid?.contains(document.activeElement) ?? false;
    }

    get #min() {
      const min = this.getAttribute("min");
      return min && isIsoDate(min) ? min : null;
    }

    get #max() {
      const max = this.getAttribute("max");
      return max && isIsoDate(max) ? max : null;
    }

    get #context(): ViewContext {
      return { start: this.#start, end: this.#end, min: this.#min, max: this.#max };
    }

    /** the selection as shown in the text input */
    get #text() {
      if (!this.#start) return "";
      return this.#isRange ? `${this.#start} – ${this.#end}` : this.#start;
    }

    // ---- rendering ----

    #render() {
      this.#listeners?.abort();
      this.#listeners = new AbortController();
      const { signal } = this.#listeners;
      const on: Listen = (type, handler) => this.addEventListener(type, handler, { signal });

      this.#internals.states.delete("open");
      this.#anchor = "";
      if (this.#isRange) this.#internals.states.add("range");
      else this.#internals.states.delete("range");
      const native = this.#useNative;
      if (native) {
        this.#internals.states.add("native");
        this.innerHTML = `<input type="date" class="ds-date-picker__input">`;
      } else {
        this.#internals.states.delete("native");
        this.#renderCustom(on);
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
      on("input", (event) => {
        // native mode: the browser picker always produces a valid ISO value
        const input = this.#input;
        if (native && input && event.target === input) {
          this.#dirty = true;
          this.#showErrors = true;
          this.#setValue(input.value);
        }
      });

      this.#syncInput();
      this.#syncLabels();
      this.#setValue(this.value);
    }

    #renderCustom(on: Listen) {
      const id = this.#id;
      const range = this.#isRange;
      const format = range ? RANGE_FORMAT : FORMAT;
      const label = range ? "Choose dates" : "Choose date";

      this.innerHTML = `
        <div class="ds-date-picker__field">
          <input type="text" class="ds-date-picker__input" role="combobox" autocomplete="off"
            placeholder="${format}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog" aria-describedby="${id}-hint">
          <button type="button" class="ds-date-picker__toggle" tabindex="-1"
            aria-label="${label}" aria-haspopup="dialog" aria-expanded="false"
            aria-controls="${id}-dialog">${CALENDAR_ICON}</button>
        </div>
        <span id="${id}-hint" hidden>Format: ${format}</span>
        <div id="${id}-dialog" class="ds-date-picker__dialog" role="dialog" aria-label="${label}"
          popover="manual">
          <div class="ds-date-picker__header">
            <button type="button" class="ds-date-picker__previous" data-page="-1">‹</button>
            <button type="button" class="ds-date-picker__heading" id="${id}-heading"
              aria-live="polite"></button>
            <button type="button" class="ds-date-picker__next" data-page="1">›</button>
          </div>
          <table class="ds-date-picker__grid" role="grid" aria-labelledby="${id}-heading"
            ${range ? `aria-multiselectable="true"` : ""}></table>
          ${range ? `<p class="ds-date-picker__status" aria-live="polite"></p>` : ""}
        </div>`;

      on("click", (event) => {
        const target = event.target as Element;
        if (target.closest(".ds-date-picker__toggle")) {
          if (this.#isOpen) this.#close(true);
          else this.#open(true);
        } else if (target.closest(".ds-date-picker__heading")) {
          const up = zoomOut[this.#view.name];
          if (up) this.#show(up, this.#cursor, true);
        } else {
          const page = target.closest<HTMLElement>("[data-page]")?.dataset.page;
          if (page) {
            this.#show(this.#view, this.#view.page(this.#cursor, Number(page), false), this.#gridHasFocus);
            return;
          }
          const cell = target.closest<HTMLElement>("td[data-date]");
          if (cell) this.#pick(cell);
        }
      });

      // range preview follows the pointer (keyboard moves preview through #moveTo)
      on("pointerover", (event) => {
        const date = (event.target as Element).closest<HTMLElement>("td[data-date]")?.dataset.date;
        if (date) this.#preview(date);
      });

      // clicks inside the calendar keep focus where it is (Safari does not focus clicked
      // buttons, so focus would otherwise jump to <body> and close the popover)
      on("mousedown", (event) => {
        if (this.#dialog?.contains(event.target as Node)) event.preventDefault();
      });

      on("focusout", (event) => {
        if (this.contains(event.relatedTarget as Node | null)) return;
        // no target: either focus really left, or the grid was re-rendered (which removes
        // the focused cell right before the new one gets focus)
        queueMicrotask(() => {
          if (!this.contains(document.activeElement)) this.#close(false);
        });
      });

      on("keydown", (event) => {
        const target = event.target as Element;
        if (target === this.#input) this.#onInputKeyDown(event);
        else if (target.matches("td[data-date]")) this.#onGridKeyDown(event, target as HTMLElement);
        else if (event.key === "Escape" && this.#isOpen) {
          event.preventDefault();
          this.#close(true);
        }
      });

      on("change", (event) => {
        const input = this.#input;
        if (!input || event.target !== input) return;
        // typed text is committed on change (blur or Enter)
        const text = input.value.trim();
        this.#dirty = true;
        this.#showErrors = true;
        this.#badInput = text !== "" && !this.#parse(text);
        if (this.#badInput) {
          this.#assign("");
          this.#commit({ keepText: true });
        } else {
          this.#setValue(text);
        }
      });
    }

    /** render a view for the page that contains the cursor */
    #show(view: DatePickerView, cursor: IsoDate, focusGrid: boolean) {
      const grid = this.#grid;
      const heading = this.#part("heading");
      if (!grid || !heading) return;

      this.#view = view;
      this.#cursor = cursor;
      view.render(grid, cursor, this.#context);

      heading.textContent = view.heading(cursor);
      if (zoomOut[view.name]) heading.removeAttribute("aria-disabled");
      else heading.setAttribute("aria-disabled", "true");
      this.#part("previous")?.setAttribute("aria-label", view.previousLabel);
      this.#part("next")?.setAttribute("aria-label", view.nextLabel);
      this.#syncStatus();

      if (focusGrid) this.#cell(view.unitOf(cursor))?.focus();
      this.#preview(cursor);
    }

    #cell(date: IsoDate) {
      return this.#grid?.querySelector<HTMLElement>(`td[data-date="${date}"]`);
    }

    /** keyboard move: stay on this page when possible, otherwise show the page of the cursor */
    #moveTo(cursor: IsoDate) {
      const cell = this.#cell(this.#view.unitOf(cursor));
      // a dimmed neighbouring day is visible, but focusing it switches to its month
      if (!cell || cell.hasAttribute("data-outside")) {
        this.#show(this.#view, cursor, true);
        return;
      }
      this.#cursor = cursor;
      for (const other of this.#grid!.querySelectorAll<HTMLElement>("td[data-date]")) {
        other.tabIndex = other === cell ? 0 : -1;
      }
      cell.focus();
      this.#preview(cursor);
    }

    /** a cell was chosen: zoom in, or pick the day */
    #pick(cell: HTMLElement) {
      const date = cell.dataset.date;
      if (!date || cell.getAttribute("aria-disabled") === "true") return;

      const down = zoomIn[this.#view.name];
      if (down) {
        // keep the cursor's day (and month, when picking a year) where possible
        const picked = partsOf(date);
        const cursor = partsOf(this.#cursor);
        const month = this.#view.name === "year" ? cursor.month : picked.month;
        const day = Math.min(cursor.day, daysInMonth(picked.year, month));
        this.#show(down, fromParts(picked.year, month, day), true);
      } else if (!this.#isRange) {
        this.#select(date, date);
      } else if (!this.#anchor) {
        // first end of a range: wait for the second one
        this.#anchor = date;
        this.#cursor = date;
        this.#syncStatus();
        this.#preview(date);
      } else {
        const [start, end] = this.#anchor <= date ? [this.#anchor, date] : [date, this.#anchor];
        this.#select(start, end);
      }
    }

    /** range mode: highlight anchor…date while the second end is being chosen */
    #preview(date: IsoDate) {
      const grid = this.#grid;
      if (!grid || this.#view.name !== "day") return;
      const anchor = this.#anchor;
      const [from, to] = anchor <= date ? [anchor, date] : [date, anchor];
      grid.toggleAttribute("data-picking", Boolean(anchor));
      for (const cell of grid.querySelectorAll<HTMLElement>("td[data-date]")) {
        const day = cell.dataset.date!;
        cell.toggleAttribute("data-anchor", Boolean(anchor) && day === anchor);
        cell.toggleAttribute("data-preview", Boolean(anchor) && day >= from && day <= to);
      }
    }

    #syncStatus() {
      const status = this.#part("status");
      if (status) status.textContent = this.#anchor ? "Select end date" : "Select start date";
    }

    // ---- state ----

    /** a typed or assigned value: [start, end], or undefined when it is not a valid value */
    #parse(text: string) {
      if (this.#isRange) return parseRange(text);
      return isIsoDate(text) ? ([text, text] as const) : undefined;
    }

    /** set the selection without side effects (invalid text clears it, like native inputs) */
    #assign(value: string) {
      const [start, end] = this.#parse(value) ?? ["", ""];
      this.#start = start;
      this.#end = end;
    }

    #setValue(value: string) {
      this.#assign(value);
      this.#commit();
    }

    /** push the selection to the form, the text input and the validity state */
    #commit({ keepText = false } = {}) {
      if (!keepText) this.#badInput = false;
      const value = this.value;
      this.#internals.setFormValue(value || null, value);

      const input = this.#input;
      if (input && !keepText) {
        const text = input.type === "date" ? this.#start : this.#text;
        if (input.value !== text) input.value = text;
      }
      this.#validate();
    }

    #validate() {
      const input = this.#input ?? undefined;
      const min = this.#min;
      const max = this.#max;
      const format = this.#isRange ? RANGE_FORMAT : FORMAT;
      const what = this.#isRange ? "dates" : "a date";

      if (this.#badInput) {
        this.#internals.setValidity({ badInput: true }, `Enter ${what} as ${format}.`, input);
      } else if (this.hasAttribute("required") && !this.#start) {
        this.#internals.setValidity({ valueMissing: true }, `Please choose ${what}.`, input);
      } else if (this.#start && min && this.#start < min) {
        this.#internals.setValidity({ rangeUnderflow: true }, `Choose ${min} or later.`, input);
      } else if (this.#end && max && this.#end > max) {
        this.#internals.setValidity({ rangeOverflow: true }, `Choose ${max} or earlier.`, input);
      } else {
        this.#internals.setValidity({});
      }
      input?.setAttribute("aria-invalid", String(this.#showErrors && !this.#internals.validity.valid));
    }

    /** mirror host attributes onto the inner input */
    #syncInput() {
      const input = this.#input;
      if (!input) return;
      const disabled = this.#disabled || this.hasAttribute("disabled");
      input.disabled = disabled;
      if (this.#toggle) this.#toggle.disabled = disabled;
      input.setAttribute("aria-required", String(this.hasAttribute("required")));
      if (input.type === "date") {
        // limits for the native picker; validity itself is reported by the host
        for (const name of ["min", "max"] as const) {
          const value = this.getAttribute(name);
          if (value) input.setAttribute(name, value);
          else input.removeAttribute(name);
        }
      }
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

    #open(focusGrid: boolean) {
      const dialog = this.#dialog;
      if (!dialog || this.#disabled || this.hasAttribute("disabled")) return;
      this.#anchor = "";
      this.#internals.states.add("open");
      this.#input?.setAttribute("aria-expanded", "true");
      this.#toggle?.setAttribute("aria-expanded", "true");
      if (!dialog.matches(":popover-open")) dialog.showPopover();
      // always start at the day view, on the selection (or today), within min/max
      this.#show(views.day, clamp(this.#start || todayIso(), this.#min, this.#max), focusGrid);
    }

    #close(focusInput: boolean) {
      if (!this.#isOpen) return;
      // an unfinished range is dropped
      this.#anchor = "";
      this.#preview(this.#cursor);
      this.#syncStatus();
      this.#internals.states.delete("open");
      this.#input?.setAttribute("aria-expanded", "false");
      this.#toggle?.setAttribute("aria-expanded", "false");
      const dialog = this.#dialog;
      if (dialog?.matches(":popover-open")) dialog.hidePopover();
      if (focusInput) this.#input?.focus();
    }

    #select(start: IsoDate, end: IsoDate) {
      this.#dirty = true;
      this.#showErrors = true;
      this.#start = start;
      this.#end = end;
      this.#commit();
      this.#close(true);
      const input = this.#input;
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      input?.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // ---- keyboard ----

    #onInputKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowDown" && !this.#isOpen) {
        event.preventDefault();
        this.#open(true);
      } else if (event.key === "Escape" && this.#isOpen) {
        event.preventDefault();
        this.#close(true);
      }
    }

    #onGridKeyDown(event: KeyboardEvent, cell: HTMLElement) {
      const next = this.#view.cursorForKey(event, this.#cursor, this.#context);
      if (next) {
        event.preventDefault();
        this.#moveTo(next);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this.#pick(cell);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.#close(true);
      }
    }
  }
}

if (!customElements.get("ds-date-picker")) {
  customElements.define("ds-date-picker", Module.DatePicker);
}

globalThis.DsDatePicker = Module.DatePicker;

/** instance type of <ds-date-picker>: `import type { DsDatePicker } from "@combo/design-system/bundle/index.js"` */
export type DsDatePicker = Module.DatePicker;

declare global {
  export import DsDatePicker = Module.DatePicker;

  interface HTMLElementTagNameMap {
    "ds-date-picker": DsDatePicker;
  }
}
