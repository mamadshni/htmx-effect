/**
 * The grid builder's rules, shared by the server (which decides) and the browser (which shows
 * the result live while dragging): the grids, the blocks, and where everything ends up.
 *
 * There are two layouts of the same blocks, edited separately: one for wide screens (12
 * columns) and one for narrow screens (6 columns); client/grid-flow.css switches between them
 * at NARROW_BELOW. What a layout decides is the columns: where each block starts and how many
 * columns it spans. Rows only order the blocks: on a page, each row is as tall as its content.
 *
 * On a page (<grid-flow>, with blockStyle on each block), each block is as tall as its content and pushes down
 * only the blocks under it in its columns; blocks beside it keep their own height.
 *
 * A layout is a list of placements: a block, its top-left cell and its width in columns. Cells
 * are 1-based, like CSS grid lines, so a placement maps to
 * `grid-area: <row> / <column> / span <height> / span <width>`.
 *
 * Two ways to change a layout: put a block somewhere, or make it wider or narrower. Nothing is
 * ever refused for lack of room: a block past the side snaps back inside, and blocks in the way
 * are pushed down (and push the ones under them) to the first rows where they fit. Blocks do
 * not float back up, so gaps you leave stay.
 */

export const COLUMNS = 12;
/** columns on narrow screens */
export const NARROW_COLUMNS = 6;
/** below this width the narrow layout is used (also in client/grid-flow.css) */
export const NARROW_BELOW = "48rem";
/** empty rows drawn under a layout, to drop blocks below it */
export const SPARE_ROWS = 3;
/** a board is never drawn shorter than this */
export const MIN_ROWS = 6;

/** a grid's column count */
export type Columns = typeof COLUMNS | typeof NARROW_COLUMNS;

export type View = "wide" | "narrow";
export const views: ReadonlyArray<View> = ["wide", "narrow"];
export const isView = (value: string | undefined): value is View => views.includes(value as View);
export const columnsOf = (view: View): Columns => (view === "wide" ? COLUMNS : NARROW_COLUMNS);
export const viewLabel = (view: View) => (view === "wide" ? "wide screens" : "narrow screens");

export interface Block {
  /** also its CSS grid-area name, so a valid CSS identifier */
  readonly id: string;
  readonly label: string;
  /** its width when first placed in 12 columns (half of it, rounded up, in 6) */
  readonly width: number;
  /** rows it spans in the editor; on a page its height follows its content */
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

/** a block's width when it is first placed in a grid */
export const defaultWidth = (block: Block, columns: Columns) => Math.min(columns, Math.ceil((block.width * columns) / COLUMNS));

export interface Cell {
  readonly column: number;
  readonly row: number;
}

export interface Placement extends Cell {
  readonly block: string;
  /** in columns */
  readonly width: number;
}

export type Layout = ReadonlyArray<Placement>;

/** both layouts of the same blocks */
export interface Layouts {
  readonly wide: Layout;
  readonly narrow: Layout;
}

export const emptyLayouts: Layouts = { wide: [], narrow: [] };

interface Rect extends Cell {
  readonly width: number;
  readonly height: number;
}

export const where = ({ column, row }: Cell) => `row ${row}, column ${column}`;
const labelOf = (id: string) => blockById(id)?.label ?? id;
const columnsText = (n: number) => (n === 1 ? "1 column" : `${n} columns`);

/** "6×3": columns × rows */
export const size = (p: Placement) => `${p.width}×${blockById(p.block)?.height ?? 1}`;

export const rectOf = (p: Placement): Rect | undefined => {
  const block = blockById(p.block);
  return block && { column: p.column, row: p.row, width: p.width, height: block.height };
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

/** how many rows a board shows: the layout and some empty rows under it */
export const boardRows = (layout: Layout) => Math.max(MIN_ROWS, height(layout) + SPARE_ROWS);

/** a width that fits the grid */
const fitWidth = (width: number, columns: Columns) => Math.min(Math.max(1, Math.round(width)), columns);

/** keep a block inside the columns and below the top: it snaps to the nearest cell that is */
export const snap = (width: number, { column, row }: Cell, columns: Columns): Cell => ({
  column: Math.min(Math.max(1, column), columns - width + 1),
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

const alsoMoved = (before: Layout, after: Layout, id: string) => {
  const pushed = pushedDown(before, after, id);
  return pushed.length > 0 ? ` ${listOf(pushed)} moved down.` : "";
};

export type Result =
  | { readonly ok: true; readonly layout: Layout; readonly message: string }
  | { readonly ok: false; readonly message: string };

const fail = (message: string) => ({ ok: false, message }) as const;

/**
 * Put a block (in the layout or not yet) with its top-left corner at `cell`, keeping its width
 * (a new one gets its default width), pushing others down.
 */
export const move = (layout: Layout, id: string, cell: Cell, columns: Columns): Result => {
  const block = blockById(id);
  if (!block) return fail("There is no such block.");
  const current = placementOf(layout, id);
  const width = current?.width ?? defaultWidth(block, columns);
  const at = snap(width, cell, columns);
  const next = settle([{ block: id, width, ...at }], layout.filter((p) => p.block !== id));
  const verb = current ? "moved to" : "placed at";
  return { ok: true, layout: next, message: `${block.label} ${verb} ${where(at)}.${alsoMoved(layout, next, id)}` };
};

/**
 * Make a block `width` columns wide (at most the grid's), from its left edge; when that would go
 * past the right side, it snaps left to fit. Blocks it now covers are pushed down.
 */
export const resize = (layout: Layout, id: string, width: number, columns: Columns): Result => {
  const block = blockById(id);
  const current = placementOf(layout, id);
  if (!block || !current) return fail("That block is not in this layout.");
  const fitted = fitWidth(width, columns);
  const at = snap(fitted, current, columns);
  const next = settle([{ ...current, ...at, width: fitted }], layout.filter((p) => p.block !== id));
  return { ok: true, layout: next, message: `${block.label} is ${columnsText(fitted)} wide.${alsoMoved(layout, next, id)}` };
};

/** the first free spot for a block of `width` (row by row); there always is one, at the latest under the layout */
export const freeSpot = (layout: Layout, id: string, width: number, columns: Columns): Cell => {
  const others = layout.filter((p) => p.block !== id);
  for (let row = 1; row <= height(others) + 1; row++)
    for (let column = 1; column + width - 1 <= columns; column++)
      if (!collides({ block: id, width, column, row }, others)) return { column, row };
  return { column: 1, row: height(others) + 1 };
};

/**
 * Where a dragged block goes: its top-left corner, with the pointer over `hover` and holding the
 * block at `grab` (its cell under the pointer, 0-based from the block's top-left corner).
 * Over another block or not, it is the same: that block is pushed down.
 */
export const dropCell = (hover: Cell, grab: Cell): Cell => ({ column: hover.column - grab.column, row: hover.row - grab.row });

/**
 * A narrow layout made from a wide one, to start from: blocks half as wide (rounded up), in
 * the same reading order (top to bottom, left to right). Each goes to the first free spot from
 * its own row (or the previous block's, if lower); in that row, the free column closest to its
 * own (halved); lower down, it wraps like text: the leftmost free column.
 */
export const narrowLayout = (wide: Layout): Layout => {
  const placed: Array<Placement> = [];
  let fromRow = 1;
  for (const p of [...wide].sort((a, b) => a.row - b.row || a.column - b.column)) {
    const width = Math.min(NARROW_COLUMNS, Math.ceil(p.width / 2));
    const last = NARROW_COLUMNS - width + 1;
    const wanted = Math.min(Math.ceil(p.column / 2), last);
    const leftFirst = Array.from({ length: last }, (_, i) => i + 1);
    const nearFirst = [...leftFirst].sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b);
    const start = Math.max(p.row, fromRow);
    for (let row = start; ; row++) {
      const column = (row === start ? nearFirst : leftFirst).find(
        (c) => !collides({ block: p.block, width, column: c, row }, placed),
      );
      if (column !== undefined) {
        placed.push({ block: p.block, width, column, row });
        fromRow = row;
        break;
      }
    }
  }
  return placed;
};

// ---- both layouts: the same blocks in each ----

export type LayoutsResult =
  | { readonly ok: true; readonly layouts: Layouts; readonly message: string }
  | { readonly ok: false; readonly message: string };

const otherView = (view: View): View => (view === "wide" ? "narrow" : "wide");

const withLayout = (layouts: Layouts, view: View, layout: Layout): Layouts =>
  view === "wide" ? { ...layouts, wide: layout } : { ...layouts, narrow: layout };

/**
 * Put a block in one layout. A block that was in neither (from the palette) is also added to the
 * other layout, under what is there, so both always have the same blocks.
 */
export const placeIn = (layouts: Layouts, view: View, id: string, cell: Cell): LayoutsResult => {
  const result = move(layouts[view], id, cell, columnsOf(view));
  if (!result.ok) return result;
  let next = withLayout(layouts, view, result.layout);
  let message = result.message;
  const other = otherView(view);
  if (!placementOf(layouts[other], id)) {
    const width = defaultWidth(blockById(id)!, columnsOf(other));
    next = withLayout(next, other, [...layouts[other], { block: id, width, column: 1, row: height(layouts[other]) + 1 }]);
    message += ` It was also added at the bottom of the layout for ${viewLabel(other)}.`;
  }
  return { ok: true, layouts: next, message };
};

export const resizeIn = (layouts: Layouts, view: View, id: string, width: number): LayoutsResult => {
  const result = resize(layouts[view], id, width, columnsOf(view));
  return result.ok ? { ok: true, layouts: withLayout(layouts, view, result.layout), message: result.message } : result;
};

/** back to the palette: out of both layouts */
export const removeFrom = (layouts: Layouts, id: string): LayoutsResult => {
  const block = blockById(id);
  if (!block || (!placementOf(layouts.wide, id) && !placementOf(layouts.narrow, id)))
    return fail("That block is not on the grid.");
  return {
    ok: true,
    layouts: { wide: layouts.wide.filter((p) => p.block !== id), narrow: layouts.narrow.filter((p) => p.block !== id) },
    message: `${block.label} is back in the palette.`,
  };
};

// ---- CSS ----

/** the layout as grid-template-areas rows (as many as it is tall): a block's id in each cell it covers, "." elsewhere */
export const templateAreas = (layout: Layout, columns: Columns): ReadonlyArray<string> => {
  const cells = Array.from({ length: height(layout) }, () => Array.from({ length: columns }, () => "."));
  for (const p of layout) {
    const r = rectOf(p);
    if (!r) continue;
    for (let row = r.row; row < r.row + r.height; row++)
      for (let column = r.column; column < Math.min(columns + 1, r.column + r.width); column++)
        cells[row - 1]![column - 1] = p.block;
  }
  return cells.map((row) => row.join(" "));
};

/** the value of grid-template-areas, for a style attribute ("none" for an empty layout) */
export const areasValue = (layout: Layout, columns: Columns) =>
  templateAreas(layout, columns).map((row) => `"${row}"`).join(" ") || "none";

/** reading order: top to bottom, left to right */
const inReadingOrder = (layout: Layout) => [...layout].sort((a, b) => a.row - b.row || a.column - b.column);

/**
 * A block's place in both layouts, for its style attribute: --wide-* and --narrow-* custom
 * properties (column, span, row, rows). client/grid-flow.css, the same for every layout, picks
 * one set per screen size; with client/grid-flow.ts each block is as tall as its content.
 */
export const blockStyle = (layouts: Layouts, id: string) =>
  views
    .flatMap((view) => {
      const p = placementOf(layouts[view], id);
      const rows = blockById(id)?.height ?? 1;
      return p ? [`--${view}-column: ${p.column}; --${view}-span: ${p.width}; --${view}-row: ${p.row}; --${view}-rows: ${rows}`] : [];
    })
    .join("; ");

/** the blocks of a layout in the order they are written: the wide layout's reading order */
export const blocksInOrder = (layouts: Layouts) => inReadingOrder(layouts.wide).map((p) => p.block);

/** the markup for a pattern: <grid-flow> and one element per block, its place on its style */
export const layoutHtml = (layouts: Layouts) =>
  [
    "<grid-flow>",
    ...blocksInOrder(layouts).map(
      (id) => `  <section class="${id}" style="${blockStyle(layouts, id)}">${labelOf(id)}</section>`,
    ),
    "</grid-flow>",
  ].join("\n");

/** parse a stored layout: drops unknown or repeated blocks, fits them inside, settles overlaps */
export const parseLayout = (value: unknown, columns: Columns): Layout => {
  if (!Array.isArray(value)) return [];
  const placements: Array<Placement> = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { block, column, row, width } = item as Record<string, unknown>;
    const known = typeof block === "string" ? blockById(block) : undefined;
    if (!known || !Number.isInteger(column) || !Number.isInteger(row) || placementOf(placements, known.id)) continue;
    const w = fitWidth(Number.isInteger(width) ? (width as number) : defaultWidth(known, columns), columns);
    placements.push({ block: known.id, width: w, ...snap(w, { column: column as number, row: row as number }, columns) });
  }
  return settle([], placements);
};
