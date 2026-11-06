/**
 * The grid builder's rules, shared by the server (which decides) and the browser (which shows
 * the result live while dragging): the grid, the blocks, and where everything ends up.
 *
 * There is one way to change the layout: put a block somewhere. Blocks never trade places.
 *
 * The grid has 12 columns and as many rows as the layout needs. A layout is a list of
 * placements: a block and its top-left cell. Cells are 1-based, like CSS grid lines, so a
 * placement maps to `grid-area: <row> / <column> / span <height> / span <width>`.
 *
 * Nothing is ever refused for lack of room: a block put past the side snaps back inside the 12
 * columns, and blocks in the way are pushed down (and push the ones under them) to the first
 * rows where they fit. Blocks do not float back up, so gaps you leave stay.
 */

export const COLUMNS = 12;
/** empty rows drawn under the layout, to drop blocks below it */
export const SPARE_ROWS = 3;
/** the board is never drawn shorter than this */
export const MIN_ROWS = 6;

export interface Block {
  /** also its CSS grid-area name, so a valid CSS identifier */
  readonly id: string;
  readonly label: string;
  /** in columns, at most COLUMNS */
  readonly width: number;
  /** in rows */
  readonly height: number;
}

/** each block can be placed once */
export const blocks: ReadonlyArray<Block> = [
  { id: "header", label: "Header", width: 12, height: 1 },
  { id: "sidebar", label: "Sidebar", width: 3, height: 6 },
  { id: "chart", label: "Chart", width: 6, height: 3 },
  { id: "table", label: "Table", width: 9, height: 3 },
  { id: "kpi-1", label: "KPI 1", width: 3, height: 2 },
  { id: "kpi-2", label: "KPI 2", width: 3, height: 2 },
  { id: "kpi-3", label: "KPI 3", width: 3, height: 2 },
  { id: "notes", label: "Notes", width: 3, height: 3 },
  { id: "footer", label: "Footer", width: 12, height: 1 },
];

export const blockById = (id: string | undefined) => blocks.find((b) => b.id === id);

export interface Cell {
  readonly column: number;
  readonly row: number;
}

export interface Placement extends Cell {
  readonly block: string;
}

export type Layout = ReadonlyArray<Placement>;

interface Rect extends Cell {
  readonly width: number;
  readonly height: number;
}

export const size = (block: Block) => `${block.width}×${block.height}`;
export const where = ({ column, row }: Cell) => `row ${row}, column ${column}`;
const labelOf = (id: string) => blockById(id)?.label ?? id;

export const rectOf = (placement: Placement): Rect | undefined => {
  const block = blockById(placement.block);
  return block && { column: placement.column, row: placement.row, width: block.width, height: block.height };
};

const overlaps = (a: Rect, b: Rect) =>
  a.column < b.column + b.width && b.column < a.column + a.width && a.row < b.row + b.height && b.row < a.row + a.height;

const collides = (p: Placement, others: Layout) => {
  const rect = rectOf(p);
  return rect !== undefined && others.some((o) => o.block !== p.block && overlaps(rect, rectOf(o)!));
};

/** the CSS grid-area of a placement */
export const gridArea = (p: Placement) => {
  const r = rectOf(p);
  return r ? `${r.row} / ${r.column} / span ${r.height} / span ${r.width}` : "auto";
};

/** the last row a block covers (0 for an empty layout) */
export const height = (layout: Layout) => Math.max(0, ...layout.map((p) => p.row + (rectOf(p)?.height ?? 1) - 1));

/** how many rows the board shows: the layout and some empty rows under it */
export const boardRows = (layout: Layout) => Math.max(MIN_ROWS, height(layout) + SPARE_ROWS);

/** keep a block inside the 12 columns and below the top: it snaps to the nearest cell that is */
export const snap = (block: Block, { column, row }: Cell): Cell => ({
  column: Math.min(Math.max(1, column), COLUMNS - block.width + 1),
  row: Math.max(1, row),
});

export const placementOf = (layout: Layout, id: string) => layout.find((p) => p.block === id);

/**
 * Places `first` in order (each pushed down below the ones before it, if they overlap), then
 * `others` from the top down, each pushed down as far as needed to cover nothing placed so
 * far. Nothing overlaps afterwards, and nothing moves up.
 */
const settle = (first: Layout, others: Layout): Layout => {
  const placed: Array<Placement> = [];
  const rest = [...others].sort((a, b) => a.row - b.row || a.column - b.column);
  for (const p of [...first, ...rest]) {
    let row = p.row;
    while (collides({ ...p, row }, placed)) row++;
    placed.push({ ...p, row });
  }
  return placed;
};

/** the labels of the blocks other than `id` that are lower in `after` than in `before` */
export const pushedDown = (before: Layout, after: Layout, id: string) =>
  after
    .filter((p) => p.block !== id && (placementOf(before, p.block)?.row ?? p.row) < p.row)
    .map((p) => labelOf(p.block));

/** "Table", "Table and Footer", "Chart, Table and Footer" */
export const listOf = (names: ReadonlyArray<string>) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;

export type Result =
  | { readonly ok: true; readonly layout: Layout; readonly message: string }
  | { readonly ok: false; readonly message: string };

const fail = (message: string): Result => ({ ok: false, message });

/** put a block (on the grid or not yet) with its top-left corner at `cell`, pushing others down */
export const move = (layout: Layout, id: string, cell: Cell): Result => {
  const block = blockById(id);
  if (!block) return fail("There is no such block.");
  const at = snap(block, cell);
  const verb = placementOf(layout, id) ? "moved to" : "placed at";
  const next = settle([{ block: id, ...at }], layout.filter((p) => p.block !== id));
  const pushed = pushedDown(layout, next, id);
  const also = pushed.length > 0 ? ` ${listOf(pushed)} moved down.` : "";
  return { ok: true, layout: next, message: `${block.label} ${verb} ${where(at)}.${also}` };
};

export const remove = (layout: Layout, id: string): Result => {
  const block = blockById(id);
  if (!block || !placementOf(layout, id)) return fail("That block is not on the grid.");
  return { ok: true, layout: layout.filter((p) => p.block !== id), message: `${block.label} is back in the palette.` };
};

/** the first free spot for a block (row by row); there always is one, at the latest under the layout */
export const freeSpot = (layout: Layout, id: string): Cell => {
  const block = blockById(id);
  const others = layout.filter((p) => p.block !== id);
  if (block)
    for (let row = 1; row <= height(others) + 1; row++)
      for (let column = 1; column + block.width - 1 <= COLUMNS; column++)
        if (!collides({ block: id, column, row }, others)) return { column, row };
  return { column: 1, row: height(others) + 1 };
};

/**
 * Where a dragged block goes: its top-left corner, with the pointer over `hover` and holding the
 * block at `grab` (its cell under the pointer, 0-based from the block's top-left corner).
 * Over another block or not, it is the same: that block is pushed down.
 */
export const dropCell = (hover: Cell, grab: Cell): Cell => ({ column: hover.column - grab.column, row: hover.row - grab.row });

/** the layout as grid-template-areas rows (as many as it is tall): a block's id in each cell it covers, "." elsewhere */
export const templateAreas = (layout: Layout): ReadonlyArray<string> => {
  const cells = Array.from({ length: height(layout) }, () => Array.from({ length: COLUMNS }, () => "."));
  for (const p of layout) {
    const r = rectOf(p);
    if (!r) continue;
    for (let row = r.row; row < r.row + r.height; row++)
      for (let column = r.column; column < r.column + r.width; column++) cells[row - 1]![column - 1] = p.block;
  }
  return cells.map((row) => row.join(" "));
};

/** the value of grid-template-areas, for a style attribute ("none" for an empty layout) */
export const areasValue = (layout: Layout) => templateAreas(layout).map((row) => `"${row}"`).join(" ") || "none";

/** a stylesheet that recreates the layout, to copy into another page */
export const layoutCss = (layout: Layout, selector = ".layout") =>
  [
    `${selector} {`,
    "  display: grid;",
    `  grid-template-columns: repeat(${COLUMNS}, 1fr);`,
    "  grid-auto-rows: auto;",
    "  grid-template-areas:",
    ...templateAreas(layout).map((row, i, rows) => `    "${row}"${i === rows.length - 1 ? ";" : ""}`),
    "}",
    ...layout.map((p) => `${selector} > .${p.block} { grid-area: ${p.block}; }`),
  ].join("\n");

/** parse a stored layout: drops unknown or repeated blocks, snaps them inside, settles overlaps */
export const parseLayout = (value: unknown): Layout => {
  if (!Array.isArray(value)) return [];
  const placements: Array<Placement> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { block, column, row } = item as Record<string, unknown>;
    const known = typeof block === "string" ? blockById(block) : undefined;
    if (!known || !Number.isInteger(column) || !Number.isInteger(row) || placementOf(placements, known.id)) continue;
    placements.push({ block: known.id, ...snap(known, { column: column as number, row: row as number }) });
  }
  return settle([], placements);
};
