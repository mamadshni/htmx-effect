import type { DsCombobox, DsDatePicker } from "@combo/design-system/bundle/index.js";

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
      "ds-date-picker": JSX.Attributes<HTMLElement> & {
        name?: string;
        /** default value: ISO date (YYYY-MM-DD), or start/end with `range` */
        value?: string;
        min?: string;
        max?: string;
        required?: boolean;
        disabled?: boolean;
        /** pick a start and end date; value becomes an ISO 8601 interval (start/end) */
        range?: boolean;
      };
    }
  }
}

// keep the import: it loads the design system's global types (HTMLElementTagNameMap etc.)
export type { DsCombobox, DsDatePicker };
