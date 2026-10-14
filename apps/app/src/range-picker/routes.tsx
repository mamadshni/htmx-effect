/** Range picker module: the page, and its browser code bundled on request (cally and Temporal included). */

import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { build } from "esbuild";
import { pageRoute } from "../layout.js";
import { RangePickerPage } from "./page.js";

const entry = fileURLToPath(new URL("./client/range-picker.ts", import.meta.url));

/** bundled per request, so edits show up on reload (fast enough for a playground) */
const bundle = Effect.promise(() =>
  build({ entryPoints: [entry], bundle: true, format: "esm", target: "es2022", write: false }),
).pipe(
  Effect.map((result) =>
    HttpServerResponse.text(result.outputFiles[0]?.text ?? "", { contentType: "text/javascript; charset=utf-8" }),
  ),
);

export const RangePickerRoutes = Layer.mergeAll(
  pageRoute("/range-picker", <RangePickerPage />),
  HttpRouter.add("GET", "/assets/range-picker.js", bundle),
);
