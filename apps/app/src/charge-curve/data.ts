/**
 * A simulated charging session (Ladevorgang): one sample per minute with the charging power
 * (kW) and the energy charged so far (kWh). Times are minutes since midnight, so the chart
 * shows the same clock times whatever the server's or the browser's time zone.
 */

export interface Sample {
  /** minutes since midnight */
  readonly minute: number;
  /** Ladeleistung */
  readonly kw: number;
  /** Lademenge so far */
  readonly kwh: number;
}

/** 09:30 */
export const SESSION_START = 9 * 60 + 30;
export const SESSION_MINUTES = 112;

/**
 * The live example's pace: simulated minutes per real second, so a whole session plays in
 * about two minutes.
 */
export const LIVE_MINUTES_PER_SECOND = 1;

/** how often the live example polls, in seconds (htmx `every 2s`) */
export const LIVE_POLL_SECONDS = 2;

/** the curve is drawn once the session has this many minutes of samples; before, a placeholder */
export const MIN_LIVE_MINUTES = 3;

/** typical AC charging: ramp up, constant power, a small dip, then tapering off near full */
const powerAt = (m: number): number => {
  if (m <= 0) return 0;
  if (m < 5) return (7.2 * m) / 5;
  if (m < 10) return 7.2 + (0.35 * (m - 5)) / 5;
  if (m < 80) return 7.55;
  if (m < 92) return 7.55 - (0.55 * (m - 80)) / 12;
  if (m < SESSION_MINUTES) return 7.0 * Math.cos(((m - 92) / (SESSION_MINUTES - 92)) * (Math.PI / 2));
  return 0;
};

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

const buildSession = (): ReadonlyArray<Sample> => {
  const samples: Array<Sample> = [];
  let kwh = 0;
  for (let m = 0; m <= SESSION_MINUTES; m++) {
    const kw = Math.max(0, powerAt(m));
    // energy is the area under the power curve (trapezoids of one minute)
    if (m > 0) kwh += (powerAt(m - 1) + kw) / 2 / 60;
    samples.push({ minute: SESSION_START + m, kw: round(kw, 2), kwh: round(kwh, 3) });
  }
  return samples;
};

export const session: ReadonlyArray<Sample> = buildSession();

/** the samples recorded up to `elapsedMinutes` into the session */
export const samplesUntil = (elapsedMinutes: number): ReadonlyArray<Sample> =>
  session.filter((s) => s.minute - SESSION_START <= elapsedMinutes);

/** how far a live session started at `startedAt` (epoch ms) is, in whole simulated minutes */
export const liveElapsed = (startedAt: number, now = Date.now()) =>
  Math.min(SESSION_MINUTES, Math.floor(((now - startedAt) / 1000) * LIVE_MINUTES_PER_SECOND));
