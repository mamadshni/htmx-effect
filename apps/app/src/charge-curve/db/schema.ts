/**
 * The charging database's tables, as Effect schemas: what the JSON file must look like. The
 * database is decoded with them on every read, so a broken file fails as a DbError instead of
 * reaching the pages.
 *
 * Timestamps are ISO 8601 instants in UTC ("2026-11-16T07:30:00.000Z"); a station's time zone
 * says how to show them. Energy (kwh) in a reading is the meter count since the session began.
 */

import { Schema } from "effect";

/** "2026-11-16T07:30:00.000Z": UTC, so the strings sort in time order */
const Instant = Schema.String.pipe(
  Schema.check(Schema.isPattern(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z$/, { title: "UTC ISO instant" })),
);

const NonNegative = Schema.Finite.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)));

export const Station = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** IANA time zone the station's times are shown in */
  timeZone: Schema.String,
  /** what the wallbox can deliver */
  maxKw: NonNegative,
});
export type Station = typeof Station.Type;

export const Session = Schema.Struct({
  id: Schema.String,
  stationId: Schema.String,
  vehicle: Schema.String,
  /** usable battery capacity */
  batteryKwh: NonNegative,
  /** what the car's on-board charger takes at most */
  vehicleMaxKw: NonNegative,
  /** state of charge when plugged in, and where charging stops (0–1) */
  startSoc: NonNegative,
  targetSoc: NonNegative,
  startedAt: Instant,
  endedAt: Schema.NullOr(Instant),
  status: Schema.Literals(["charging", "finished"]),
});
export type Session = typeof Session.Type;

/** a meter reading: the wallbox sends them at irregular times (seconds to 20 minutes apart) */
export const Reading = Schema.Struct({
  sessionId: Schema.String,
  at: Instant,
  kw: NonNegative,
  kwh: NonNegative,
});
export type Reading = typeof Reading.Type;

export const Database = Schema.Struct({
  stations: Schema.Array(Station),
  sessions: Schema.Array(Session),
  readings: Schema.Array(Reading),
});
export type Database = typeof Database.Type;

/** the file's text → the database (JSON parse + decode in one step) */
export const DatabaseFromJson = Schema.fromJsonString(Database);

/** the database as JSON text, one row per line (readable, and small diffs) */
export const formatDatabase = (db: Database) => {
  const table = (rows: ReadonlyArray<unknown>) =>
    rows.length === 0 ? "[]" : `[\n  ${rows.map((row) => JSON.stringify(row)).join(",\n  ")}\n ]`;
  return `{\n "stations": ${table(db.stations)},\n "sessions": ${table(db.sessions)},\n "readings": ${table(db.readings)}\n}\n`;
};
