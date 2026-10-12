import { addYears, fromParts, overlaps, partsOf, type IsoDate } from "./date.js";
import { CalendarView, type ViewContext } from "./view.js";

const YEARS_PER_PAGE = 12;

/** a page of 12 years, aligned to multiples of 12 (e.g. 2016–2027) */
export class YearView extends CalendarView {
  readonly name = "year";
  readonly columns = 4;

  previousLabel({ messages }: ViewContext) {
    return messages.previousYears(YEARS_PER_PAGE);
  }

  nextLabel({ messages }: ViewContext) {
    return messages.nextYears(YEARS_PER_PAGE);
  }

  heading(page: IsoDate) {
    const first = this.#firstYear(page);
    return `${first} – ${first + YEARS_PER_PAGE - 1}`;
  }

  bounds(page: IsoDate) {
    const first = this.#firstYear(page);
    return [fromParts(first, 0, 1), fromParts(first + YEARS_PER_PAGE - 1, 11, 31)] as const;
  }

  cells(page: IsoDate, { min, max, today, selection }: ViewContext) {
    const first = this.#firstYear(page);
    const thisYear = this.unitOf(today);

    return Array.from({ length: YEARS_PER_PAGE }, (_, i) => {
      const year = first + i;
      const date = fromParts(year, 0, 1);
      const last = fromParts(year, 11, 31);
      return {
        date,
        label: String(year),
        selected: selection.overlaps(date, last),
        current: date === thisYear,
        disabled: !overlaps(date, last, min, max),
      };
    });
  }

  unitOf(date: IsoDate) {
    return fromParts(partsOf(date).year, 0, 1);
  }

  offset(cursor: IsoDate, years: number) {
    return addYears(cursor, years);
  }

  page(cursor: IsoDate, pages: number, large: boolean) {
    return addYears(cursor, pages * YEARS_PER_PAGE * (large ? 10 : 1));
  }

  #firstYear(page: IsoDate) {
    const { year } = partsOf(page);
    return Math.floor(year / YEARS_PER_PAGE) * YEARS_PER_PAGE;
  }
}
