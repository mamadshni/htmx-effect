/**
 * <ds-bottom-sheet>: a non-modal sheet at the bottom of the screen; the page behind stays
 * usable (think of a map with a list over it). The panel is the author's [popover]:
 * popover="manual" stays open until closed, popover="auto" also closes on Escape and on a
 * click outside.
 *
 *   <button popovertarget="places">Places</button>
 *   <ds-bottom-sheet snap-points="25 50 90">
 *     <div id="places" popover="manual">
 *       <header><h2>Places</h2></header>
 *       …
 *     </div>
 *   </ds-bottom-sheet>
 *
 * Inputs, dragging and the handle: see SheetBase.
 */

import { define } from "../shared.js";
import { SheetBase } from "./sheet-base.js";

namespace Module {
  export const tagName = "ds-bottom-sheet" as const;

  export class BottomSheet extends SheetBase {
    get panel() {
      return this.querySelector<HTMLElement>(":scope > [popover]");
    }

    show() {
      const panel = this.panel;
      if (panel && !this.open) panel.showPopover();
    }

    protected hide(panel: HTMLElement) {
      panel.hidePopover();
    }
  }
}

define(Module.tagName, Module.BottomSheet);

globalThis.DsBottomSheet = Module.BottomSheet;

/** instance type of <ds-bottom-sheet>: `import type { DsBottomSheet } from "@combo/design-system/bundle/index.js"` */
export type DsBottomSheet = Module.BottomSheet;

declare global {
  export import DsBottomSheet = Module.BottomSheet;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsBottomSheet;
  }
}
