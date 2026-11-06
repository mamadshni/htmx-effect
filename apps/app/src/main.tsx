import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Layer } from "effect";
import { HttpRouter, HttpServerResponse, HttpStaticServer } from "effect/http";
import { CalendarModule } from "./calendar/routes.js";
import { CompareModule } from "./compare/routes.js";
import { ExportModule } from "./export/routes.js";
import { FiltersModule } from "./filters/routes.js";
import { GridBuilderModule } from "./grid-builder/routes.js";
import { HomeModule } from "./home/routes.js";
import { setNavigation } from "./layout.js";
import type { AppModule } from "./module.js";
import { RangePickerModule } from "./range-picker/routes.js";

const require = createRequire(import.meta.url);

/**
 * The app's modules, in navigation order. Each one is a folder under src/ that serves its own
 * pages, styles and scripts: adding or removing a module is its folder and its line here.
 */
const modules: ReadonlyArray<AppModule> = [
  HomeModule,
  CalendarModule,
  CompareModule,
  RangePickerModule,
  FiltersModule,
  ExportModule,
  GridBuilderModule,
];

/** what every page loads (see layout.tsx): htmx, the shared styles, the design system's bundle */
const SharedAssets = Layer.mergeAll(
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

setNavigation(modules.flatMap((m) => (m.nav ? [m.nav] : [])));

HttpRouter.serve(Layer.mergeAll(SharedAssets, ...modules.map((m) => m.routes))).pipe(
  Layer.provide(NodeHttpServer.layer(createServer, { port: Number(process.env.PORT ?? 3000) })),
  Layer.launch,
  NodeRuntime.runMain,
);
