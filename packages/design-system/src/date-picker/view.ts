import type { IsoDate } from "./date.js";

export type ViewName = "day" | "month" | "year";

/** what a view needs to know about the picker */
export interface ViewContext {
  /** the selection; a single date has start === end, no selection is "" */
  readonly start: IsoDate | "";
  readonly end: IsoDate | "";
  readonly min: IsoDate | null;
  readonly max: IsoDate | null;
}

export interface Cell {
  /** first day of the unit the cell stands for (the day, the month or the year) */
  readonly date: IsoDate;
  readonly label: string;
  readonly ariaLabel?: string | undefined;
  readonly selected: boolean;
  readonly current: boolean;
  readonly disabled: boolean;
  /** belongs to a neighbouring page (e.g. a day of the previous month), shown dimmed */
  readonly outside?: boolean | undefined;
  /** first / last day of the selection (styled in range mode) */
  readonly rangeStart?: boolean | undefined;
  readonly rangeEnd?: boolean | undefined;
}

/**
 * One page of the calendar (days of a month, months of a year, a range of years) as a
 * keyboard-navigable grid. Subclasses describe their unit; this class renders the grid
 * and maps keys to cursor moves.
 *
 * The cursor is a full ISO date shared by all views, so switching views keeps the context.
 */
export abstract class DatePickerView {
  abstract readonly name: ViewName;
  abstract readonly columns: number;
  abstract readonly previousLabel: string;
  abstract readonly nextLabel: string;

  /** heading for the page that contains the cursor */
  abstract heading(cursor: IsoDate): string;

  /** cells of the page that contains the cursor; null is an empty filler cell */
  abstract cells(cursor: IsoDate, context: ViewContext): ReadonlyArray<Cell | null>;

  /** the cell date the cursor falls into (normalised to the view's unit) */
  abstract unitOf(cursor: IsoDate): IsoDate;

  /** move the cursor by n units (days, months or years) */
  abstract offset(cursor: IsoDate, units: number): IsoDate;

  /** move the cursor by n pages; `large` is the Shift+PageUp/PageDown jump */
  abstract page(cursor: IsoDate, pages: number, large: boolean): IsoDate;

  /** optional column headers (e.g. weekday names) */
  columnHeaders(): string {
    return "";
  }

  render(table: HTMLTableElement, cursor: IsoDate, context: ViewContext) {
    const focused = this.unitOf(cursor);
    const cells = this.cells(cursor, context).map((cell) => {
      if (!cell) return "<td></td>";
      const attributes = [
        `data-date="${cell.date}"`,
        `tabindex="${cell.date === focused ? 0 : -1}"`,
        cell.ariaLabel ? `aria-label="${cell.ariaLabel}"` : "",
        cell.selected ? `aria-selected="true"` : "",
        cell.current ? `aria-current="date"` : "",
        cell.disabled ? `aria-disabled="true"` : "",
        cell.outside ? "data-outside" : "",
        cell.rangeStart ? "data-range-start" : "",
        cell.rangeEnd ? "data-range-end" : "",
      ];
      return `<td ${attributes.filter(Boolean).join(" ")}>${cell.label}</td>`;
    });

    const rows: string[] = [];
    for (let i = 0; i < cells.length; i += this.columns) {
      rows.push(`<tr>${cells.slice(i, i + this.columns).join("")}</tr>`);
    }

    const headers = this.columnHeaders();
    table.dataset.view = this.name;
    table.innerHTML = `${headers ? `<thead><tr>${headers}</tr></thead>` : ""}<tbody>${rows.join("")}</tbody>`;
  }

  /** the new cursor for a grid key, or undefined when the key is not a move */
  cursorForKey(event: KeyboardEvent, cursor: IsoDate, context: ViewContext): IsoDate | undefined {
    const column = this.#columnOf(cursor, context);
    switch (event.key) {
      case "ArrowLeft":
        return this.offset(cursor, -1);
      case "ArrowRight":
        return this.offset(cursor, 1);
      case "ArrowUp":
        return this.offset(cursor, -this.columns);
      case "ArrowDown":
        return this.offset(cursor, this.columns);
      case "Home":
        return this.offset(cursor, -column);
      case "End":
        return this.offset(cursor, this.columns - 1 - column);
      case "PageUp":
        return this.page(cursor, -1, event.shiftKey);
      case "PageDown":
        return this.page(cursor, 1, event.shiftKey);
      default:
        return undefined;
    }
  }

  #columnOf(cursor: IsoDate, context: ViewContext) {
    const unit = this.unitOf(cursor);
    const index = this.cells(cursor, context).findIndex((cell) => cell?.date === unit);
    return Math.max(index, 0) % this.columns;
  }
}
