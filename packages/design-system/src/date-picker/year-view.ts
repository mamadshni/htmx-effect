import { addYears, fromParts, overlaps, partsOf, todayIso, type IsoDate } from "./date.js";
import { DatePickerView, type ViewContext } from "./view.js";

const YEARS_PER_PAGE = 12;

/** a page of 12 years, aligned to multiples of 12 (e.g. 2016–2027) */
export class YearView extends DatePickerView {
  readonly name = "year";
  readonly columns = 4;
  readonly previousLabel = `Previous ${YEARS_PER_PAGE} years`;
  readonly nextLabel = `Next ${YEARS_PER_PAGE} years`;

  heading(cursor: IsoDate) {
    const first = this.#firstYear(cursor);
    return `${first} – ${first + YEARS_PER_PAGE - 1}`;
  }

  cells(cursor: IsoDate, { start, end, min, max }: ViewContext) {
    const first = this.#firstYear(cursor);
    const thisYear = this.unitOf(todayIso());

    return Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
      const year = first + i;
      const date = fromParts(year, 0, 1);
      const last = fromParts(year, 11, 31);
      return {
        date,
        label: String(year),
        selected: Boolean(start && overlaps(date, last, start, end)),
        current: date === thisYear,
        disabled: !overlaps(date, last, min, max),
      };
    });
  }

  unitOf(cursor: IsoDate) {
    return fromParts(partsOf(cursor).year, 0, 1);
  }

  offset(cursor: IsoDate, years: number) {
    return addYears(cursor, years);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addYears(cursor, pages * YEARS_PER_PAGE * (large ? 10 : 1));
  }

  #firstYear(cursor: IsoDate) {
    const { year } = partsOf(cursor);
    return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  }
}
