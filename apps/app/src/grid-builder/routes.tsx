/**
 * Grid builder module: the page, one form post per change (/grid/<action>), a saved pattern
 * as a page (/grid/patterns/:id), and the module's styles and browser code.
 *
 * The server decides: the browser previews a drop or a resize with the same rules (grid.ts),
 * then posts it, and the server applies it again before saving. Moves and resizes name the
 * layout they change (view=wide|narrow). A refused change keeps the layouts and says why in
 * the status message. Without htmx (no JavaScript) the forms still work and redirect back.
 */

import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, UrlParams } from "effect/http";
import { toHtml } from "tsx-to-html";
import { document } from "../layout.js";
import { type AppModule, fileRoute } from "../module.js";
import { blockById, columnsOf, emptyLayouts, isView, type LayoutsResult, parseLayout, placeIn, removeFrom, replaceIn, resizeIn } from "./grid.js";
import { currentLayouts, deletePattern, MAX_NAME, patternById, savePattern, setLayouts } from "./store.js";
import { assets, blockId, Changed, flowStylesPath, GridPage, loadId, nav, paletteId, PatternPage } from "./views.js";

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

/** save the layouts when the change is allowed; either way, focus the block that changed */
const commit = (result: LayoutsResult, focus: string): Outcome => {
  if (result.ok) setLayouts(result.layouts);
  return { message: result.message, focus };
};

const smallNumber = (value: string) => (/^\d{1,2}$/.test(value) ? Number(value) : Number.NaN);

/** view=<wide|narrow>, block=<id>, column=<n>, row=<n>: the block's new top-left cell (blocks in the way move down) */
const postMove = action((field) => {
  const view = field("view");
  const id = field("block");
  const column = smallNumber(field("column"));
  const row = smallNumber(field("row"));
  if (!isView(view) || !blockById(id) || Number.isNaN(column) || Number.isNaN(row)) return { message: "That move is not valid." };
  return commit(placeIn(currentLayouts(), view, id, { column, row }), blockId(view, id));
});

/** view=<wide|narrow>, block=<id>, width=<n>: how many columns it spans (blocks it now covers move down) */
const postResize = action((field) => {
  const view = field("view");
  const id = field("block");
  const width = smallNumber(field("width"));
  if (!isView(view) || !blockById(id) || Number.isNaN(width)) return { message: "That size is not valid." };
  return commit(resizeIn(currentLayouts(), view, id, width), blockId(view, id));
});

/** view=<wide|narrow>, layout=<JSON placements>: one layout as a whole (the result of a Tetris game, client/tetris.ts) */
const postReplace = action((field) => {
  const view = field("view");
  if (!isView(view)) return { message: "That layout is not valid." };
  let value: unknown;
  try {
    value = JSON.parse(field("layout"));
  } catch {
    return { message: "That layout is not valid." };
  }
  // checked like a stored layout: unknown or repeated blocks dropped, everything inside, no overlaps
  const layout = parseLayout(value, columnsOf(view));
  const first = layout[0];
  return commit(replaceIn(currentLayouts(), view, layout), first ? blockId(view, first.block) : "grid-clear");
});

/** block=<id>: back to the palette (out of both layouts) */
const postRemove = action((field) => commit(removeFrom(currentLayouts(), field("block")), paletteId(field("block"))));

const postClear = action(() => {
  setLayouts(emptyLayouts);
  return { message: "The grid is empty.", focus: "grid-clear" };
});

const postSave = action((field) => {
  const name = field("name").slice(0, MAX_NAME);
  if (!name) return { message: "Give the pattern a name.", focus: "grid-save-name" };
  if (currentLayouts().wide.length === 0) return { message: "The grid is empty: place a block first.", focus: "grid-save-name" };
  const pattern = savePattern(name);
  return { message: `Saved “${pattern.name}”.`, focus: loadId(pattern.id) };
});

const postLoad = action((field) => {
  const pattern = patternById(field("id"));
  if (!pattern) return { message: "That pattern no longer exists." };
  setLayouts(pattern.layouts);
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
    HttpRouter.add("POST", "/grid/resize", postResize),
    HttpRouter.add("POST", "/grid/replace", postReplace),
    HttpRouter.add("POST", "/grid/remove", postRemove),
    HttpRouter.add("POST", "/grid/clear", postClear),
    HttpRouter.add("POST", "/grid/save", postSave),
    HttpRouter.add("POST", "/grid/load", postLoad),
    HttpRouter.add("POST", "/grid/delete", postDelete),
    HttpRouter.add("GET", "/grid/patterns/:id", patternPage),
    assets.routes,
    fileRoute(flowStylesPath, new URL("./client/grid-flow.css", import.meta.url), "text/css; charset=utf-8"),
  ),
};
