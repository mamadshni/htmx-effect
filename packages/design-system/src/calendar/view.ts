import type { IsoDate } from "./date.js";
import type { SelectionState } from "./selection.js";

export type ViewName = "day" | "month" | "year";

/** what a view needs to know about the calendar */
export interface ViewContext {
  /** the calendar's id, to derive ids for labels */
  readonly id: string;
  readonly min: IsoDate | null;
  readonly max: IsoDate | null;
  readonly today: IsoDate;
  readonly locale: string | undefined;
  /** 0 = Sunday … 6 = Saturday */
  readonly firstDayOfWeek: number;
  /** months shown side by side (day view) */
  readonly months: number;
  readonly selection: SelectionState;
  isDisallowed(date: IsoDate): boolean;
}

export interface Cell {
  /** first day of the unit the cell stands for (the day, the month or the year) */
  readonly date: IsoDate;
  readonly label: string;
  readonly ariaLabel?: string | undefined;
  readonly selected: boolean;
  readonly current: boolean;
  /** outside min/max: cannot be focused or picked */
  readonly disabled: boolean;
  /** unavailable: can be focused, not picked */
  readonly disallowed?: boolean | undefined;
  /** belongs to a neighbouring month, shown dimmed */
  readonly outside?: boolean | undefined;
  readonly rangeStart?: boolean | undefined;
  readonly rangeEnd?: boolean | undefined;
}

/**
 * One page of the calendar (the days of one or more months, the months of a year, a range
 * of years) as tables of buttons. Subclasses describe their unit; this class renders the
 * tables and maps keys to cursor moves.
 *
 * `page` is any date inside what is shown; `cursor` is the focused date. Both are full
 * ISO dates shared by all views, so switching views keeps the context.
 */
export abstract class CalendarView {
  abstract readonly name: ViewName;
  abstract readonly columns: number;
  abstract readonly previousLabel: string;
  abstract readonly nextLabel: string;

  abstract heading(page: IsoDate, context: ViewContext): string;

  /** cells of the page; null is an empty cell */
  abstract cells(page: IsoDate, context: ViewContext): ReadonlyArray<Cell | null>;

  /** first and last day the page covers (to know when prev/next would leave min/max) */
  abstract bounds(page: IsoDate, context: ViewContext): readonly [IsoDate, IsoDate];

  /** the cell date a date falls into (normalised to the view's unit) */
  abstract unitOf(date: IsoDate): IsoDate;

  /** move the cursor by n units (days, months or years) */
  abstract offset(cursor: IsoDate, units: number): IsoDate;

  /** move the cursor by n pages; `large` is the Shift+PageUp/PageDown jump */
  abstract page(cursor: IsoDate, pages: number, large: boolean): IsoDate;

  render(container: HTMLElement, page: IsoDate, cursor: IsoDate, context: ViewContext) {
    container.innerHTML = this.table(this.cells(page, context), cursor, context, `${context.id}-heading`);
  }

  /** column headers (e.g. weekday names) */
  protected columnHeaders(_context: ViewContext): string {
    return "";
  }

  /** how a selected cell is marked: days are toggle buttons, months and years are not */
  protected selectedAttribute(selected: boolean): string {
    return selected ? "data-selected" : "";
  }

  protected table(
    cells: ReadonlyArray<Cell | null>,
    cursor: IsoDate,
    context: ViewContext,
    labelledBy: string,
  ) {
    const focused = this.unitOf(cursor);
    const buttons = cells.map((cell) => {
      if (!cell) return "<td></td>";
      const attributes = [
        `type="button"`,
        `data-date="${cell.date}"`,
        `tabindex="${cell.date === focused ? 0 : -1}"`,
        cell.ariaLabel ? `aria-label="${cell.ariaLabel}"` : "",
        this.selectedAttribute(cell.selected),
        cell.current ? `aria-current="date"` : "",
        cell.disabled ? "disabled" : "",
        cell.disallowed ? `aria-disabled="true"` : "",
        cell.outside ? "data-outside" : "",
        cell.rangeStart ? "data-range-start" : "",
        cell.rangeEnd ? "data-range-end" : "",
      ];
      return `<td><button ${attributes.filter(Boolean).join(" ")}>${cell.label}</button></td>`;
    });

    const rows: string[] = [];
    for (let i = 0; i < buttons.length; i += this.columns) {
      rows.push(`<tr>${buttons.slice(i, i + this.columns).join("")}</tr>`);
    }

    const headers = this.columnHeaders(context);
    return `<table class="ds-calendar__table" data-view="${this.name}" aria-labelledby="${labelledBy}">${
      headers ? `<thead><tr>${headers}</tr></thead>` : ""
    }<tbody>${rows.join("")}</tbody></table>`;
  }

  /** the new cursor for a key, or undefined when the key is not a move */
  cursorForKey(event: KeyboardEvent, cursor: IsoDate, context: ViewContext): IsoDate | undefined {
    // right-to-left: the arrow keys follow the visual direction
    const forward = (event.target as Element).matches(":dir(rtl)") ? -1 : 1;
    const column = this.columnOf(cursor, context);
    switch (event.key) {
      case "ArrowLeft":
        return this.offset(cursor, -forward);
      case "ArrowRight":
        return this.offset(cursor, forward);
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

  /** the column of the cursor's cell */
  protected columnOf(cursor: IsoDate, context: ViewContext) {
    const unit = this.unitOf(cursor);
    const index = this.cells(cursor, context).findIndex((cell) => cell?.date === unit);
    return Math.max(index, 0) % this.columns;
  }
}
