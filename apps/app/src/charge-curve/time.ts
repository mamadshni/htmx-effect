/**
 * From database rows to what the pages show: meter readings → chart samples, and instants →
 * text, both in the station's time zone.
 *
 * A sample's minute counts from midnight of the day the session started (local time), so a
 * session past midnight keeps counting (1440 = 00:00 the next day) and the axis stays in order.
 * Readings come at any second, so it has a fraction (570.5 = 09:30:30), kept to 4 places.
 */

import { Temporal } from "@js-temporal/polyfill";
import type { Reading, Session, Station } from "./db/schema.js";
import type { Sample } from "./draw.js";

const zoned = (instant: string, timeZone: string) => Temporal.Instant.from(instant).toZonedDateTimeISO(timeZone);

export const toSamples = (
  session: Session,
  station: Station,
  readings: ReadonlyArray<Reading>,
): ReadonlyArray<Sample> => {
  const startDay = zoned(session.startedAt, station.timeZone).toPlainDate();
  return readings.map((r) => {
    const at = zoned(r.at, station.timeZone);
    const days = startDay.until(at.toPlainDate()).days;
    const minute = days * 1440 + at.hour * 60 + at.minute + at.second / 60;
    return { minute: Math.round(minute * 10_000) / 10_000, kw: r.kw, kwh: r.kwh };
  });
};

/** "Di., 10.11.2026, 18:12" */
export const dateTime = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(
    new Date(instant),
  );

/** "18:12" */
export const time = (instant: string, timeZone: string) =>
  new Intl.DateTimeFormat("de-DE", { timeStyle: "short", timeZone }).format(new Date(instant));

/** "2 h 27 min" from two instants */
export const duration = (from: string, to: string) => {
  const minutes = Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};
