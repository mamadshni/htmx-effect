/**
 * Export module: the page, the CSV (GET /export/orders.csv, created while it is sent) and the
 * page's styles and browser code. No state between requests: any server behind a load
 * balancer can answer each of them.
 */

import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { pageRoute } from "../layout.js";
import type { AppModule } from "../module.js";
import { fileName, ordersCsv } from "./csv.js";
import { assets, ExportPage, nav } from "./views.js";

const csv = ordersCsv.pipe(
  Effect.map((body) =>
    HttpServerResponse.stream(body, {
      contentType: "text/csv; charset=utf-8",
      headers: { "content-disposition": `attachment; filename="${fileName}"` },
    }),
  ),
  Effect.catch(() => Effect.succeed(HttpServerResponse.text("Creating the CSV file failed", { status: 500 }))),
);


export const ExportModule: AppModule = {
  nav,
  routes: Layer.mergeAll(
    pageRoute(nav.href, () => <ExportPage />),
    HttpRouter.add("GET", "/export/orders.csv", csv),
    assets.routes,
  ),
};
