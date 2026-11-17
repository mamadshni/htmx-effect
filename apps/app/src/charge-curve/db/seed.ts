/**
 * Writes the seed database (charging.json next to this file): two wallboxes and a week of
 * finished charging sessions, with meter readings at irregular times made by the same model the
 * charger simulator uses. Run with `pnpm --filter @combo/app seed`; the app copies the file
 * to .data/ on its first start and works on that copy.
 */

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Schema } from "effect";
import { nextReading } from "./model.js";
import { Database, formatDatabase, type Reading, type Session, type Station } from "./schema.js";

const stations: ReadonlyArray<Station> = [
  { id: "wb-garage", name: "Wallbox Garage", timeZone: "Europe/Berlin", maxKw: 11 },
  { id: "wb-office", name: "Wallbox Büro", timeZone: "Europe/Berlin", maxKw: 7.4 },
];

type Plan = Omit<Session, "endedAt" | "status">;

/** startedAt in UTC (Berlin is UTC+1 in November) */
const plans: ReadonlyArray<Plan> = [
  { id: "s-1001", stationId: "wb-garage", vehicle: "VW ID.3", batteryKwh: 58, vehicleMaxKw: 11, startSoc: 0.35, targetSoc: 0.8, startedAt: "2026-11-10T17:12:00.000Z" },
  { id: "s-1002", stationId: "wb-office", vehicle: "Renault Zoe", batteryKwh: 52, vehicleMaxKw: 22, startSoc: 0.72, targetSoc: 0.96, startedAt: "2026-11-11T08:30:00.000Z" },
  { id: "s-1003", stationId: "wb-garage", vehicle: "Tesla Model 3", batteryKwh: 57.5, vehicleMaxKw: 11, startSoc: 0.55, targetSoc: 1, startedAt: "2026-11-12T19:05:00.000Z" },
  { id: "s-1004", stationId: "wb-office", vehicle: "Hyundai Kona", batteryKwh: 64, vehicleMaxKw: 7.2, startSoc: 0.7, targetSoc: 0.9, startedAt: "2026-11-13T07:48:00.000Z" },
  { id: "s-1005", stationId: "wb-garage", vehicle: "Fiat 500e", batteryKwh: 37.3, vehicleMaxKw: 11, startSoc: 0.2, targetSoc: 0.85, startedAt: "2026-11-15T16:40:00.000Z" },
  { id: "s-1006", stationId: "wb-office", vehicle: "Renault Zoe", batteryKwh: 52, vehicleMaxKw: 22, startSoc: 0.5, targetSoc: 0.95, startedAt: "2026-11-16T08:15:00.000Z" },
];

const sessions: Array<Session> = [];
const readings: Array<Reading> = [];

for (const plan of plans) {
  const station = stations.find((s) => s.id === plan.stationId)!;
  const session: Session = { ...plan, endedAt: null, status: "charging" };
  let last: Reading | undefined;
  for (;;) {
    const { reading, done } = nextReading(session, station, last);
    readings.push(reading);
    last = reading;
    if (done) break;
  }
  sessions.push({ ...session, endedAt: last.at, status: "finished" });
}

// validate against the schema before writing, like the app will on reading
const database = Schema.decodeUnknownSync(Database)({ stations, sessions, readings });
const file = fileURLToPath(new URL("./charging.json", import.meta.url));
writeFileSync(file, formatDatabase(database));
console.log(`wrote ${file}: ${sessions.length} sessions, ${readings.length} readings`);
