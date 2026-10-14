/**
 * The filters and the tasks they apply to, and the saved selections (one per example on the
 * page). They live in the server's memory: they survive reloads, not restarts, and are shared
 * by everyone (a real app would keep them per user, e.g. in a database row or a session).
 */

export interface Task {
  readonly title: string;
  readonly status: "open" | "done";
  readonly priority: "high" | "normal";
  readonly assignee: string | null;
  readonly kind: "bug" | "feature";
  readonly due: string | null;
}

export interface Filter {
  readonly id: string;
  readonly label: string;
  readonly matches: (task: Task) => boolean;
}

export const filters: ReadonlyArray<Filter> = [
  { id: "open", label: "Open", matches: (t) => t.status === "open" },
  { id: "mine", label: "Assigned to me", matches: (t) => t.assignee === "me" },
  { id: "unassigned", label: "Unassigned", matches: (t) => t.assignee === null },
  { id: "high", label: "High priority", matches: (t) => t.priority === "high" },
  { id: "bug", label: "Bugs", matches: (t) => t.kind === "bug" },
  { id: "feature", label: "Features", matches: (t) => t.kind === "feature" },
  { id: "due", label: "Has a due date", matches: (t) => t.due !== null },
];

export const tasks: ReadonlyArray<Task> = [
  { title: "Login fails on Safari", status: "open", priority: "high", assignee: "me", kind: "bug", due: "2026-10-20" },
  { title: "Dark mode for settings", status: "open", priority: "normal", assignee: null, kind: "feature", due: null },
  { title: "Export to CSV", status: "done", priority: "normal", assignee: "me", kind: "feature", due: "2026-09-30" },
  { title: "Date picker skips a month", status: "open", priority: "high", assignee: "sam", kind: "bug", due: null },
  { title: "Keyboard shortcuts help", status: "open", priority: "normal", assignee: "me", kind: "feature", due: "2026-11-02" },
  { title: "Crash when offline", status: "open", priority: "high", assignee: null, kind: "bug", due: "2026-10-16" },
  { title: "Typo on pricing page", status: "done", priority: "normal", assignee: "sam", kind: "bug", due: null },
  { title: "Bulk edit tasks", status: "open", priority: "normal", assignee: "me", kind: "feature", due: null },
];

/** the two examples on the page, each with its own saved selection */
export const variants = ["checkboxes", "menu"] as const;
export type Variant = (typeof variants)[number];

export const isVariant = (value: string | undefined): value is Variant => variants.includes(value as Variant);

/** the active filters' ids, in the order they were added */
const saved: Record<Variant, Set<string>> = { checkboxes: new Set(["open"]), menu: new Set(["open"]) };

export const filterById = (id: string | undefined) => filters.find((f) => f.id === id);

export const activeFilters = (variant: Variant) =>
  [...saved[variant]].map(filterById).filter((f): f is Filter => f !== undefined);

export const isActive = (variant: Variant, id: string) => saved[variant].has(id);

/** save a selection (unknown ids are dropped) */
export const saveFilters = (variant: Variant, ids: ReadonlyArray<string>) => {
  saved[variant].clear();
  for (const id of ids) if (filterById(id)) saved[variant].add(id);
};

/** the tasks that match every active filter */
export const visibleTasks = (variant: Variant) => {
  const applied = activeFilters(variant);
  return tasks.filter((task) => applied.every((filter) => filter.matches(task)));
};
