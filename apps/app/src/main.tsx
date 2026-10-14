import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http";
import { CalendarRoutes } from "./calendar/routes.js";
import { CompareRoutes } from "./compare/routes.js";
import { FiltersRoutes } from "./filters/routes.js";
import { HomeRoutes } from "./home/routes.js";
import { RangePickerRoutes } from "./range-picker/routes.js";

const require = createRequire(import.meta.url);

/** scripts and styles: htmx, cally, the app's own, and the design system's bundle */
const Assets = Layer.mergeAll(
  HttpRouter.add(
    "GET",
    "/assets/htmx.js",
    HttpServerResponse.file(require.resolve("htmx.org/dist/htmx.min.js")),
  ),
  HttpRouter.add(
    "GET",
    "/assets/cally.js",
    HttpServerResponse.file(fileURLToPath(import.meta.resolve("cally"))),
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

HttpRouter.serve(
  Layer.mergeAll(HomeRoutes, CalendarRoutes, CompareRoutes, RangePickerRoutes, FiltersRoutes, Assets),
).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: Number(process.env.PORT ?? 3000) })),
  Layer.launch,
  NodeRuntime.runMain,
);
