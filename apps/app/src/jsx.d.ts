import type { CalendarBase, DsBottomSheet, DsCombobox, DsComboboxLocal, DsDatePicker, DsModalSheet } from "@combo/design-system/bundle/index.js";

/** attributes of the calendar containers, also passed on by <ds-date-picker> */
type CalendarAttributes = {
  min?: string;
  max?: string;
  /** months turned per page (and created when there is no <ds-calendar-month> inside) */
  months?: number;
  /** "" = the nearest lang, else the browser's */
  locale?: string;
  /** 0 = Sunday … 6 = Saturday; defaults to the locale's */
  "first-day-of-week"?: number;
  /** override today's date (YYYY-MM-DD) */
  today?: string;
  /** unavailable dates, separated by spaces */
  disallowed?: string;
  /** unavailable weekdays (0 = Sunday … 6 = Saturday), separated by spaces */
  "disallowed-weekdays"?: string;
};

/** HTML attributes and children (named so it does not clash with JSX.Element) */
type HtmlProps = JSX.Attributes<HTMLElement> & { children?: JSX.Node };

/** sizes in % of the viewport height ("" = fit the content), the current one, the text language */
type SheetAttributes = HtmlProps & { "snap-points"?: string; snap?: number; locale?: string };

type CalendarContainer = HtmlProps &
  CalendarAttributes & {
    /** "YYYY-MM-DD", "start/end" (range) or dates separated by spaces (multi) */
    value?: string;
    /** fill the empty cells with the neighbouring months' days */
    "show-outside-days"?: boolean;
  };

declare global {
  namespace JSX {
    // Invoker Commands API (not in lib.dom yet)
    interface GlobalAttributes {
      command: "show-modal" | "close" | "request-close" | `--${string}`;
      commandfor: string;
    }

    // design-system elements: only their HTML attributes (class getters/methods are not attributes)
    interface IntrinsicElements {
      /** options from the server (htmx swaps the listbox) */
      "ds-combobox": HtmlProps;
      /** filters its own options in the browser; `filter` = where the query must match */
      "ds-combobox-local": HtmlProps & { filter?: "contains" | "starts-with"; locale?: string };
      /** non-modal sheet around a [popover] */
      "ds-bottom-sheet": SheetAttributes;
      /** modal sheet around a <dialog> */
      "ds-modal-sheet": SheetAttributes;
      "ds-calendar": CalendarContainer;
      "ds-calendar-range": CalendarContainer;
      "ds-calendar-multi": CalendarContainer;
      /** one month; `offset` = months after the container's first month */
      "ds-calendar-month": HtmlProps & { offset?: number };
      "ds-calendar-select-month": HtmlProps;
      /** `max-years` = how many years to list (default 20) */
      "ds-calendar-select-year": HtmlProps & { "max-years"?: number };
      "ds-date-picker": HtmlProps &
        CalendarAttributes & {
          name?: string;
          /** default value: ISO date (YYYY-MM-DD), or start/end with `range` */
          value?: string;
          required?: boolean;
          disabled?: boolean;
          /** pick a start and end date; value becomes an ISO 8601 interval (start/end) */
          range?: boolean;
        };
    }
  }
}

// keep the import: it loads the design system's global types (HTMLElementTagNameMap etc.)
export type { CalendarBase, DsBottomSheet, DsCombobox, DsComboboxLocal, DsDatePicker, DsModalSheet };
