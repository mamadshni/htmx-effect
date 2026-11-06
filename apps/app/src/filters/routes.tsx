/**
 * Filters module: the page, and each example's form post (/filters/<variant>). A form sends
 * the selection (`filter`: the checked checkboxes, or the chips' hidden inputs) and what
 * changed: `toggle` (a menu item) or `remove` (a chip's ×). The server saves the new
 * selection and answers htmx with the pieces it changed (out-of-band swaps, see views.tsx),
 * or a plain post with a redirect back to the example.
 */

import { Effect, Layer, Option } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse, UrlParams } from "effect/http";
import { toHtml } from "tsx-to-html";
import { document } from "../layout.js";
import type { AppModule } from "../module.js";
import { chipId, ChipsChanged, removeId } from "./chips.js";
import { activeFilters, editedFields, fieldById, isVariant, removeField, saveField, saveFilters, type Variant } from "./store.js";
import { assets, Changed, FiltersPage, nav } from "./views.js";

/**
 * After a chip's × removed its filter, that button is gone: focus the next chip's × (or the
 * previous one), else the chip list. htmx focuses the element marked autofocus.
 */
const focusAfterRemoving = (v: Variant, id: string, before: ReadonlyArray<string>) => {
  const after = activeFilters(v).map((f) => f.id);
  const index = before.indexOf(id);
  const next = after[index] ?? after[index - 1];
  return next ? `${v}-remove-${next}` : `${v}-active-filters`;
};

const post = Effect.gen(function* () {
  const { variant } = yield* HttpRouter.params;
  if (!isVariant(variant)) return HttpServerResponse.text("Unknown example", { status: 404 });
  const request = yield* HttpServerRequest.HttpServerRequest;
  const form = yield* request.urlParamsBody;
  const field = (name: string) => Option.getOrUndefined(UrlParams.getFirst(form, name));
  const toggle = field("toggle");
  const remove = field("remove");

  let selection = UrlParams.getAll(form, "filter").filter((id) => id !== remove);
  if (toggle) selection = selection.includes(toggle) ? selection.filter((id) => id !== toggle) : [...selection, toggle];

  // keep the order filters were added in: the saved ones first, new ones after
  const before = activeFilters(variant).map((f) => f.id);
  saveFilters(variant, [...before.filter((id) => selection.includes(id)), ...selection.filter((id) => !before.includes(id))]);

  // no htmx (no JavaScript): back to the example, which shows the saved filters
  if (request.headers["hx-request"] !== "true") return HttpServerResponse.redirect(`/filters#${variant}`, { status: 303 });
  const focus = remove !== undefined ? focusAfterRemoving(variant, remove, before) : undefined;
  return HttpServerResponse.html(toHtml(<Changed v={variant} focus={focus} />));
}).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.text("Bad form", { status: 400 }))));

/**
 * C: one filter's editor (field=<id>, value=…) or a chip's × (remove=<id>). Values that are
 * not options are refused with a status message; no value removes the filter.
 */
const postChips = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const form = yield* request.urlParamsBody;
  const remove = fieldById(Option.getOrUndefined(UrlParams.getFirst(form, "remove")));
  const field = remove ?? fieldById(Option.getOrUndefined(UrlParams.getFirst(form, "field")));
  if (!field) return HttpServerResponse.text("Unknown filter", { status: 400 });

  const before = editedFields().map((e) => e.field);
  const message = remove ? (removeField(remove), undefined) : saveField(field, UrlParams.getAll(form, "value"));

  if (request.headers["hx-request"] !== "true") return HttpServerResponse.redirect("/filters#chips", { status: 303 });
  // focus: after ×, the next chip's × (as in A and B); else the chip (gone: + Add filter)
  const after = editedFields().map((e) => e.field);
  const index = before.indexOf(field);
  const next = after[index] ?? after[index - 1];
  const focus = remove
    ? next
      ? removeId(next)
      : "chips-active-filters"
    : after.includes(field)
      ? chipId(field)
      : "chips-add";
  return HttpServerResponse.html(toHtml(<ChipsChanged message={message} focus={focus} />));
}).pipe(Effect.catch(() => Effect.succeed(HttpServerResponse.text("Bad form", { status: 400 }))));

export const FiltersModule: AppModule = {
  nav,
  routes: Layer.mergeAll(
    // rendered per request: it shows the saved filters
    HttpRouter.add("GET", nav.href, Effect.sync(() => document(<FiltersPage />))),
    HttpRouter.add("POST", "/filters/chips", postChips),
    HttpRouter.add("POST", "/filters/:variant", post),
    assets.routes,
  ),
};
