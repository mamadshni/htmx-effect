/**
 * <ds-combobox>: a combobox whose options come from the server. It never filters; whoever
 * owns the content (htmx, a fetch, …) answers each `input` event on the input by replacing
 * the listbox or its options. The server may pre-select the best match with
 * aria-selected="true" and render an empty state as an option with aria-disabled="true".
 *
 *   <ds-combobox>
 *     <input type="search" role="combobox" aria-controls="list-id" aria-expanded="false"
 *            hx-get="/options" hx-trigger="input changed delay:150ms" hx-target="#list-id" hx-swap="outerHTML" />
 *     <ul id="list-id" role="listbox" popover="manual">
 *       <li id="option-id" role="option">…</li>
 *     </ul>
 *   </ds-combobox>
 *
 * No inputs. Shared behaviour (keys, popover, `change` on the input): combobox-base.ts.
 * For a short, fixed list filtered in the browser use <ds-combobox-local>.
 */

import { define } from "../shared.js";
import { ComboboxBase } from "./combobox-base.js";

namespace Module {
  export const tagName = "ds-combobox" as const;

  export class Combobox extends ComboboxBase {
    /** the server answers with new options; the highlight is whatever it pre-selects */
    protected search() {
      return undefined;
    }
  }
}

define(Module.tagName, Module.Combobox);

globalThis.DsCombobox = Module.Combobox;

/** instance type of <ds-combobox>: `import type { DsCombobox } from "@combo/design-system/bundle/index.js"` */
export type DsCombobox = Module.Combobox;

declare global {
  export import DsCombobox = Module.Combobox;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCombobox;
  }
}
