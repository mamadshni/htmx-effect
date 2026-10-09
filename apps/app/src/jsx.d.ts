import type { DsCombobox } from "@combo/design-system/bundle/index.js";

declare global {
  namespace JSX {
    // Invoker Commands API (not in lib.dom yet)
    interface GlobalAttributes {
      command: "show-modal" | "close" | "request-close" | `--${string}`;
      commandfor: string;
    }

    interface IntrinsicElements {
      // only HTML attributes: the class getters/methods (input, listbox, sync) are not attributes
      "ds-combobox": JSX.Attributes<HTMLElement> & { children?: JSX.Node };
    }
  }
}

// keep the import: it loads the design system's global types (DsCombobox, HTMLElementTagNameMap)
export type { DsCombobox };
