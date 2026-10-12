import {
  addMonths,
  addYears,
  endOfMonth,
  format,
  fromParts,
  overlaps,
  partsOf,
  type IsoDate,
} from "./date.js";
import { CalendarView, type ViewContext } from "./view.js";

/** the 12 months of one year */
export class MonthView extends CalendarView {
  readonly name = "month";
  readonly columns = 3;
  readonly previousLabel = "Previous year";
  readonly nextLabel = "Next year";

  heading(page: IsoDate) {
    return String(partsOf(page).year);
  }

  bounds(page: IsoDate) {
    const { year } = partsOf(page);
    return [fromParts(year, 0, 1), fromParts(year, 11, 31)] as const;
  }

  cells(page: IsoDate, { min, max, today, locale, selection }: ViewContext) {
    const { year } = partsOf(page);
    const thisMonth = this.unitOf(today);

    return Array.from({ length: 12 }, (_, month) => {
      const date = fromParts(year, month, 1);
      const last = endOfMonth(date);
      return {
        date,
        label: format(date, { month: "short" }, locale),
        ariaLabel: format(date, { month: "long", year: "numeric" }, locale),
        selected: selection.overlaps(date, last),
        current: date === thisMonth,
        disabled: !overlaps(date, last, min, max),
      };
    });
  }

  unitOf(date: IsoDate) {
    const { year, month } = partsOf(date);
    return fromParts(year, month, 1);
  }

  offset(cursor: IsoDate, months: number) {
    return addMonths(cursor, months);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addYears(cursor, pages * (large ? 10 : 1));
  }
}
