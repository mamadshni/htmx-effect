/**
 * The bottom sheet shared by <ds-bottom-sheet> (non-modal: a popover) and <ds-modal-sheet>
 * (modal: a <dialog>). Subclasses only choose the panel and how it opens and closes.
 *
 * Light DOM: the author writes the panel (so the platform opens it, with commandfor /
 * popovertarget, Escape, backdrop and focus handling), the sheet adds a drag handle as its
 * first child and makes it draggable:
 * - drag the handle (or the panel's <header>) up and down; on release it snaps to the
 *   nearest size, or the next one in the direction of a flick;
 * - dragged (or flicked) below the smallest size, it closes;
 * - the handle is a button: click steps to the next size, ArrowUp / ArrowDown step up / down.
 *
 * Inputs (property ↔ attribute, checked on the way in):
 *   snapPoints ↔ snap-points   sizes in % of the viewport height, e.g. "25 50 90"; "" = fit the content
 *   snap ↔ snap                index of the current size (0 = the smallest); reflected while dragging
 *   locale ↔ locale            "" = the nearest lang, else the browser's (text: en/de)
 * Methods: show(), close(); `open` (read only).
 * Event: snapchange ({ snap }) when the user moved the sheet to another size.
 */

import { messagesFor } from "../messages.js";
import {
  accept,
  assertIsInteger,
  assertIsPercentList,
  assertIsString,
  listenOn,
  parsePercents,
  type Listen,
  reflect,
  resolveLocale,
} from "../shared.js";

/** px per ms: a release faster than this is a flick */
const FLICK = 0.5;
/** a release slower than this long after the last move has no speed */
const STILL_MS = 100;
/** a pointer that moved less than this is a click, not a drag */
const CLICK_SLOP = 4;
/** below this share of the smallest size, a release closes the sheet */
const CLOSE_BELOW = 0.5;

export abstract class SheetBase extends HTMLElement {
  static observedAttributes = ["snap-points", "snap", "locale"] as const;

  attributeChangedCallback(
    name: (typeof SheetBase.observedAttributes)[number],
    oldValue: string | null,
    newValue: string | null,
  ) {
    if (newValue === oldValue) return;
    switch (name) {
      case "snap-points":
        this.snapPoints = newValue ?? "";
        break;
      case "snap":
        this.snap = newValue === null ? 0 : Number(newValue);
        break;
      case "locale":
        this.locale = newValue ?? "";
        break;
    }
  }

  /** the panel the author wrote: a [popover] or a <dialog> */
  abstract get panel(): HTMLElement | null;
  /** open the panel */
  abstract show(): void;
  protected abstract hide(panel: HTMLElement): void;
  /** the panel is there (parsed, or swapped in): set it up; runs again after swaps */
  protected preparePanel(_panel: HTMLElement) {}
  /** add a subclass's listeners (removed on disconnect) */
  protected listen(_on: Listen) {}

  // ---- inputs ----

  #snapPoints: number[] = [];

  /** sizes in % of the viewport height, ascending; "" = one size that fits the content */
  get snapPoints() {
    return this.#snapPoints.join(" ");
  }
  set snapPoints(value: string) {
    if (accept(() => assertIsPercentList(value, `${this.localName}.snapPoints`))) {
      this.#snapPoints = parsePercents(value)!;
    }
    reflect(this, "snap-points", this.snapPoints);
    this.#resize();
  }

  #snap = 0;

  /** index of the current size, 0 = the smallest */
  get snap() {
    return Math.min(this.#snap, this.#steps - 1);
  }
  set snap(value: number) {
    if (accept(() => assertIsInteger(value, `${this.localName}.snap`, 0, 99))) this.#snap = value;
    reflect(this, "snap", this.snap || null);
    this.#resize();
  }

  #locale = "";

  /** "" = the nearest lang, else the browser's */
  get locale() {
    return this.#locale;
  }
  set locale(value: string) {
    if (accept(() => assertIsString(value, `${this.localName}.locale`))) this.#locale = value;
    reflect(this, "locale", this.#locale);
    this.#renderHandle();
  }

  get open() {
    return this.panel?.matches("[open], :popover-open") ?? false;
  }

  close() {
    const panel = this.panel;
    if (panel && this.open) this.hide(panel);
  }

  // ---- lifecycle ----

  #listeners?: AbortController;
  // the panel's content may be replaced (e.g. by a server swap): put the handle back
  #swaps = new MutationObserver(() => this.#addHandle());

  connectedCallback() {
    this.#listeners = new AbortController();
    const on = listenOn(this, this.#listeners.signal);

    // the size to open at, set while the panel is still hidden (so it does not animate)
    this.addEventListener(
      "beforetoggle",
      (event) => {
        if (event.target === this.panel && (event as ToggleEvent).newState === "open") this.#resize();
      },
      { capture: true, signal: this.#listeners.signal },
    );
    on("pointerdown", (event) => this.#dragStart(event));
    on("click", (event) => {
      if (!(event.target as Element).closest(".ds-sheet__handle")) return;
      // the click that ends a drag is not a step
      if (!this.#dragged) this.#step(this.snap + 1 < this.#steps ? this.snap + 1 : 0);
    });
    on("keydown", (event) => {
      if (!(event.target as Element).closest(".ds-sheet__handle")) return;
      const step = event.key === "ArrowUp" ? 1 : event.key === "ArrowDown" ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      this.#step(Math.max(0, Math.min(this.#steps - 1, this.snap + step)));
    });
    this.listen(on);

    // children may not be parsed yet
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#addHandle(), { once: true });
    } else {
      this.#addHandle();
    }
    this.#swaps.observe(this, { childList: true, subtree: true });
  }

  disconnectedCallback() {
    this.#listeners?.abort();
    this.#drag?.abort();
    this.#swaps.disconnect();
  }

  // ---- handle and size ----

  get #steps() {
    return Math.max(1, this.#snapPoints.length);
  }

  #addHandle() {
    const panel = this.panel;
    if (!panel) return;
    this.preparePanel(panel);
    if (panel.querySelector(":scope > .ds-sheet__handle")) return;
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "ds-sheet__handle";
    panel.prepend(handle);
    this.#renderHandle();
    this.#resize();
  }

  #renderHandle() {
    const handle = this.panel?.querySelector<HTMLButtonElement>(":scope > .ds-sheet__handle");
    if (!handle) return;
    const messages = messagesFor(resolveLocale(this.#locale, this));
    handle.setAttribute("aria-label", messages.sheetHandle(this.snap + 1, this.#steps));
    // one size: nothing to step through, the handle is only for dragging
    const single = this.#steps === 1;
    handle.tabIndex = single ? -1 : 0;
    handle.toggleAttribute("aria-hidden", single);
  }

  /** the panel takes the current size (fit the content: no height of its own) */
  #resize() {
    const panel = this.panel;
    if (!panel) return;
    const percent = this.#snapPoints[this.snap];
    panel.style.blockSize = percent === undefined ? "" : `${percent}dvh`;
    this.#renderHandle();
  }

  /** the user moved to another size */
  #step(snap: number) {
    const changed = snap !== this.snap;
    this.snap = snap;
    if (changed) this.dispatchEvent(new CustomEvent("snapchange", { bubbles: true, detail: { snap } }));
  }

  // ---- dragging ----

  #drag?: AbortController;
  /** the last pointer down became a drag (its click is not a step) */
  #dragged = false;

  #dragStart(event: PointerEvent) {
    const panel = this.panel;
    const target = event.target as Element;
    // the handle, or the panel's own <header> (not one further down in the content)
    const grip = target.closest(".ds-sheet__handle, header");
    if (!panel || grip?.parentElement !== panel || event.button !== 0) return;
    // controls in the header keep working
    if (!grip.matches(".ds-sheet__handle") && target.closest("a, button, input, select, textarea, label, [contenteditable]")) return;

    const startY = event.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    // fit the content: the one size is the content's height, measured before it changes
    const heights = this.#snapPoints.length
      ? this.#snapPoints.map((percent) => (percent / 100) * innerHeight)
      : [startHeight];
    let height = startHeight;
    let last = { y: startY, time: event.timeStamp };
    let speed = 0; // px per ms, positive downwards
    this.#dragged = false;

    this.#drag?.abort();
    this.#drag = new AbortController();
    const { signal } = this.#drag;

    addEventListener(
      "pointermove",
      (move) => {
        if (move.pointerId !== event.pointerId) return;
        if (!this.#dragged && Math.abs(move.clientY - startY) < CLICK_SLOP) return;
        this.#dragged = true;
        panel.setAttribute("data-dragging", "");
        height = Math.max(0, Math.min(innerHeight, startHeight + startY - move.clientY));
        panel.style.blockSize = `${height}px`;
        const elapsed = move.timeStamp - last.time;
        if (elapsed > 0) speed = (move.clientY - last.y) / elapsed;
        last = { y: move.clientY, time: move.timeStamp };
      },
      { signal },
    );

    const end = (up: PointerEvent) => {
      if (up.pointerId !== event.pointerId) return;
      this.#drag?.abort();
      if (!this.#dragged) return;
      // only the click that this release fires (if any) is skipped, not a later one
      setTimeout(() => (this.#dragged = false));
      panel.removeAttribute("data-dragging");
      if (up.timeStamp - last.time > STILL_MS) speed = 0;
      const target = this.#releaseTarget(heights, height, speed);
      if (target < 0) {
        this.hide(panel);
      } else {
        this.#step(target);
        this.#resize(); // also when the size stayed: back from the dragged height
      }
    };
    addEventListener("pointerup", end, { signal });
    addEventListener("pointercancel", end, { signal });
  }

  /** the size a release lands on; -1 closes */
  #releaseTarget(heights: number[], height: number, speed: number) {
    // heights ascend: the last one below is one less than the count below (-1: none, close)
    if (speed > FLICK) return heights.filter((h) => h < height - 1).length - 1;
    if (speed < -FLICK) {
      const higher = heights.findIndex((h) => h > height + 1);
      return higher < 0 ? heights.length - 1 : higher;
    }
    if (height < heights[0]! * CLOSE_BELOW) return -1;
    let nearest = 0;
    heights.forEach((h, i) => {
      if (Math.abs(h - height) < Math.abs(heights[nearest]! - height)) nearest = i;
    });
    return nearest;
  }
}
