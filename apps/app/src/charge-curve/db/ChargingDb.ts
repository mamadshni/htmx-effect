/**
 * ChargingDb: the charging database as an Effect service. A stand-in for a real database: a
 * JSON file (.data/charging.json, made from the seed charging.json on the first start) that
 * every query reads and decodes, and that writes replace atomically (write a temporary file,
 * rename it over the old one), so a reader never sees half a write.
 *
 * Writes go one at a time (a semaphore); reads do not wait for them. Failures are typed:
 * DbError (the file cannot be read, written or decoded), SessionNotFound, StationNotFound.
 */

import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Context, Data, Effect, FileSystem, Layer, Schema, Semaphore } from "effect";
import { type Database, DatabaseFromJson, formatDatabase, type Reading, type Session, type Station } from "./schema.js";

export class DbError extends Data.TaggedError("DbError")<{ readonly message: string; readonly cause?: unknown }> {}
export class SessionNotFound extends Data.TaggedError("SessionNotFound")<{ readonly id: string }> {}
export class StationNotFound extends Data.TaggedError("StationNotFound")<{ readonly id: string }> {}

/** a session with its station and the figures a list or a header shows */
export interface SessionView {
  readonly session: Session;
  readonly station: Station;
  readonly energyKwh: number;
  readonly peakKw: number;
  /** the newest reading's time (null before the first one) */
  readonly lastReadingAt: string | null;
}

export interface NewSession {
  readonly stationId: string;
  readonly vehicle: string;
  readonly batteryKwh: number;
  readonly vehicleMaxKw: number;
  readonly startSoc: number;
  readonly targetSoc: number;
}

export class ChargingDb extends Context.Service<
  ChargingDb,
  {
    readonly stations: Effect.Effect<ReadonlyArray<Station>, DbError>;
    /** every session, newest first */
    readonly sessions: Effect.Effect<ReadonlyArray<SessionView>, DbError>;
    readonly session: (id: string) => Effect.Effect<SessionView, DbError | SessionNotFound>;
    /** a session's readings in time order; with `after`, only the ones after that instant */
    readonly readings: (sessionId: string, after?: string) => Effect.Effect<ReadonlyArray<Reading>, DbError>;
    /** the sessions still charging, with their newest reading (for the charger) */
    readonly charging: Effect.Effect<
      ReadonlyArray<{ readonly session: Session; readonly station: Station; readonly last: Reading | undefined }>,
      DbError
    >;
    /** plug a car in: a new session that starts now (to the minute) */
    readonly startSession: (input: NewSession) => Effect.Effect<Session, DbError | StationNotFound>;
    /** store a meter reading; `finished` ends the session at the reading's time */
    readonly recordReading: (reading: Reading, finished: boolean) => Effect.Effect<void, DbError>;
  }
>()("app/ChargingDb") {
  /** the working copy; delete it to start over from the seed */
  static readonly file = fileURLToPath(new URL("../../../.data/charging.json", import.meta.url));
  static readonly seed = fileURLToPath(new URL("./charging.json", import.meta.url));

  static readonly layer = Layer.effect(
    ChargingDb,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const file = ChargingDb.file;
      const failed = (message: string) => (cause: unknown) => new DbError({ message, cause });

      if (!(yield* fs.exists(file).pipe(Effect.mapError(failed("checking the database file failed"))))) {
        yield* Effect.tryPromise({
          try: () => mkdir(dirname(file), { recursive: true }),
          catch: failed("creating the data folder failed"),
        });
        yield* fs.copyFile(ChargingDb.seed, file).pipe(Effect.mapError(failed("copying the seed database failed")));
      }

      const read: Effect.Effect<Database, DbError> = fs.readFileString(file).pipe(
        Effect.mapError(failed("reading the database failed")),
        Effect.flatMap((text) =>
          Schema.decodeUnknownEffect(DatabaseFromJson)(text).pipe(Effect.mapError(failed("the database is invalid"))),
        ),
      );

      const lock = yield* Semaphore.make(1);
      /** read, change, write back: one write at a time, replacing the file atomically */
      const write = <A, E>(change: (db: Database) => Effect.Effect<readonly [A, Database], E>) =>
        lock.withPermit(
          Effect.gen(function* () {
            const [result, next] = yield* change(yield* read);
            const temporary = `${file}.tmp`;
            yield* fs.writeFileString(temporary, formatDatabase(next)).pipe(Effect.mapError(failed("writing the database failed")));
            yield* fs.rename(temporary, file).pipe(Effect.mapError(failed("writing the database failed")));
            return result;
          }),
        );

      const view = (db: Database, session: Session): SessionView | undefined => {
        const station = db.stations.find((s) => s.id === session.stationId);
        if (!station) return undefined;
        const readings = db.readings.filter((r) => r.sessionId === session.id);
        return {
          session,
          station,
          energyKwh: readings.at(-1)?.kwh ?? 0,
          peakKw: Math.max(0, ...readings.map((r) => r.kw)),
          lastReadingAt: readings.at(-1)?.at ?? null,
        };
      };

      const byTime = (a: Reading, b: Reading) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0);

      return ChargingDb.of({
        stations: read.pipe(Effect.map((db) => db.stations)),

        sessions: read.pipe(
          Effect.map((db) =>
            [...db.sessions]
              .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))
              .flatMap((s) => view(db, s) ?? []),
          ),
        ),

        session: (id) =>
          read.pipe(
            Effect.flatMap((db) => {
              const session = db.sessions.find((s) => s.id === id);
              const found = session && view(db, session);
              return found ? Effect.succeed(found) : Effect.fail(new SessionNotFound({ id }));
            }),
          ),

        readings: (sessionId, after) =>
          read.pipe(
            Effect.map((db) =>
              db.readings.filter((r) => r.sessionId === sessionId && (after === undefined || r.at > after)).sort(byTime),
            ),
          ),

        charging: read.pipe(
          Effect.map((db) =>
            db.sessions
              .filter((s) => s.status === "charging")
              .flatMap((session) => {
                const station = db.stations.find((s) => s.id === session.stationId);
                if (!station) return [];
                const last = db.readings.filter((r) => r.sessionId === session.id).sort(byTime).at(-1);
                return [{ session, station, last }];
              }),
          ),
        ),

        startSession: (input) =>
          write((db) => {
            if (!db.stations.some((s) => s.id === input.stationId)) {
              return Effect.fail(new StationNotFound({ id: input.stationId }));
            }
            const minute = Math.floor(Date.now() / 60_000) * 60_000;
            const number = Math.max(1000, ...db.sessions.map((s) => Number(s.id.replace(/\D/g, "")) || 0)) + 1;
            const session: Session = {
              id: `s-${number}`,
              ...input,
              startedAt: new Date(minute).toISOString(),
              endedAt: null,
              status: "charging",
            };
            return Effect.succeed([session, { ...db, sessions: [...db.sessions, session] }] as const);
          }),

        recordReading: (reading, finished) =>
          write((db) =>
            Effect.succeed([
              undefined,
              {
                ...db,
                readings: [...db.readings, reading],
                sessions: finished
                  ? db.sessions.map((s) =>
                      s.id === reading.sessionId ? { ...s, endedAt: reading.at, status: "finished" as const } : s,
                    )
                  : db.sessions,
              },
            ] as const),
          ),
      });
    }),
  );
}
