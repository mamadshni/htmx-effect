/**
 * <app-range-picker>: a date range field built on cally's <calendar-range>. A button opens a
 * popover with relative presets on the side ("this week", "last month" …), two months and
 * Cancel / Apply. Light DOM, form-associated. Browser code, bundled by the server with esbuild.
 *
 *   <label for="period">Zeitraum</label>
 *   <app-range-picker id="period" name="period" preset="last-week" locale="de"></app-range-picker>
 *
 * Inputs (attributes; property ↔ attribute where it makes sense):
 *   value     default "start/end" (ISO 8601 interval); "" = all time
 *   preset    default preset id (wins over value): this-week, last-week, this-month, last-month,
 *             this-year, last-year, all, or month-YYYY-MM. Relative ones are recomputed each open.
 *   name      name in FormData
 *   locale    "" = the nearest lang, else the browser's (text: en/de)
 * Properties: value, preset (the applied ones), form, labels.
 * A range picked by hand stays fixed, even when it equals a preset (that preset is only
 * highlighted); only a clicked preset is applied as relative.
 * Event: change ({ value, preset }) when a range is applied.
 */

import "cally";
import { Temporal } from "@js-temporal/polyfill";
import {
  firstDayOfWeek,
  formatMonth,
  formatRange,
  fromValue,
  matchPreset,
  messagesFor,
  presetsFor,
  toValue,
  type PlainDate,
} from "./presets.js";

namespace Module {
  export const tagName = "app-range-picker" as const;

  const MONTHS = 2;
  const icon = (path: string) =>
    `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false"><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" d="${path}"/></svg>`;
  const CALENDAR = icon("M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3");
  const PREVIOUS = icon("M10 3 5 8l5 5");
  const NEXT = icon("M6 3l5 5-5 5");

  /** cally's <calendar-range>, as far as it is used here */
  interface CallyRange extends HTMLElement {
    value: string;
    /** extra CSS part names for a day's button */
    getDayParts: (date: Date) => string;
    focus(options?: FocusOptions): void;
  }

  /** the day of one of cally's event details (a Date at UTC midnight) */
  const plainDateOf = (date: Date) => Temporal.PlainDate.from(date.toISOString().slice(0, 10));

  let nextId = 0;

  export class RangePicker extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = ["value", "preset", "name", "locale"] as const;

    attributeChangedCallback(
      _name: (typeof RangePicker.observedAttributes)[number],
      oldValue: string | null,
      newValue: string | null,
    ) {
      if (newValue !== oldValue && this.isConnected) this.#reset();
    }

    #internals = this.attachInternals();
    #id = "";

    // ---- applied state ----

    #value = "";
    #preset = "";

    /** the applied range: "start/end", or "" for all time (or nothing chosen) */
    get value() {
      return this.#value;
    }
    set value(value: string) {
      if (fromValue(value) === undefined) {
        console.warn(`${tagName}.value: expected "YYYY-MM-DD/YYYY-MM-DD" or "", got ${JSON.stringify(value)}`);
        return;
      }
      this.#apply(value, "");
    }

    /** the applied preset's id, or "" for a range picked by hand */
    get preset() {
      return this.#preset;
    }
    set preset(id: string) {
      const preset = this.#presets.find((p) => p.id === id);
      if (preset) this.#apply(toValue(preset.range), preset.id);
      else console.warn(`${tagName}.preset: unknown preset ${JSON.stringify(id)}`);
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

    // ---- what is being chosen in the open popover ----

    #draft = "";
    /** the clicked preset, or "" for a range picked by hand */
    #draftPreset = "";
    /** the first month cally shows (it does not tell, so it is followed here) */
    #page = Temporal.Now.plainDateISO().toPlainYearMonth();

    // ---- lifecycle ----

    connectedCallback() {
      this.#id ||= this.id || `${tagName}-${nextId++}`;
      this.#render();
      this.#reset();
    }

    formResetCallback() {
      this.#reset();
    }

    // ---- derived ----

    get #locale() {
      return this.getAttribute("locale") || this.closest("[lang]")?.getAttribute("lang") || navigator.language;
    }

    get #messages() {
      return messagesFor(this.#locale);
    }

    get #today() {
      return Temporal.Now.plainDateISO();
    }

    get #presets() {
      return presetsFor(this.#today, this.#locale);
    }

    #part<T extends HTMLElement = HTMLElement>(name: string) {
      return this.querySelector<T>(`.app-range-picker__${name}`);
    }

    get #calendar() {
      return this.querySelector<CallyRange>("calendar-range");
    }

    // ---- rendering ----

    #render() {
      const id = this.#id;
      const t = this.#messages;
      this.innerHTML = `
        <button type="button" class="app-range-picker__trigger" popovertarget="${id}-dialog" aria-haspopup="dialog">
          ${CALENDAR}<span class="app-range-picker__label"></span>
        </button>
        <div id="${id}-dialog" class="app-range-picker__dialog" popover role="dialog" aria-label="${t.placeholder}">
          <ul class="app-range-picker__presets" aria-label="${t.presets}"></ul>
          <div class="app-range-picker__main">
            <div class="app-range-picker__calendar"></div>
            <div class="app-range-picker__footer">
              <button type="button" class="app-range-picker__cancel">${t.cancel}</button>
              <button type="button" class="app-range-picker__apply">${t.apply}</button>
            </div>
          </div>
        </div>`;

      // the popover sits under its button (CSS anchor positioning)
      this.#part("trigger")!.style.setProperty("anchor-name", `--${id}`);
      const dialog = this.#part("dialog")!;
      dialog.style.setProperty("position-anchor", `--${id}`);

      dialog.addEventListener("beforetoggle", (event) => {
        if ((event as ToggleEvent).newState === "open") this.#open();
      });
      dialog.addEventListener("toggle", (event) => {
        if ((event as ToggleEvent).newState === "open") requestAnimationFrame(() => this.#calendar?.focus());
      });
      this.#part("presets")!.addEventListener("click", (event) => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button[data-preset]");
        const preset = this.#presets.find((p) => p.id === button?.dataset.preset);
        if (!preset) return;
        this.#choose(toValue(preset.range), preset.id);
        this.#renderCalendar();
      });
      this.#part("cancel")!.addEventListener("click", () => dialog.hidePopover());
      this.#part("apply")!.addEventListener("click", () => {
        this.#apply(this.#draft, this.#draftPreset);
        dialog.hidePopover();
        this.#part("trigger")?.focus();
        this.dispatchEvent(
          new CustomEvent("change", { bubbles: true, detail: { value: this.#value, preset: this.#preset } }),
        );
      });
      // a <label for> click lands on the host: open the field's button instead
      this.addEventListener("click", (event) => {
        if (event.target === this) this.#part("trigger")?.focus();
      });
    }

    /** the button text: the preset's name, else the range, else the placeholder */
    #renderLabel() {
      const label = this.#part("label");
      if (!label) return;
      const preset = this.#presets.find((p) => p.id === this.#preset);
      const range = fromValue(this.#value);
      label.textContent = preset?.label ?? (range ? formatRange(range, this.#locale) : this.#messages.placeholder);
      label.toggleAttribute("data-placeholder", !preset && !range);
    }

    /** the presets for today (labels like "Juni 2026" move with it) */
    #renderPresets() {
      const list = this.#part("presets");
      if (!list) return;
      list.innerHTML = this.#presets
        .map(({ id, label }) => `<li><button type="button" data-preset="${id}" aria-pressed="false">${label}</button></li>`)
        .join("");
    }

    /** mark the clicked preset, or the one the picked range equals (in place, so a focused preset keeps its focus) */
    #renderPressed() {
      const pressed = this.#draftPreset || matchPreset(this.#presets, this.#draft)?.id;
      for (const button of this.querySelectorAll<HTMLButtonElement>("button[data-preset]")) {
        button.setAttribute("aria-pressed", String(button.dataset.preset === pressed));
      }
    }

    /** a fresh calendar on the draft: cally then starts its page on the draft's first day */
    #renderCalendar() {
      const slot = this.#part("calendar");
      if (!slot) return;
      const t = this.#messages;
      const today = this.#today;
      const focus = fromValue(this.#draft)?.start ?? today;
      const month = (offset: number) => `
        <div class="app-range-picker__month">
          <h3 class="app-range-picker__month-title" aria-hidden="true"></h3>
          <calendar-month${offset ? ` offset="${offset}"` : ""}></calendar-month>
        </div>`;

      slot.innerHTML = `
        <calendar-range months="${MONTHS}" show-outside-days format-weekday="short"
          locale="${this.#locale}" first-day-of-week="${firstDayOfWeek(this.#locale)}"
          max="${today}" value="${this.#draft}" focused-date="${focus}">
          <span slot="previous">${PREVIOUS}<span class="app-range-picker__hidden">${t.previous}</span></span>
          <span slot="next">${NEXT}<span class="app-range-picker__hidden">${t.next}</span></span>
          <div class="app-range-picker__months">${month(0)}${month(1)}</div>
        </calendar-range>`;
      this.#page = focus.toPlainYearMonth();
      this.#renderTitles();

      const calendar = this.#calendar!;
      // cally disables days after max, but not the neighbouring ones: mark them all for CSS
      calendar.getDayParts = (date) => (Temporal.PlainDate.compare(plainDateOf(date), today) > 0 ? "future" : "");
      // cally's events do not bubble: listen on the calendar itself
      calendar.addEventListener("change", () => this.#choose(calendar.value, ""));
      calendar.addEventListener("focusday", (event) => {
        this.#followPage(plainDateOf((event as CustomEvent<Date>).detail));
      });
    }

    /** "August 2026" above each month (cally's own month heading has no year) */
    #renderTitles() {
      this.querySelectorAll(".app-range-picker__month-title").forEach((title, offset) => {
        title.textContent = formatMonth(this.#page.add({ months: offset }), this.#locale);
      });
    }

    /**
     * cally moved its focus (keys, previous/next): turn our page like cally turns its own
     * (pages of MONTHS; a focus just before or after moves a whole page)
     */
    #followPage(focus: PlainDate) {
      const offset = this.#page.until(focus.toPlainYearMonth(), { largestUnit: "months" }).months;
      if (offset >= 0 && offset < MONTHS) return;
      const turn = offset === -1 ? -MONTHS : offset === MONTHS ? MONTHS : Math.floor(offset / MONTHS) * MONTHS;
      this.#page = this.#page.add({ months: turn });
      this.#renderTitles();
    }

    // ---- state changes ----

    /** back to the defaults from the attributes */
    #reset() {
      const preset = this.#presets.find((p) => p.id === this.getAttribute("preset"));
      const value = this.getAttribute("value") ?? "";
      if (preset) this.#apply(toValue(preset.range), preset.id);
      else this.#apply(fromValue(value) === undefined ? "" : value, "");
    }

    /** the popover opens: start from the applied range (relative presets recomputed for today) */
    #open() {
      const preset = this.#presets.find((p) => p.id === this.#preset);
      this.#renderPresets();
      this.#choose(preset ? toValue(preset.range) : this.#value, this.#preset);
      this.#renderCalendar();
    }

    #choose(value: string, preset: string) {
      this.#draft = value;
      this.#draftPreset = preset;
      this.#renderPressed();
    }

    #apply(value: string, preset: string) {
      this.#value = value;
      this.#preset = preset;
      this.#internals.setFormValue(value);
      this.#renderLabel();
    }
  }
}

if (!customElements.get(Module.tagName)) customElements.define(Module.tagName, Module.RangePicker);

export type AppRangePicker = Module.RangePicker;

declare global {
  interface HTMLElementTagNameMap {
    [Module.tagName]: Module.RangePicker;
  }
}
