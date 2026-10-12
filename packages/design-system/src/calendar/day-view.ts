import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  formatRange,
  fromParts,
  partsOf,
  startOfMonth,
  weekdayOf,
  type IsoDate,
} from "./date.js";
import { CalendarView, type Cell, type ViewContext } from "./view.js";

const WEEKS = 6;
const MONTH_YEAR = { month: "long", year: "numeric" } as const;
const FULL_DATE = { weekday: "long", day: "numeric", month: "long", year: "numeric" } as const;

/**
 * Days as 6 full weeks per month, so the layout never jumps. With one month the
 * neighbouring days are shown dimmed; with several months side by side they are left
 * empty (they would repeat days of the next table).
 */
export class DayView extends CalendarView {
  readonly name = "day";
  readonly columns = 7;
  previousLabel({ messages }: ViewContext) {
    return messages.previousMonth;
  }

  nextLabel({ messages }: ViewContext) {
    return messages.nextMonth;
  }

  heading(page: IsoDate, { months, locale }: ViewContext) {
    const first = startOfMonth(page);
    return months > 1
      ? formatRange(first, addMonths(first, months - 1), MONTH_YEAR, locale)
      : format(first, MONTH_YEAR, locale);
  }

  bounds(page: IsoDate, { months }: ViewContext) {
    const first = startOfMonth(page);
    return [first, endOfMonth(addMonths(first, months - 1))] as const;
  }

  render(container: HTMLElement, page: IsoDate, cursor: IsoDate, context: ViewContext) {
    const first = startOfMonth(page);
    container.innerHTML = Array.from({ length: context.months }, (_, i) => {
      const month = addMonths(first, i);
      const id = `${context.id}-${month.slice(0, 7)}`;
      return `<div class="ds-calendar__month">
        <h3 id="${id}" class="ds-calendar__month-title">${format(month, MONTH_YEAR, context.locale)}</h3>
        ${this.table(this.cells(month, context), cursor, context, id)}
      </div>`;
    }).join("");
  }

  protected columnHeaders({ firstDayOfWeek, locale }: ViewContext) {
    return Array.from({ length: 7 }, (_, i) => {
      // 2023-01-01 was a Sunday
      const day = fromParts(2023, 0, 1 + ((firstDayOfWeek + i) % 7));
      const long = format(day, { weekday: "long" }, locale);
      const short = format(day, { weekday: "short" }, locale);
      return `<th scope="col" abbr="${long}">${short}</th>`;
    }).join("");
  }

  protected selectedAttribute(selected: boolean) {
    return `aria-pressed="${selected}"`;
  }

  cells(page: IsoDate, context: ViewContext): (Cell | null)[] {
    const { min, max, today, locale, firstDayOfWeek, selection } = context;
    const first = startOfMonth(page);
    const { month } = partsOf(first);
    const leading = (weekdayOf(first) - firstDayOfWeek + 7) % 7;
    const showOutside = context.months === 1;

    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const date = addDays(first, i - leading);
      const outside = partsOf(date).month !== month;
      if (outside && !showOutside) return null;
      return {
        date,
        label: String(partsOf(date).day),
        ariaLabel: format(date, FULL_DATE, locale),
        selected: selection.includes(date),
        current: date === today,
        disabled: Boolean((min && date < min) || (max && date > max)),
        disallowed: context.isDisallowed(date),
        outside,
        rangeStart: selection.isStart(date),
        rangeEnd: selection.isEnd(date),
      };
    });
  }

  unitOf(date: IsoDate) {
    return date;
  }

  offset(cursor: IsoDate, days: number) {
    return addDays(cursor, days);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addMonths(cursor, pages * (large ? 12 : 1));
  }

  protected columnOf(cursor: IsoDate, { firstDayOfWeek }: ViewContext) {
    return (weekdayOf(cursor) - firstDayOfWeek + 7) % 7;
  }
}
