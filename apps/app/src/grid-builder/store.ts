/**
 * The layout being edited and the saved patterns. They live in the server's memory: they
 * survive reloads, not restarts, and are shared by everyone (a real app would keep them per
 * user, e.g. in a database row with the layout as JSON).
 */

import type { Layout } from "./grid.js";

export interface Pattern {
  readonly id: string;
  readonly name: string;
  readonly layout: Layout;
}

const starter: Layout = [
  { block: "header", column: 1, row: 1 },
  { block: "sidebar", column: 1, row: 2 },
  { block: "chart", column: 4, row: 2 },
  { block: "kpi-1", column: 10, row: 2 },
  { block: "table", column: 4, row: 5 },
  { block: "footer", column: 1, row: 8 },
];

let draft: Layout = starter;

export const currentLayout = () => draft;
export const setLayout = (layout: Layout) => {
  draft = layout;
};

let nextId = 2;
const patterns = new Map<string, Pattern>([["1", { id: "1", name: "Starter", layout: starter }]]);

export const savedPatterns = () => [...patterns.values()];
export const patternById = (id: string | undefined) => (id === undefined ? undefined : patterns.get(id));

export const MAX_NAME = 40;

/** saves the current layout; a name that is taken replaces that pattern */
export const savePattern = (name: string): Pattern => {
  const existing = savedPatterns().find((p) => p.name.toLowerCase() === name.toLowerCase());
  const pattern = { id: existing?.id ?? String(nextId++), name, layout: draft };
  patterns.set(pattern.id, pattern);
  return pattern;
};

export const deletePattern = (id: string) => patterns.delete(id);
