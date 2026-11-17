/**
 * Graph module: the page, the live example's poll (GET /graph/live?start=<epoch ms>) and a new
 * live card (GET /graph/live-card). Stateless: the live session's start travels in the URL.
 */

import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import { document } from "../layout.js";
import type { AppModule } from "../module.js";
import { liveElapsed, SESSION_MINUTES } from "./data.js";
import { assets, GraphPage, LiveCard, LiveUpdate, nav } from "./views.js";

const HTML = "text/html; charset=utf-8";

/** htmx stops polling when the response status is 286 */
const STOP_POLLING = 286;

const livePoll = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const start = Number(new URL(request.url, "http://localhost").searchParams.get("start"));
  if (!Number.isFinite(start) || start <= 0) return HttpServerResponse.text("Bad start", { status: 400 });
  const elapsed = liveElapsed(start);
  return HttpServerResponse.text(toHtml(<LiveUpdate elapsed={elapsed} />), {
    contentType: HTML,
    status: elapsed >= SESSION_MINUTES ? STOP_POLLING : 200,
  });
});

export const ChargeCurveModule: AppModule = {
  nav,
  routes: Layer.mergeAll(
    // rendered per request: the live session starts when the page is opened
    HttpRouter.add("GET", nav.href, Effect.sync(() => document(<GraphPage liveStart={Date.now()} />))),
    HttpRouter.add("GET", "/graph/live", livePoll),
    HttpRouter.add(
      "GET",
      "/graph/live-card",
      Effect.sync(() => HttpServerResponse.text(toHtml(<LiveCard start={Date.now()} />), { contentType: HTML })),
    ),
    assets.routes,
  ),
};
