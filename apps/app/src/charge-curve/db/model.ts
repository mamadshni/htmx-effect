/**
 * How a car charges, and when the wallbox reports it: what the charger simulator (charger.ts)
 * writes while a session runs, and what the seed script (seed.ts) used for the finished sessions.
 *
 * Charging (AC): the power ramps up over a few minutes to what both the wallbox and the car
 * allow, stays there, and above 90 % state of charge tapers off until the target is reached.
 * It is simulated in steps of 10 seconds; the energy is the integral of the power.
 *
 * Reporting: like a real meter, the wallbox does not send a reading at a fixed rate. It sends
 * one when the power has changed by 0.5 kW or more since the last reading (so often while the
 * power ramps or tapers), and otherwise only when its heartbeat comes due: after 1 to 20
 * minutes, plus a few seconds, chosen at random (dropouts included). Readings therefore come
 * seconds apart in one place and twenty minutes apart in another.
 *
 * The randomness is seeded from the session and the last reading, so the seed file and a
 * simulated session come out the same each time.
 */

import type { Reading, Session, Station } from "./schema.js";

const STEP_SECONDS = 10;
const RAMP_MINUTES = 3;
const TAPER_FROM_SOC = 0.9;
/** the taper never goes below this share of the full power */
const MIN_TAPER = 0.15;
/** charging stops this close to the target (the car rounds to whole percent) */
const TARGET_MARGIN = 0.01;
/** a change in power at least this big is reported at once */
const REPORT_CHANGE_KW = 0.5;
/** minutes until the next heartbeat reading, one picked at random (short ones more often) */
const HEARTBEAT_MINUTES = [1, 1, 2, 2, 3, 5, 5, 8, 12, 20];

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** a number in [0, 1) from a string: the same string always gives the same number */
const random = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  // one mulberry32 step on the hash
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** charging power `seconds` after the start, with `kwh` charged so far */
const powerAt = (session: Session, station: Station, seconds: number, kwh: number) => {
  const soc = session.startSoc + kwh / session.batteryKwh;
  if (seconds <= 0 || soc >= session.targetSoc - TARGET_MARGIN) return 0;
  const full = Math.min(station.maxKw, session.vehicleMaxKw);
  const ramp = Math.min(1, seconds / 60 / RAMP_MINUTES);
  const taper =
    soc < TAPER_FROM_SOC || session.targetSoc <= TAPER_FROM_SOC
      ? 1
      : Math.max(MIN_TAPER, (session.targetSoc - soc) / (session.targetSoc - TAPER_FROM_SOC));
  return full * ramp * taper;
};

/**
 * The next reading the wallbox sends after `last` (or the first one, at the start, when there
 * is none), and whether the session is done with it (the target state of charge is reached).
 */
export const nextReading = (
  session: Session,
  station: Station,
  last: Reading | undefined,
): { readonly reading: Reading; readonly done: boolean } => {
  const startedAt = Date.parse(session.startedAt);
  if (!last) return { reading: { sessionId: session.id, at: session.startedAt, kw: 0, kwh: 0 }, done: false };

  const lastSeconds = Math.round((Date.parse(last.at) - startedAt) / 1000);
  const minutes = HEARTBEAT_MINUTES[Math.floor(random(`${session.id}@${last.at}`) * HEARTBEAT_MINUTES.length)]!;
  const heartbeat = minutes * 60 + Math.floor(random(`${session.id}#${last.at}`) * 50);

  // simulate from the last reading, 10 s at a time, until the wallbox reports
  let seconds = lastSeconds;
  let kwh = last.kwh;
  let kw = powerAt(session, station, seconds, kwh);
  for (;;) {
    const next = seconds + STEP_SECONDS;
    const nextKw = powerAt(session, station, next, kwh);
    kwh += ((kw + nextKw) / 2) * (STEP_SECONDS / 3600);
    seconds = next;
    kw = nextKw;
    const done = kw === 0;
    if (done || Math.abs(kw - last.kw) >= REPORT_CHANGE_KW || seconds - lastSeconds >= heartbeat) {
      return {
        reading: {
          sessionId: session.id,
          at: new Date(startedAt + seconds * 1000).toISOString(),
          kw: round(kw, 2),
          kwh: round(kwh, 3),
        },
        done,
      };
    }
  }
};
