/**
 * "Play Tetris" in the grid builder's Layout toolbar (wired in grid-builder.ts) turns the layout
 * being edited into a game of Tetris. Every block falls from the top, one at a time in random
 * order, at its width for that layout (12 or 6 columns); it moves left and right and stops on
 * the floor or on a block. Filled rows flash and score, but stay: the blocks are your layout.
 * When everything has landed (or the stack reaches the top), keep the result as the layout
 * (POST /grid/replace, checked by the server like any layout) or go back to the old one.
 *
 * Keys: Left / Right move, Down falls faster, Space drops, P pauses, Escape quits. Blocks are
 * rectangles, so nothing rotates (a rotated block would change its height, which layouts do
 * not store).
 *
 * The game draws its own board (outside the htmx workspace, which is hidden while it runs),
 * so the builder's own boards and listeners are left alone.
 */

import { blockById, blocks, collides, type Columns, defaultWidth, gridArea, type Layout, type Placement, type View, viewLabel } from "../grid.js";

/** how deep the well is */
const WELL_ROWS = 16;
/** ms per row at the start, and the fastest it gets */
const START_SPEED = 700;
const FASTEST = 180;
/** how much faster each landed block makes it */
const SPEED_UP = 0.9;

export interface TetrisOptions {
  readonly view: View;
  readonly columns: Columns;
  /** the live region */
  readonly say: (text: string) => void;
  /** keep the result: post it as the layout for `view` */
  readonly keep: (layout: Layout) => void;
}

let playing = false;

/** while a game runs, the builder's own dragging and keys stay out of the way */
export const isPlaying = () => playing;

const shuffled = <A>(items: ReadonlyArray<A>) => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
};

const element = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** a block's colour: a hue per block, so pieces are told apart */
const hueOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export const startTetris = ({ view, columns, say, keep }: TetrisOptions) => {
  const workspace = document.getElementById("grid-workspace");
  if (playing || !workspace) return;
  playing = true;

  // ---- state ----
  /** every block, in random order: the next one is pieces[0] */
  const pieces = shuffled(blocks.map((b) => b.id));
  const placed: Array<Placement> = [];
  let current: Placement | undefined;
  let speed = START_SPEED;
  let score = 0;
  let lines = 0;
  let paused = false;
  let timer = 0;
  let over = false;

  const heightOf = (p: Placement) => blockById(p.block)?.height ?? 1;
  const fits = (p: Placement) =>
    p.column >= 1 && p.column + p.width - 1 <= columns && p.row >= 1 && p.row + heightOf(p) - 1 <= WELL_ROWS && !collides(p, placed);
  const landing = (p: Placement) => {
    let row = p.row;
    while (fits({ ...p, row: row + 1 })) row++;
    return { ...p, row };
  };

  // ---- the board ----
  const game = element("section", "card grid-tetris");
  game.tabIndex = -1;
  game.setAttribute("aria-labelledby", "grid-tetris-title");
  const bar = element("div", "grid-tetris__bar");
  const title = element("h2", "card__title", `Block Tetris: ${viewLabel(view)}, ${columns} columns`);
  title.id = "grid-tetris-title";
  const scoreEl = element("p", "grid-tetris__score");
  const nextEl = element("p", "grid-tetris__next");
  bar.append(title, scoreEl, nextEl);
  const help = element("p", "grid-tetris__help", "← → move · ↓ faster · Space drop · P pause · Esc quit");
  const well = element("div", "grid-board grid-tetris__well");
  well.style.setProperty("--columns", String(columns));
  well.style.setProperty("--rows", String(WELL_ROWS));
  for (let row = 1; row <= WELL_ROWS; row++)
    for (let column = 1; column <= columns; column++) {
      const cell = element("div", "grid-cell");
      cell.style.gridArea = `${row} / ${column}`;
      cell.setAttribute("aria-hidden", "true");
      well.append(cell);
    }
  const ghost = element("div", "grid-preview");
  ghost.setAttribute("aria-hidden", "true");
  const layer = element("div", "grid-tetris__layer");
  layer.style.display = "contents";
  well.append(layer, ghost);
  const end = element("div", "grid-tetris__end");
  end.hidden = true;
  const endText = element("p", "grid-tetris__end-text");
  endText.tabIndex = -1;
  const keepButton = element("button", "button", "Keep this layout");
  keepButton.type = "button";
  const backButton = element("button", "button button--ghost", "Back to my layout");
  backButton.type = "button";
  const endButtons = element("div", "button-row");
  endButtons.append(keepButton, backButton);
  const endHint = element("p", "grid-tetris__help", "Tab to a button to choose · Esc goes back");
  end.append(endText, endHint, endButtons);
  game.append(bar, help, well, end);
  workspace.before(game);
  workspace.hidden = true;
  game.focus();

  const pieceEl = (p: Placement, falling: boolean) => {
    const block = blockById(p.block)!;
    const el = element("div", `grid-block grid-tetris__piece${falling ? " is-falling" : ""}`);
    el.style.gridArea = gridArea(p);
    el.style.setProperty("--hue", String(hueOf(p.block)));
    el.append(element("span", "grid-block__label", block.label), element("span", "grid-block__size", `${p.width}×${block.height}`));
    return el;
  };

  const draw = () => {
    layer.replaceChildren(...placed.map((p) => pieceEl(p, false)), ...(current ? [pieceEl(current, true)] : []));
    if (current) {
      ghost.style.gridArea = gridArea(landing(current));
      ghost.hidden = false;
    } else ghost.hidden = true;
    scoreEl.textContent = `Score ${score} · Rows ${lines}`;
    const next = pieces[0];
    if (over) nextEl.textContent = pieces.length > 0 ? `${pieces.length} did not land` : "";
    else nextEl.textContent = next ? `Next: ${blockById(next)!.label}` : "Last block";
  };

  // ---- the game ----
  const spawn = () => {
    const id = pieces.shift();
    if (!id) return finish(`All blocks landed. Score ${score}.`);
    const block = blockById(id)!;
    const width = defaultWidth(block, columns);
    const piece = { block: id, width, row: 1, column: Math.floor((columns - width) / 2) + 1 };
    if (!fits(piece)) {
      pieces.unshift(id);
      return finish(`The stack reached the top. Score ${score}. Blocks that did not land go back to the palette.`);
    }
    current = piece;
    say(`${block.label} is falling, ${width} columns wide.`);
    draw();
    schedule();
  };

  /** rows the stack now fills from side to side: they flash and score, and stay */
  const fullRows = () => {
    const full: Array<number> = [];
    for (let row = 1; row <= WELL_ROWS; row++) {
      let covered = 0;
      for (const p of placed) if (row >= p.row && row < p.row + heightOf(p)) covered += p.width;
      if (covered >= columns) full.push(row);
    }
    return full.length;
  };

  const lock = () => {
    if (!current) return;
    const before = fullRows();
    placed.push(current);
    const newRows = fullRows() - before;
    score += 10 + newRows * 100;
    lines += newRows;
    if (newRows > 0) {
      well.classList.remove("is-flash");
      void well.offsetWidth; // restart the flash
      well.classList.add("is-flash");
      say(`${newRows === 1 ? "A full row" : `${newRows} full rows`}! Score ${score}.`);
    }
    current = undefined;
    speed = Math.max(FASTEST, speed * SPEED_UP);
    spawn();
  };

  const step = () => {
    if (!current || paused || over) return;
    const down = { ...current, row: current.row + 1 };
    if (fits(down)) {
      current = down;
      draw();
      schedule();
    } else lock();
  };

  function schedule() {
    clearTimeout(timer);
    if (!over && !paused) timer = window.setTimeout(step, speed);
  }

  const shift = (by: number) => {
    if (!current) return;
    const moved = { ...current, column: current.column + by };
    if (fits(moved)) {
      current = moved;
      draw();
    }
  };

  /** the layout as it stands: the stack moved up so its top row is row 1 */
  const result = (): Layout => {
    const top = Math.min(...placed.map((p) => p.row));
    return placed.map((p) => ({ ...p, row: p.row - top + 1 }));
  };

  function finish(text: string) {
    over = true;
    clearTimeout(timer);
    current = undefined;
    draw();
    help.hidden = true;
    endText.textContent = text;
    keepButton.hidden = placed.length === 0;
    end.hidden = false;
    say(text);
    // focus the message, not a button: a Space still pressed as a drop must not choose for the player
    endText.focus();
  }

  const quit = () => {
    playing = false;
    over = true;
    clearTimeout(timer);
    document.removeEventListener("keydown", onKey, true);
    game.remove();
    workspace.hidden = false;
    // back where the game was started from
    document.getElementById("grid-tetris")?.focus();
  };

  keepButton.addEventListener("click", () => {
    const layout = result();
    quit();
    keep(layout);
  });
  backButton.addEventListener("click", () => {
    quit();
    say("Back to your layout. Nothing was changed.");
  });

  // captured on the document, so the keys work wherever focus is while the game runs
  function onKey(event: KeyboardEvent) {
    if (over) {
      if (event.key === "Escape") {
        event.preventDefault();
        backButton.click();
      } else if ((event.key === " " || event.key === "Enter") && !(event.target as Element).closest?.(".grid-tetris__end button")) {
        // drops and Enter do nothing on the end screen; Tab to a button to choose
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const keys: Record<string, () => void> = {
      ArrowLeft: () => shift(-1),
      ArrowRight: () => shift(1),
      ArrowDown: () => {
        score += 1;
        step();
      },
      " ": () => {
        if (!current) return;
        const target = landing(current);
        score += 2 * (target.row - current.row);
        current = target;
        lock();
      },
      p: () => {
        paused = !paused;
        say(paused ? "Paused." : "Playing.");
        help.textContent = paused
          ? "Paused · P to play"
          : "← → move · ↓ faster · Space drop · P pause · Esc quit";
        schedule();
      },
      Escape: () => {
        quit();
        say("Game over. Your layout was not changed.");
      },
    };
    const action = keys[event.key.length === 1 ? event.key.toLowerCase() : event.key];
    if (!action || (paused && event.key.toLowerCase() !== "p" && event.key !== "Escape")) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  }
  document.addEventListener("keydown", onKey, true);

  say(`Block Tetris! ${pieces.length} blocks, ${columns} columns. Left and right move, down falls faster, space drops, escape quits.`);
  spawn();
};
