/**
 * Dragging blocks in the grid builder, with the pointer (mouse, pen, touch) or the keyboard.
 * While a block moves, an outline shows where it would land and the blocks in its way snap to
 * where they would be pushed, using the server's own rules (../grid.ts). A drop is posted with htmx
 * (/grid/move, /grid/remove); the server checks it again and answers with the new
 * workspace. Listeners are on the document, so they keep working after htmx swaps it.
 */

import { blockById, boardRows, type Cell, dropCell, freeSpot, gridArea, type Layout, listOf, move, placementOf, pushedDown, type Result, size, snap, where } from "../grid.js";

declare const htmx: {
  ajax(verb: string, path: string, context: { target: string; swap: string; values: Record<string, string> }): Promise<void>;
};

const BLOCK = "#grid-workspace [data-block]";

const board = () => document.getElementById("grid-board");
const currentLayout = (): Layout => JSON.parse(board()?.dataset["layout"] ?? "[]") as Layout;
const say = (text: string) => {
  const status = document.getElementById("grid-status");
  if (status) status.textContent = text;
};

const post = (path: string, values: Record<string, string>) =>
  void htmx.ajax("POST", path, { target: "#grid-workspace", swap: "outerHTML", values });

const submit = (id: string, cell: Cell) =>
  post("/grid/move", { block: id, column: String(cell.column), row: String(cell.row) });

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const labelOf = (id: string) => blockById(id)?.label ?? id;

// ---- the preview ----

const blockElement = (grid: HTMLElement, id: string) => grid.querySelector<HTMLElement>(`.grid-block[data-block="${id}"]`);

/** every block back where the server put it, no outline */
const clearPreview = () => {
  const grid = board();
  if (!grid) return;
  grid.querySelector<HTMLElement>(".grid-preview")!.hidden = true;
  for (const p of currentLayout()) {
    const el = blockElement(grid, p.block);
    if (el) el.style.gridArea = gridArea(p);
  }
  for (const el of grid.querySelectorAll(".is-pushed")) el.classList.remove("is-pushed");
};

/**
 * Shows the drop's result: an outline where `id` would land, and every other block where it
 * would end up (pushed down). The dragged block itself stays under the pointer.
 */
const showPreview = (layout: Layout, id: string, result: Result) => {
  const grid = board();
  if (!grid) return;
  clearPreview();
  if (!result.ok) return;
  const preview = grid.querySelector<HTMLElement>(".grid-preview")!;
  for (const p of result.layout) {
    const el = p.block === id ? undefined : blockElement(grid, p.block);
    const before = placementOf(layout, p.block);
    if (!el || !before) continue;
    el.style.gridArea = gridArea(p);
    if (p.row !== before.row || p.column !== before.column) el.classList.add("is-pushed");
  }
  const landing = placementOf(result.layout, id);
  if (!landing) return;
  preview.style.gridArea = gridArea(landing);
  preview.hidden = false;
};

// ---- pointer ----

interface PointerDrag {
  readonly id: string;
  readonly el: HTMLElement;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** the block's cell under the pointer, from its top-left corner */
  readonly grab: Cell;
  readonly layout: Layout;
  started: boolean;
  /** where it would go (its top-left cell), while over the board */
  cell?: Cell | undefined;
  overPalette: boolean;
}

let drag: PointerDrag | undefined;

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || drag || carry) return;
  const el = (event.target as Element).closest<HTMLElement>(BLOCK);
  const block = blockById(el?.dataset["block"]);
  if (!el || !block) return;
  const rect = el.getBoundingClientRect();
  const grab = {
    column: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * block.width), 0, block.width - 1),
    row: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * block.height), 0, block.height - 1),
  };
  const { pointerId, clientX: startX, clientY: startY } = event;
  drag = { id: block.id, el, pointerId, startX, startY, grab, layout: currentLayout(), started: false, overPalette: false };
  el.setPointerCapture(pointerId);
});

document.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  const dx = event.clientX - drag.startX;
  const dy = event.clientY - drag.startY;
  if (!drag.started) {
    if (Math.hypot(dx, dy) < 5) return; // a click, not a drag
    drag.started = true;
    drag.el.classList.add("is-dragging");
  }
  drag.el.style.translate = `${dx}px ${dy}px`;

  // the dragged block ignores the pointer (.is-dragging), so this finds what is under it
  const under = document.elementsFromPoint(event.clientX, event.clientY);
  const cell = under.find((el): el is HTMLElement => el.classList.contains("grid-cell"));
  drag.overPalette = !cell && under.some((el) => el.matches("[data-palette]"));
  if (!cell) {
    drag.cell = undefined;
    clearPreview();
    return;
  }
  const hover = { column: Number(cell.dataset["column"]), row: Number(cell.dataset["row"]) };
  drag.cell = dropCell(hover, drag.grab);
  showPreview(drag.layout, drag.id, move(drag.layout, drag.id, drag.cell));
});

const endDrag = (commit: boolean) => {
  const d = drag;
  drag = undefined;
  if (!d) return;
  d.el.classList.remove("is-dragging");
  d.el.style.translate = "";
  clearPreview();
  if (!d.started || !commit) return;
  if (d.overPalette) {
    if (placementOf(d.layout, d.id)) post("/grid/remove", { block: d.id });
  } else if (d.cell) {
    submit(d.id, d.cell);
  }
};

document.addEventListener("pointerup", (event) => {
  if (drag?.pointerId === event.pointerId) endDrag(true);
});
document.addEventListener("pointercancel", (event) => {
  if (drag?.pointerId === event.pointerId) endDrag(false);
});

// ---- keyboard ----

interface Carry {
  readonly id: string;
  readonly el: HTMLElement;
  readonly layout: Layout;
  /** where the block's top-left corner would go */
  cursor: Cell;
}

let carry: Carry | undefined;

const arrows: Record<string, Cell> = {
  ArrowLeft: { column: -1, row: 0 },
  ArrowRight: { column: 1, row: 0 },
  ArrowUp: { column: 0, row: -1 },
  ArrowDown: { column: 0, row: 1 },
};

const updateCarry = (c: Carry) => {
  const result = move(c.layout, c.id, c.cursor);
  showPreview(c.layout, c.id, result);
  const pushed = result.ok ? pushedDown(c.layout, result.layout, c.id) : [];
  say(`${where(c.cursor)}.${pushed.length > 0 ? ` ${listOf(pushed)} would move down.` : ""}`);
};

const pickUp = (el: HTMLElement, id: string) => {
  const layout = currentLayout();
  const block = blockById(id)!;
  const cursor = placementOf(layout, id) ?? freeSpot(layout, id);
  carry = { id, el, layout, cursor: { column: cursor.column, row: cursor.row } };
  el.classList.add("is-carrying");
  say(`Picked up ${block.label} (${size(block)}). Arrow keys move it, Enter drops it, Escape cancels.`);
  updateCarry(carry);
};

const endCarry = () => {
  carry?.el.classList.remove("is-carrying");
  carry = undefined;
  clearPreview();
};

document.addEventListener("keydown", (event) => {
  const el = (event.target as Element).closest<HTMLElement>(BLOCK);
  const id = el?.dataset["block"];
  if (!el || !id || !blockById(id) || drag) return;
  const activate = event.key === "Enter" || event.key === " ";

  if (!carry) {
    if (activate) {
      event.preventDefault();
      pickUp(el, id);
    } else if ((event.key === "Delete" || event.key === "Backspace") && placementOf(currentLayout(), id)) {
      event.preventDefault();
      post("/grid/remove", { block: id });
    }
    return;
  }

  const step = arrows[event.key];
  if (step) {
    event.preventDefault();
    // snapped inside the columns, and as far down as the board is drawn (its empty rows are
    // where blocks go under the layout)
    const next = snap(blockById(carry.id)!, {
      column: carry.cursor.column + step.column,
      row: carry.cursor.row + step.row,
    });
    carry.cursor = { column: next.column, row: Math.min(next.row, boardRows(carry.layout)) };
    updateCarry(carry);
  } else if (activate) {
    event.preventDefault();
    const c = carry;
    endCarry();
    submit(c.id, c.cursor);
  } else if (event.key === "Escape") {
    event.preventDefault();
    say(`${labelOf(carry.id)} was put back.`);
    endCarry();
  }
});

// leaving the block (Tab, a click elsewhere) puts it back
document.addEventListener("focusout", (event) => {
  if (carry && event.target === carry.el) endCarry();
});
