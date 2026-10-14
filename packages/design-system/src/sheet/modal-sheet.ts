/**
 * <ds-modal-sheet>: a modal dialog that always opens as a bottom sheet, on every screen
 * size. The panel is the author's <dialog>, so the platform does the modal part: open it
 * with command="show-modal" (or showModal()), the rest of the page is inert, focus stays
 * inside, Escape and <form method="dialog"> close it, `close` fires on the dialog.
 * A click on the backdrop closes it too (closedby="any" unless the dialog says otherwise),
 * and so does dragging it down.
 *
 *   <button commandfor="filters" command="show-modal">Filters</button>
 *   <ds-modal-sheet>
 *     <dialog id="filters" aria-labelledby="filters-title">
 *       <header><h2 id="filters-title">Filters</h2></header>
 *       …
 *       <form method="dialog"><button>Done</button></form>
 *     </dialog>
 *   </ds-modal-sheet>
 *
 * Inputs, dragging and the handle: see SheetBase.
 */

import { define, type Listen } from "../shared.js";
import { SheetBase } from "./sheet-base.js";

namespace Module {
  export const tagName = "ds-modal-sheet" as const;

  // browsers without closedby: a click on the backdrop lands on the dialog, outside its box
  const nativeLightDismiss = "closedBy" in HTMLDialogElement.prototype;

  export class ModalSheet extends SheetBase {
    get panel() {
      return this.querySelector<HTMLDialogElement>(":scope > dialog");
    }

    show() {
      const panel = this.panel;
      if (panel && !panel.open) panel.showModal();
    }

    protected hide(panel: HTMLDialogElement) {
      panel.close();
    }

    protected preparePanel(panel: HTMLElement) {
      if (!panel.hasAttribute("closedby")) panel.setAttribute("closedby", "any");
    }

    protected listen(on: Listen) {
      if (nativeLightDismiss) return;
      on("click", (event) => {
        const dialog = this.panel;
        if (!dialog || event.target !== dialog || dialog.getAttribute("closedby") !== "any") return;
        const box = dialog.getBoundingClientRect();
        const inside =
          event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
        if (!inside) dialog.close();
      });
    }
  }
}

define(Module.tagName, Module.ModalSheet);

globalThis.DsModalSheet = Module.ModalSheet;

/** instance type of <ds-modal-sheet>: `import type { DsModalSheet } from "@combo/design-system/bundle/index.js"` */
export type DsModalSheet = Module.ModalSheet;

declare global {
  export import DsModalSheet = Module.ModalSheet;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsModalSheet;
  }
}
