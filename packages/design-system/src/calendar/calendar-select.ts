import type { Messages } from "../messages.js";
import { CalendarPart, PartEvent, type CalendarContext } from "./context.js";
import type { IsoDate } from "./date.js";

export interface SelectOption {
  /** the date to go to (the cursor's day, in that month or year) */
  readonly date: IsoDate;
  readonly label: string;
  readonly selected: boolean;
  readonly disabled: boolean;
}

let nextId = 0;

/**
 * A labelled <select> that moves the calendar to a month or a year. Built once; updates
 * only replace the options, so a focused select keeps its focus.
 */
export abstract class CalendarSelect extends CalendarPart {
  #select?: HTMLSelectElement;
  #label?: HTMLLabelElement;

  protected abstract label(messages: Messages): string;
  protected abstract options(context: CalendarContext): SelectOption[];

  update(context: CalendarContext) {
    if (!this.#select || !this.#label || !this.contains(this.#select)) this.#build();
    this.#label!.textContent = this.label(context.messages);
    this.#select!.innerHTML = this.options(context)
      .map(
        ({ date, label, selected, disabled }) =>
          `<option value="${date}"${selected ? " selected" : ""}${disabled ? " disabled" : ""}>${label}</option>`,
      )
      .join("");
  }

  #build() {
    const id = `${this.localName}-${nextId++}`;
    this.innerHTML = `
      <label class="ds-calendar-select__label" for="${id}"></label>
      <select class="ds-calendar-select__select" id="${id}"></select>`;
    this.#label = this.querySelector("label")!;
    this.#select = this.querySelector("select")!;
    // the select's own input/change stay inside: a calendar's `change` means "a day was picked"
    this.#select.addEventListener("input", (event) => event.stopPropagation());
    this.#select.addEventListener("change", (event) => {
      event.stopPropagation();
      this.send(PartEvent.focus, { date: this.#select!.value, reveal: true });
    });
  }
}
