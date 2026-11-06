/**
 * Grid builder module: the page, one form post per change (/grid/<action>), a saved pattern
 * as a page (/grid/patterns/:id), and the module's styles and browser code.
 *
 * The server decides: the browser only previews whether a drop fits, then posts it, and the
 * server checks it again with the same rules (grid.ts) before saving. A refused change keeps
 * the layout and says why in the status message. Without htmx (no JavaScript) the forms still
 * work and redirect back to the page.
 */

import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, UrlParams } from "effect/http";
import { toHtml } from "tsx-to-html";
import { document } from "../layout.js";
import type { AppModule } from "../module.js";
import { blockById, move, remove, type Result } from "./grid.js";
import { currentLayout, deletePattern, MAX_NAME, patternById, savePattern, setLayout } from "./store.js";
import { assets, blockId, Changed, GridPage, loadId, nav, paletteId, PatternPage } from "./views.js";

interface Outcome {
  readonly message: string;
  /** the element to focus after the swap */
  readonly focus?: string | undefined;
}

type Field = (name: string) => string;

/** a form post that changes something; `run` reads the form and returns what to say */
const action = (run: (field: Field) => Outcome) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;
    const form = yield* request.urlParamsBody;
    const { message, focus } = run((name) => Option.getOrUndefined(UrlParams.getFirst(form, name))?.trim() ?? "");
    if (request.headers["hx-request"] !== "true") return HttpServerResponse.redirect("/grid", { status: 303 });
    return HttpServerResponse.html(toHtml(<Changed message={message} focus={focus} />));
  }).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.text("Bad form", { status: 400 }))));

/** save the layout when the change is allowed; either way, focus the block that was moved */
const commit = (result: Result, focus: string): Outcome => {
  if (result.ok) setLayout(result.layout);
  return { message: result.message, focus };
};

const cellNumber = (value: string) => (/^\d{1,2}$/.test(value) ? Number(value) : Number.NaN);

/** block=<id>, column=<n>, row=<n>: the block's new top-left cell (blocks in the way move down) */
const postMove = action((field) => {
  const id = field("block");
  const column = cellNumber(field("column"));
  const row = cellNumber(field("row"));
  if (!blockById(id) || Number.isNaN(column) || Number.isNaN(row)) return { message: "That move is not valid." };
  return commit(move(currentLayout(), id, { column, row }), blockId(id));
});

/** block=<id>: back to the palette */
const postRemove = action((field) => commit(remove(currentLayout(), field("block")), paletteId(field("block"))));

const postClear = action(() => {
  setLayout([]);
  return { message: "The grid is empty.", focus: "grid-clear" };
});

const postSave = action((field) => {
  const name = field("name").slice(0, MAX_NAME);
  if (!name) return { message: "Give the pattern a name.", focus: "grid-save-name" };
  if (currentLayout().length === 0) return { message: "The grid is empty: place a block first.", focus: "grid-save-name" };
  const pattern = savePattern(name);
  return { message: `Saved “${pattern.name}”.`, focus: loadId(pattern.id) };
});

const postLoad = action((field) => {
  const pattern = patternById(field("id"));
  if (!pattern) return { message: "That pattern no longer exists." };
  setLayout(pattern.layout);
  return { message: `Loaded “${pattern.name}”.`, focus: loadId(pattern.id) };
});

const postDelete = action((field) => {
  const pattern = patternById(field("id"));
  if (!pattern) return { message: "That pattern no longer exists.", focus: "grid-save-name" };
  deletePattern(pattern.id);
  return { message: `Deleted “${pattern.name}”.`, focus: "grid-save-name" };
});

const patternPage = Effect.gen(function* () {
  const { id } = yield* HttpRouter.params;
  const pattern = patternById(id);
  return pattern
    ? document(<PatternPage pattern={pattern} />)
    : HttpServerResponse.text("No such pattern", { status: 404 });
});


export const GridBuilderModule: AppModule = {
  nav,
  routes: Layer.mergeAll(
    // rendered per request: it shows the current layout and the saved patterns
    HttpRouter.add("GET", nav.href, Effect.sync(() => document(<GridPage />))),
    HttpRouter.add("POST", "/grid/move", postMove),
    HttpRouter.add("POST", "/grid/remove", postRemove),
    HttpRouter.add("POST", "/grid/clear", postClear),
    HttpRouter.add("POST", "/grid/save", postSave),
    HttpRouter.add("POST", "/grid/load", postLoad),
    HttpRouter.add("POST", "/grid/delete", postDelete),
    HttpRouter.add("GET", "/grid/patterns/:id", patternPage),
    assets.routes,
  ),
};
