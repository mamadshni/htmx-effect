import type { DsCalendar, DsCombobox, DsDatePicker } from "@combo/design-system/bundle/index.js";

/** attributes shared by <ds-calendar> and <ds-date-picker> (passed on to its calendar) */
type CalendarAttributes = {
  min?: string;
  max?: string;
  /** months shown side by side */
  months?: number;
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

declare global {
  namespace JSX {
    // Invoker Commands API (not in lib.dom yet)
    interface GlobalAttributes {
      command: "show-modal" | "close" | "request-close" | `--${string}`;
      commandfor: string;
    }

    // design-system elements: only their HTML attributes (class getters/methods are not attributes)
    interface IntrinsicElements {
      "ds-combobox": JSX.Attributes<HTMLElement> & { children?: JSX.Node };
      "ds-calendar": JSX.Attributes<HTMLElement> &
        CalendarAttributes & {
          /** "YYYY-MM-DD", "start/end" (range) or dates separated by spaces (multiple) */
          value?: string;
          selection?: "single" | "range" | "multiple";
        };
      "ds-date-picker": JSX.Attributes<HTMLElement> &
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
export type { DsCalendar, DsCombobox, DsDatePicker };
