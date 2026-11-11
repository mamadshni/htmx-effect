/**
 * Moving and resizing blocks in the grid builder, with the pointer (mouse, pen, touch) or the
 * keyboard, on whichever board is shown (wide or narrow layout). While a block moves or changes
 * width, an outline shows where it would land and the blocks in its way snap to where they
 * would be pushed, using the server's own rules (../grid.ts). The change is posted with htmx
 * (/grid/move, /grid/resize, /grid/remove); the server applies it again and answers with the
 * new workspace. Listeners are on the document, so they keep working after htmx swaps it.
 */

import {
  blockById,
  boardRows,
  type Cell,
  type Columns,
  defaultWidth,
  dropCell,
  freeSpot,
  gridArea,
  isView,
  type Layout,
  listOf,
  move,
  placementOf,
  pushedDown,
  resize,
  type Result,
  snap,
  type View,
  where,
} from "../grid.js";

// defines <grid-flow>, used by the pattern pages
import "./grid-flow.js";
import { isPlaying, startTetris } from "./tetris.js";

declare const htmx: {
  ajax(verb: string, path: string, context: { target: string; swap: string; values: Record<string, string> }): Promise<void>;
};

const BLOCK = "#grid-workspace [data-block]";

/** a layout's board as the page shows it: which layout, its columns, and what is in it */
interface Board {
  readonly el: HTMLElement;
  readonly view: View;
  readonly columns: Columns;
  readonly layout: Layout;
}

const boardFrom = (el: HTMLElement | null): Board | undefined => {
  const view = el?.dataset["view"];
  if (!el || !isView(view)) return undefined;
  return {
    el,
    view,
    columns: Number(el.dataset["columns"]) as Columns,
    layout: JSON.parse(el.dataset["layout"] ?? "[]") as Layout,
  };
};

/** the board being edited: the one the toggle shows */
const shownBoard = () => {
  const narrow = document.querySelector<HTMLInputElement>("#grid-view-narrow")?.checked;
  return boardFrom(document.getElementById(narrow ? "grid-board-narrow" : "grid-board-wide"));
};

/** the board a block is on, or the shown one for a block in the palette */
const boardOf = (el: HTMLElement) => boardFrom(el.closest<HTMLElement>(".grid-board[data-view]")) ?? shownBoard();

const say = (text: string) => {
  const status = document.getElementById("grid-status");
  if (status) status.textContent = text;
};

const post = (path: string, values: Record<string, string>) =>
  void htmx.ajax("POST", path, { target: "#grid-workspace", swap: "outerHTML", values });

const postMove = (board: Board, id: string, cell: Cell) =>
  post("/grid/move", { view: board.view, block: id, column: String(cell.column), row: String(cell.row) });

const postResize = (board: Board, id: string, width: number) =>
  post("/grid/resize", { view: board.view, block: id, width: String(width) });

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const labelOf = (id: string) => blockById(id)?.label ?? id;
const widthOf = (board: Board, id: string) =>
  placementOf(board.layout, id)?.width ?? defaultWidth(blockById(id)!, board.columns);

// ---- the preview ----

const blockElement = (board: Board, id: string) => board.el.querySelector<HTMLElement>(`.grid-block[data-block="${id}"]`);

/** every block back where the server put it, no outline */
const clearPreview = (board: Board) => {
  board.el.querySelector<HTMLElement>(".grid-preview")!.hidden = true;
  for (const p of board.layout) {
    const el = blockElement(board, p.block);
    if (el) el.style.gridArea = gridArea(p);
  }
  for (const el of board.el.querySelectorAll(".is-pushed")) el.classList.remove("is-pushed");
};

/**
 * Shows a change's result: an outline where `id` would be, and every other block where it
 * would end up (pushed down). The block itself follows the pointer when it is being moved,
 * and takes its new width at once when it is being resized (`resizing`).
 */
const showPreview = (board: Board, id: string, result: Result, resizing = false) => {
  clearPreview(board);
  if (!result.ok) return;
  for (const p of result.layout) {
    const el = p.block === id && !resizing ? undefined : blockElement(board, p.block);
    const before = placementOf(board.layout, p.block);
    if (!el || !before) continue;
    el.style.gridArea = gridArea(p);
    if (p.block !== id && (p.row !== before.row || p.column !== before.column)) el.classList.add("is-pushed");
  }
  const landing = placementOf(result.layout, id);
  const preview = board.el.querySelector<HTMLElement>(".grid-preview")!;
  if (!landing) return;
  preview.style.gridArea = gridArea(landing);
  preview.hidden = false;
};

// ---- pointer ----

interface PointerDrag {
  readonly id: string;
  readonly el: HTMLElement;
  readonly board: Board;
  /** move the block, or change its width (from its right edge) */
  readonly mode: "move" | "resize";
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  /** the block's cell under the pointer, from its top-left corner */
  readonly grab: Cell;
  started: boolean;
  /** what letting go would do, while over the board */
  change?: { readonly cell: Cell } | { readonly width: number } | undefined;
  overPalette: boolean;
}

let drag: PointerDrag | undefined;

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || drag || carry || isPlaying()) return;
  const target = event.target as Element;
  const el = target.closest<HTMLElement>(BLOCK);
  const block = blockById(el?.dataset["block"]);
  const board = el && boardOf(el);
  if (!el || !block || !board) return;
  const mode = target.closest(".grid-block__resize") && placementOf(board.layout, block.id) ? "resize" : "move";
  const rect = el.getBoundingClientRect();
  const width = widthOf(board, block.id);
  const grab = {
    column: clamp(Math.floor(((event.clientX - rect.left) / rect.width) * width), 0, width - 1),
    row: clamp(Math.floor(((event.clientY - rect.top) / rect.height) * block.height), 0, block.height - 1),
  };
  const { pointerId, clientX: startX, clientY: startY } = event;
  drag = { id: block.id, el, board, mode, pointerId, startX, startY, grab, started: false, overPalette: false };
  el.setPointerCapture(pointerId);
});

document.addEventListener("pointermove", (event) => {
  const d = drag;
  if (!d || event.pointerId !== d.pointerId) return;
  const dx = event.clientX - d.startX;
  const dy = event.clientY - d.startY;
  if (!d.started) {
    if (Math.hypot(dx, dy) < 5) return; // a click, not a drag
    d.started = true;
    d.el.classList.add(d.mode === "move" ? "is-dragging" : "is-resizing");
  }
  if (d.mode === "move") d.el.style.translate = `${dx}px ${dy}px`;

  // a dragged block ignores the pointer (.is-dragging), so this finds what is under it;
  // only the cells of the board it is on count
  const under = document.elementsFromPoint(event.clientX, event.clientY);
  const cell = under.find((el): el is HTMLElement => el.matches(".grid-cell") && el.parentElement === d.board.el);
  d.overPalette = d.mode === "move" && !cell && under.some((el) => el.matches("[data-palette]"));
  if (!cell) {
    d.change = undefined;
    clearPreview(d.board);
    return;
  }
  const hover = { column: Number(cell.dataset["column"]), row: Number(cell.dataset["row"]) };
  if (d.mode === "move") {
    const at = dropCell(hover, d.grab);
    d.change = { cell: at };
    showPreview(d.board, d.id, move(d.board.layout, d.id, at, d.board.columns));
  } else {
    // the right edge follows the pointer's column
    const width = Math.max(1, hover.column - placementOf(d.board.layout, d.id)!.column + 1);
    d.change = { width };
    showPreview(d.board, d.id, resize(d.board.layout, d.id, width, d.board.columns), true);
  }
});

const endDrag = (commit: boolean) => {
  const d = drag;
  drag = undefined;
  if (!d) return;
  d.el.classList.remove("is-dragging", "is-resizing");
  d.el.style.translate = "";
  clearPreview(d.board);
  if (!d.started || !commit) return;
  if (d.overPalette) {
    if (placementOf(d.board.layout, d.id)) post("/grid/remove", { block: d.id });
  } else if (d.change && "cell" in d.change) {
    postMove(d.board, d.id, d.change.cell);
  } else if (d.change) {
    postResize(d.board, d.id, d.change.width);
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
  readonly board: Board;
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
  const result = move(c.board.layout, c.id, c.cursor, c.board.columns);
  showPreview(c.board, c.id, result);
  const pushed = result.ok ? pushedDown(c.board.layout, result.layout, c.id) : [];
  say(`${where(c.cursor)}.${pushed.length > 0 ? ` ${listOf(pushed)} would move down.` : ""}`);
};

const pickUp = (el: HTMLElement, id: string, board: Board) => {
  const width = widthOf(board, id);
  const cursor = placementOf(board.layout, id) ?? freeSpot(board.layout, id, width, board.columns);
  carry = { id, el, board, cursor: { column: cursor.column, row: cursor.row } };
  el.classList.add("is-carrying");
  say(`Picked up ${labelOf(id)} (${width} columns wide). Arrow keys move it, Enter drops it, Escape cancels.`);
  updateCarry(carry);
};

const endCarry = () => {
  if (carry) clearPreview(carry.board);
  carry?.el.classList.remove("is-carrying");
  carry = undefined;
};

// "Play Tetris" (in the Layout toolbar) plays the shown layout as Tetris (client/tetris.ts);
// delegated, so it keeps working after htmx swaps the workspace
document.addEventListener("click", (event) => {
  if (!(event.target as Element).closest("[data-tetris]") || isPlaying() || drag) return;
  const board = shownBoard();
  if (!board) return;
  endCarry();
  startTetris({
    view: board.view,
    columns: board.columns,
    say,
    keep: (layout) => post("/grid/replace", { view: board.view, layout: JSON.stringify(layout) }),
  });
});

document.addEventListener("keydown", (event) => {
  if (isPlaying()) return;
  const el = (event.target as Element).closest<HTMLElement>(BLOCK);
  const id = el?.dataset["block"];
  const board = el && boardOf(el);
  if (!el || !id || !blockById(id) || !board || drag) return;
  const activate = event.key === "Enter" || event.key === " ";
  const placed = placementOf(board.layout, id);

  if (!carry) {
    if (activate) {
      event.preventDefault();
      pickUp(el, id, board);
    } else if (event.shiftKey && placed && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      const width = placed.width + (event.key === "ArrowRight" ? 1 : -1);
      if (width < 1 || width > board.columns) {
        say(`${labelOf(id)} is already ${placed.width} columns wide.`);
        return;
      }
      postResize(board, id, width);
    } else if ((event.key === "Delete" || event.key === "Backspace") && placed) {
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
    const c = carry;
    const next = snap(widthOf(c.board, c.id), { column: c.cursor.column + step.column, row: c.cursor.row + step.row }, c.board.columns);
    c.cursor = { column: next.column, row: Math.min(next.row, boardRows(c.board.layout)) };
    updateCarry(c);
  } else if (activate) {
    event.preventDefault();
    const c = carry;
    endCarry();
    postMove(c.board, c.id, c.cursor);
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

// switching layouts while carrying a block puts it back
document.addEventListener("change", (event) => {
  if (carry && (event.target as Element).matches("[name='grid-view']")) endCarry();
});
