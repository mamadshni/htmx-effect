import {
  addDays,
  addMonths,
  firstDayOfWeek,
  format,
  fromParts,
  partsOf,
  todayIso,
  type IsoDate,
} from "./date.js";
import { DatePickerView, type Cell, type ViewContext } from "./view.js";

const monthYear = format({ month: "long", year: "numeric" });
const fullDate = format({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const weekdayShort = format({ weekday: "short" });
const weekdayLong = format({ weekday: "long" });

const WEEKS = 6;

/** days of one month as 6 full weeks (neighbouring days included, so the layout never jumps) */
export class DayView extends DatePickerView {
  readonly name = "day";
  readonly columns = 7;
  readonly previousLabel = "Previous month";
  readonly nextLabel = "Next month";

  heading(cursor: IsoDate) {
    return monthYear(cursor);
  }

  columnHeaders() {
    return Array.from({ length: 7 }, (_, i) => {
      // 2023-01-01 was a Sunday
      const day = fromParts(2023, 0, 1 + ((firstDayOfWeek + i) % 7));
      return `<th scope="col" abbr="${weekdayLong(day)}">${weekdayShort(day)}</th>`;
    }).join("");
  }

  cells(cursor: IsoDate, { start, end, min, max }: ViewContext): Cell[] {
    const { year, month } = partsOf(cursor);
    const first = fromParts(year, month, 1);
    const leading = (new Date(Date.UTC(year, month, 1)).getUTCDay() - firstDayOfWeek + 7) % 7;
    const today = todayIso();

    return Array.from({ length: WEEKS * 7 }, (_, i) => {
      const date = addDays(first, i - leading);
      return {
        date,
        label: String(partsOf(date).day),
        ariaLabel: fullDate(date),
        selected: Boolean(start && date >= start && date <= end),
        rangeStart: date === start,
        rangeEnd: date === end,
        current: date === today,
        disabled: Boolean((min && date < min) || (max && date > max)),
        outside: partsOf(date).month !== month,
      };
    });
  }

  unitOf(cursor: IsoDate) {
    return cursor;
  }

  offset(cursor: IsoDate, days: number) {
    return addDays(cursor, days);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addMonths(cursor, pages * (large ? 12 : 1));
  }
}
