import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http";
import { toHtml } from "tsx-to-html";
import { Page, SearchOptions } from "./views.js";

const require = createRequire(import.meta.url);

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

const Routes = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/",
    HttpServerResponse.html(
      `<!doctype html>${toHtml(<Page items={startingItems} />)}`,
    ),
  ),
  HttpRouter.add("GET", "/search-options", (request) =>
    Effect.sync(() => {
      const q = (new URL(request.url, "http://localhost").searchParams.get("q") ?? "")
        .trim()
        .toLowerCase();
      const items = q
        ? fruits.filter((f) => f.toLowerCase().includes(q))
        : startingItems;
      const selected = items.find((f) => f.toLowerCase() === q);
      return HttpServerResponse.html(
        toHtml(<SearchOptions items={items} selected={selected} />),
      );
    }),
  ),
  HttpRouter.add(
    "GET",
    "/assets/htmx.js",
    HttpServerResponse.file(require.resolve("htmx.org/dist/htmx.min.js")),
  ),
  HttpStaticServer.layer({
    root: fileURLToPath(new URL("../public", import.meta.url)),
    prefix: "/assets/app",
    cacheControl: "no-cache",
  }),
  HttpStaticServer.layer({
    root: dirname(require.resolve("@combo/design-system/bundle/index.js")),
    prefix: "/assets/design-system",
    cacheControl: "no-cache",
  }),
);

HttpRouter.serve(Routes).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: Number(process.env.PORT ?? 3000) })),
  Layer.launch,
  NodeRuntime.runMain,
);
