/**
 * The layouts being edited (wide and narrow) and the saved patterns. They live in the server's
 * memory: they survive reloads, not restarts, and are shared by everyone (a real app would keep
 * them per user, e.g. in a database row with the layouts as JSON, read back with parseLayout).
 */

import { defaultWidth, blockById, type Layout, type Layouts, narrowLayout } from "./grid.js";

export interface Pattern {
  readonly id: string;
  readonly name: string;
  readonly layouts: Layouts;
}

const placed = (block: string, column: number, row: number): Layout[number] => ({
  block,
  column,
  row,
  width: defaultWidth(blockById(block)!, 12),
});

const starterWide: Layout = [
  placed("header", 1, 1),
  placed("sidebar", 1, 2),
  placed("chart", 4, 2),
  placed("kpi-1", 10, 2),
  placed("table", 4, 5),
  placed("footer", 1, 8),
];

/** the narrow one starts as the one made from the wide layout */
const starter: Layouts = { wide: starterWide, narrow: narrowLayout(starterWide) };

let draft: Layouts = starter;

export const currentLayouts = () => draft;
export const setLayouts = (layouts: Layouts) => {
  draft = layouts;
};

let nextId = 2;
const patterns = new Map<string, Pattern>([["1", { id: "1", name: "Starter", layouts: starter }]]);

export const savedPatterns = () => [...patterns.values()];
export const patternById = (id: string | undefined) => (id === undefined ? undefined : patterns.get(id));

export const MAX_NAME = 40;

/** saves the current layouts; a name that is taken replaces that pattern */
export const savePattern = (name: string): Pattern => {
  const existing = savedPatterns().find((p) => p.name.toLowerCase() === name.toLowerCase());
  const pattern = { id: existing?.id ?? String(nextId++), name, layouts: draft };
  patterns.set(pattern.id, pattern);
  return pattern;
};

export const deletePattern = (id: string) => patterns.delete(id);
