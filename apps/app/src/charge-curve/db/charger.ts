/**
 * The charger simulator: stands in for the wallboxes' meters. A background fiber that, for
 * every session still charging, writes the next meter reading to the database (and ends the
 * session when the car is full). The web side only reads; it learns about new readings by
 * querying, like it would with real hardware writing to a real database.
 *
 * Time-lapse: one reading is written every `tick` (1 second by default), however much charging
 * time it covers (10 seconds to 20 minutes, see model.ts), so a session plays in a minute or two.
 * Its timestamps therefore run ahead of the clock.
 */

import { Duration, Effect, Layer, Schedule } from "effect";
import { ChargingDb } from "./ChargingDb.js";
import { nextReading } from "./model.js";

export const ChargerSimulator = (tick: Duration.Input = "1 second") =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      const db = yield* ChargingDb;
      const step = db.charging.pipe(
        Effect.flatMap((running) =>
          Effect.forEach(running, ({ session, station, last }) => {
            const { reading, done } = nextReading(session, station, last);
            return db.recordReading(reading, done);
          }),
        ),
        // a failed write is logged and tried again on the next tick
        Effect.catch((error) => Effect.logWarning("charger: writing a reading failed", error)),
      );
      yield* Effect.forkScoped(step.pipe(Effect.repeat(Schedule.spaced(tick))));
    }),
  );
