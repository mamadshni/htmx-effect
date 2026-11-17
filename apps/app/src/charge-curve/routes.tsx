/**
 * Graph module routes. Every handler reads the charging database through the ChargingDb service;
 * the module provides it (one instance for all requests and the charger simulator) and maps its
 * typed errors to responses: a missing session is a 404 page, a database failure a 500.
 *
 * GET  /graph                              the sessions
 * POST /graph/sessions                     plug a car in (form), then redirect to its page
 * GET  /graph/sessions/:id                 a session's detail page
 * GET  /graph/sessions/:id/readings?after  the readings after an instant, as out-of-band swaps
 * GET  /graph/compare?session&curve&points&gaps  one session's chart, drawn the way the selects say
 */

import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import { document } from "../layout.js";
import type { AppModule } from "../module.js";
import { ChargerSimulator } from "./db/charger.js";
import { ChargingDb, type DbError } from "./db/ChargingDb.js";
import { isCurveName } from "./draw.js";
import {
  assets,
  ComparePage,
  compareHref,
  nav,
  ReadingsUpdate,
  SessionPage,
  SessionsPage,
  sessionHref,
  vehicles,
} from "./views.js";

const HTML = "text/html; charset=utf-8";

/** what a page shows when the database fails: logged with its cause, a plain 500 for the user */
const databaseDown = (error: DbError) =>
  Effect.logError("charging database", error.message, error.cause).pipe(
    Effect.as(HttpServerResponse.text("The charging database is not available right now.", { status: 500 })),
  );

const notFound = HttpServerResponse.text("No such charging session.", { status: 404 });

const sessionsPage = Effect.gen(function* () {
  const db = yield* ChargingDb;
  const [sessions, stations] = yield* Effect.all([db.sessions, db.stations], { concurrency: "unbounded" });
  return document(<SessionsPage sessions={sessions} stations={stations} />);
}).pipe(Effect.catchTag("DbError", databaseDown));

const sessionPage = Effect.gen(function* () {
  const { id = "" } = yield* HttpRouter.params;
  const db = yield* ChargingDb;
  const view = yield* db.session(id);
  const readings = yield* db.readings(id);
  return document(<SessionPage view={view} readings={readings} />);
}).pipe(Effect.catchTags({ SessionNotFound: () => Effect.succeed(notFound), DbError: databaseDown }));

/** session (default: the newest finished one), curve (default linear), points ("on" or empty), gaps ("solid" or empty) */
const comparePage = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const params = new URL(request.url, "http://localhost").searchParams;
  const db = yield* ChargingDb;
  const sessions = yield* db.sessions;
  const id = params.get("session") ?? sessions.find((s) => s.session.status === "finished")?.session.id ?? "";
  const view = yield* db.session(id);
  const readings = yield* db.readings(id);
  const curve = params.get("curve");
  return document(
    <ComparePage
      sessions={sessions}
      view={view}
      readings={readings}
      curve={isCurveName(curve) ? curve : "linear"}
      points={params.get("points") === "on"}
      gaps={params.get("gaps") === "solid" ? "solid" : "dashed"}
    />,
  );
}).pipe(Effect.catchTags({ SessionNotFound: () => Effect.succeed(notFound), DbError: databaseDown }));

const readingsPoll = Effect.gen(function* () {
  const { id = "" } = yield* HttpRouter.params;
  const request = yield* HttpServerRequest.HttpServerRequest;
  const after = new URL(request.url, "http://localhost").searchParams.get("after") ?? "";
  const db = yield* ChargingDb;
  const view = yield* db.session(id);
  const fresh = yield* db.readings(id, after || undefined);
  // the last answer replaces the chart, with every reading
  const all = view.session.status === "finished" ? yield* db.readings(id) : [];
  return HttpServerResponse.text(toHtml(<ReadingsUpdate view={view} fresh={fresh} all={all} after={after} />), {
    contentType: HTML,
  });
}).pipe(Effect.catchTags({ SessionNotFound: () => Effect.succeed(notFound), DbError: databaseDown }));

/** the start form: percentages in, shares (0–1) stored */
const StartForm = Schema.Struct({
  station: Schema.String,
  vehicle: Schema.Literals(vehicles.map((v) => v.id)),
  startSoc: Schema.FiniteFromString.pipe(Schema.check(Schema.isBetween({ minimum: 0, maximum: 95 }))),
  targetSoc: Schema.FiniteFromString.pipe(Schema.check(Schema.isBetween({ minimum: 10, maximum: 100 }))),
});

const startSession = Effect.gen(function* () {
  const form = yield* HttpServerRequest.schemaBodyUrlParams(StartForm);
  if (form.targetSoc <= form.startSoc) {
    return HttpServerResponse.text("The target must be above the current charge.", { status: 400 });
  }
  const vehicle = vehicles.find((v) => v.id === form.vehicle)!;
  const db = yield* ChargingDb;
  const session = yield* db.startSession({
    stationId: form.station,
    vehicle: vehicle.name,
    batteryKwh: vehicle.batteryKwh,
    vehicleMaxKw: vehicle.vehicleMaxKw,
    startSoc: form.startSoc / 100,
    targetSoc: form.targetSoc / 100,
  });
  return HttpServerResponse.redirect(sessionHref(session.id), { status: 303 });
}).pipe(
  Effect.catchTags({
    StationNotFound: () => Effect.succeed(HttpServerResponse.text("No such wallbox.", { status: 400 })),
    DbError: databaseDown,
  }),
  Effect.catch(() => Effect.succeed(HttpServerResponse.text("Bad form", { status: 400 }))),
);

/** the database: one instance, shared by the routes and the charger */
const Database = ChargingDb.layer.pipe(Layer.provide(NodeFileSystem.layer));

const routes = Layer.unwrap(
  Effect.gen(function* () {
    const db = yield* ChargingDb;
    return Layer.mergeAll(
      HttpRouter.add("GET", nav.href, sessionsPage),
      HttpRouter.add("POST", "/graph/sessions", startSession),
      HttpRouter.add("GET", "/graph/sessions/:id", sessionPage),
      HttpRouter.add("GET", "/graph/sessions/:id/readings", readingsPoll),
      HttpRouter.add("GET", compareHref, comparePage),
    ).pipe(HttpRouter.provideRequest(Layer.succeed(ChargingDb, db)));
  }),
);

export const ChargeCurveModule: AppModule = {
  nav,
  routes: Layer.mergeAll(routes, ChargerSimulator(), assets.routes).pipe(
    Layer.provide(Database),
    // the app cannot run without its database: a broken file stops it at start, with the reason
    Layer.orDie,
  ),
};
