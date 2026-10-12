import {
  addMonths,
  addYears,
  daysInMonth,
  format,
  fromParts,
  overlaps,
  partsOf,
  todayIso,
  type IsoDate,
} from "./date.js";
import { DatePickerView, type ViewContext } from "./view.js";

const monthShort = format({ month: "short" });
const monthYear = format({ month: "long", year: "numeric" });

/** the 12 months of one year */
export class MonthView extends DatePickerView {
  readonly name = "month";
  readonly columns = 3;
  readonly previousLabel = "Previous year";
  readonly nextLabel = "Next year";

  heading(cursor: IsoDate) {
    return String(partsOf(cursor).year);
  }

  cells(cursor: IsoDate, { start, end, min, max }: ViewContext) {
    const { year } = partsOf(cursor);
    const thisMonth = this.unitOf(todayIso());

    return Array.from({ length: 12 }, (_, month) => {
      const date = fromParts(year, month, 1);
      const last = fromParts(year, month, daysInMonth(year, month));
      return {
        date,
        label: monthShort(date),
        ariaLabel: monthYear(date),
        selected: Boolean(start && overlaps(date, last, start, end)),
        current: date === thisMonth,
        disabled: !overlaps(date, last, min, max),
      };
    });
  }

  unitOf(cursor: IsoDate) {
    const { year, month } = partsOf(cursor);
    return fromParts(year, month, 1);
  }

  offset(cursor: IsoDate, months: number) {
    return addMonths(cursor, months);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addYears(cursor, pages * (large ? 10 : 1));
  }
}
