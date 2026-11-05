/**
 * Export module: the page, the CSV (GET /export/orders.csv, created while it is sent) and the
 * page's browser code bundled on request. No state between requests: any server behind a load
 * balancer can answer each of them.
 */

import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { build } from "esbuild";
import { pageRoute } from "../layout.js";
import { fileName, ordersCsv } from "./csv.js";
import { ExportPage } from "./views.js";

const csv = ordersCsv.pipe(
  Effect.map((body) =>
    HttpServerResponse.stream(body, {
      contentType: "text/csv; charset=utf-8",
      headers: { "content-disposition": `attachment; filename="${fileName}"` },
    }),
  ),
  Effect.catch(() => Effect.succeed(HttpServerResponse.text("Creating the CSV file failed", { status: 500 }))),
);

const entry = fileURLToPath(new URL("./client/export.ts", import.meta.url));

/** bundled per request, so edits show up on reload (fast enough for a playground) */
const bundle = Effect.promise(() =>
  build({ entryPoints: [entry], bundle: true, format: "esm", target: "es2022", write: false }),
).pipe(
  Effect.map((result) =>
    HttpServerResponse.text(result.outputFiles[0]?.text ?? "", { contentType: "text/javascript; charset=utf-8" }),
  ),
);

export const ExportRoutes = Layer.mergeAll(
  pageRoute("/export", <ExportPage />),
  HttpRouter.add("GET", "/export/orders.csv", csv),
  HttpRouter.add("GET", "/assets/export.js", bundle),
);
