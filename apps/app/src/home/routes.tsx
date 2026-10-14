/** Home module: the overview page and the combobox's server-rendered options. */

import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import { pageRoute } from "../layout.js";
import { Page, SearchOptions } from "./views.js";

const fruits = [
  "Apple",
  "Apricot",
  "Banana",
  "Blueberry",
  "Cherry",
  "Grape",
  "Lemon",
  "Mango",
  "Orange",
  "Peach",
  "Pear",
  "Strawberry",
];

const startingItems = fruits.slice(0, 5);

export const HomeRoutes = Layer.mergeAll(
  pageRoute("/", <Page items={startingItems} />),
  HttpRouter.add("GET", "/search-options", (request) =>
    Effect.sync(() => {
      const q = (new URL(request.url, "http://localhost").searchParams.get("q") ?? "")
        .trim()
        .toLowerCase();
      const items = q ? fruits.filter((f) => f.toLowerCase().includes(q)) : startingItems;
      const selected = items.find((f) => f.toLowerCase() === q);
      return HttpServerResponse.html(toHtml(<SearchOptions items={items} selected={selected} />));
    }),
  ),
);
