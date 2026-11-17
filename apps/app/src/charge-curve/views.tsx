/**
 * Graph module pages, from the charging database (db/ChargingDb.ts):
 * - the list of charging sessions (Ladevorgänge), with a form to plug a car in
 * - a session's detail page with its charging curve in <charge-chart>, fed by <data> children
 *   and drawn with D3 (first on the server, then in the browser on each change)
 *
 * While a session charges, its page holds a hidden poller that asks every 2 s for the readings
 * after the last one it has (`after`). The answer is out-of-band swaps only: the new readings as
 * <data> appended to the chart (which then updates its SVG with D3), the session's figures, and
 * a new poller with the new `after` (without a trigger once the session has finished).
 */

import { Layout } from "../layout.js";
import { moduleAssets, type NavLink } from "../module.js";
import { ChargeChart, ChargeChartElement, SampleData } from "./chart.js";
import type { SessionView } from "./db/ChargingDb.js";
import type { Reading, Station } from "./db/schema.js";
import { type CurveName, clock, curveNames, DEFAULT_GAP_MINUTES, kwhText, kwText, type Sample } from "./draw.js";
import { dateTime, duration, time, toSamples } from "./time.js";

export const nav: NavLink = { href: "/graph", label: "Graph" };
export const assets = moduleAssets("charge-curve", {
  styles: new URL("./charge-curve.css", import.meta.url),
  script: new URL("./client/charge-chart.ts", import.meta.url),
});

export const sessionHref = (id: string) => `/graph/sessions/${encodeURIComponent(id)}`;
export const compareHref = "/graph/compare";

/** how often a charging session's page asks for new readings */
const POLL_SECONDS = 2;
/** a charging session shows a placeholder until its readings span this many minutes */
const MIN_LIVE_MINUTES = 3;

/** cars the start form offers */
export const vehicles = [
  { id: "id3", name: "VW ID.3", batteryKwh: 58, vehicleMaxKw: 11 },
  { id: "zoe", name: "Renault Zoe", batteryKwh: 52, vehicleMaxKw: 22 },
  { id: "model3", name: "Tesla Model 3", batteryKwh: 57.5, vehicleMaxKw: 11 },
  { id: "kona", name: "Hyundai Kona", batteryKwh: 64, vehicleMaxKw: 7.2 },
  { id: "500e", name: "Fiat 500e", batteryKwh: 37.3, vehicleMaxKw: 11 },
] as const;

const percent = (share: number) => `${Math.round(share * 100)} %`;
const kwh = (value: number) => kwhText({ minute: 0, kw: 0, kwh: value });
const kw = (value: number) => kwText({ minute: 0, kw: value, kwh: 0 });

/** "Lädt" or "Beendet"; with `id` a poll can replace it (out of band) */
const StatusBadge = ({ view, id, oob }: { view: SessionView; id?: string; oob?: boolean }) => {
  const live = view.session.status === "charging";
  return (
    <span id={id} class={live ? "curve-badge curve-badge--live" : "curve-badge"} hx-swap-oob={oob ? "true" : undefined}>
      {live ? <span class="curve-status__dot curve-status__dot--live" aria-hidden="true"></span> : null}
      {live ? "Lädt" : "Beendet"}
    </span>
  );
};

// ---- list ----

export const SessionsPage = ({
  sessions,
  stations,
}: {
  sessions: ReadonlyArray<SessionView>;
  stations: ReadonlyArray<Station>;
}) => (
  <Layout title="Ladevorgänge" current={nav} head={assets.head}>
    <main class="page" lang="de">
      <header class="intro">
        <h1>Ladevorgänge</h1>
        <p>
          Charging sessions from the charging database (a JSON file read through an Effect service). Open one to see
          its charging curve; start a new one to watch it live.
        </p>
        <p>
          <a href={compareHref}>Darstellungen vergleichen →</a> (interpolation, readings as points)
        </p>
      </header>

      <section class="card" aria-labelledby="sessions-title">
        <h2 id="sessions-title" class="card__title">
          Alle Ladevorgänge
        </h2>
        <div class="table-scroll">
          <table class="api-table curve-sessions">
            <thead>
              <tr>
                <th scope="col">Start</th>
                <th scope="col">Wallbox</th>
                <th scope="col">Fahrzeug</th>
                <th scope="col" class="curve-number">
                  Dauer
                </th>
                <th scope="col" class="curve-number">
                  Lademenge
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((view) => (
                <tr>
                  <th scope="row">
                    <a href={sessionHref(view.session.id)}>{dateTime(view.session.startedAt, view.station.timeZone)}</a>
                  </th>
                  <td>{view.station.name}</td>
                  <td>{view.session.vehicle}</td>
                  <td class="curve-number">
                    {duration(view.session.startedAt, view.session.endedAt ?? view.lastReadingAt ?? view.session.startedAt)}
                  </td>
                  <td class="curve-number">{kwh(view.energyKwh)}</td>
                  <td>
                    <StatusBadge view={view} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <StartForm stations={stations} />
      <Notes />
    </main>
  </Layout>
);

/** plug a car in: POST /graph/sessions, then on to the new session's page */
const StartForm = ({ stations }: { stations: ReadonlyArray<Station> }) => (
  <section class="card" aria-labelledby="start-title">
    <h2 id="start-title" class="card__title">
      Ladevorgang starten
    </h2>
    <p class="card__lead">
      A simulated wallbox then sends meter readings into the database until the car reaches its target: every few
      seconds while the power changes, otherwise after 1 to 20 minutes. In time-lapse: one reading a second.
    </p>
    <form class="curve-start" method="post" action="/graph/sessions">
      <label class="field">
        <span class="field__label">Wallbox</span>
        <select name="station" required>
          {stations.map((s) => (
            <option value={s.id}>{`${s.name} (${kw(s.maxKw)})`}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Fahrzeug</span>
        <select name="vehicle" required>
          {vehicles.map((v) => (
            <option value={v.id}>{v.name}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field__label">Ladestand (%)</span>
        <input name="startSoc" type="number" min="0" max="95" step="5" value="30" required />
      </label>
      <label class="field">
        <span class="field__label">Ziel (%)</span>
        <input name="targetSoc" type="number" min="10" max="100" step="5" value="80" required />
      </label>
      <button type="submit" class="button">
        Starten
      </button>
    </form>
  </section>
);

// ---- detail ----

const chartId = (sessionId: string) => `chart-${sessionId}`;
const factsId = (sessionId: string) => `facts-${sessionId}`;
const pollerId = (sessionId: string) => `poller-${sessionId}`;
const badgeId = (sessionId: string) => `status-${sessionId}`;

export const SessionPage = ({ view, readings }: { view: SessionView; readings: ReadonlyArray<Reading> }) => {
  const { session, station } = view;
  const live = session.status === "charging";
  const samples = toSamples(session, station, readings);
  return (
    <Layout title={`Ladevorgang ${session.id}`} current={nav} head={assets.head}>
      <main class="page" lang="de">
        <header class="intro">
          <p class="curve-back">
            <a href={nav.href}>← Ladevorgänge</a>
          </p>
          <h1>
            {session.vehicle} · {station.name}
          </h1>
        </header>

        <section class="card" aria-labelledby="curve-title">
          <div class="curve-header">
            <h2 id="curve-title" class="card__title">
              Ladekurve
            </h2>
            <StatusBadge view={view} id={badgeId(session.id)} />
          </div>
          <p class="card__lead">
            <a href={`${compareHref}?session=${encodeURIComponent(session.id)}`}>Darstellungen vergleichen →</a>
          </p>
          <Facts view={view} />
          <ChargeChart
            id={chartId(session.id)}
            label={`Ladekurve von ${session.vehicle} an ${station.name}`}
            samples={samples}
            live={live}
            minMinutes={live ? MIN_LIVE_MINUTES : 0}
          />
          {live ? <Poller sessionId={session.id} after={readings.at(-1)?.at ?? ""} done={false} /> : null}
          <SampleTable samples={samples} />
        </section>
      </main>
    </Layout>
  );
};

/** the session's figures; a poll replaces them (out of band) while it charges */
const Facts = ({ view, oob }: { view: SessionView; oob?: boolean }) => {
  const { session, station } = view;
  const until = session.endedAt ?? view.lastReadingAt ?? session.startedAt;
  return (
    <dl id={factsId(session.id)} class="curve-facts" hx-swap-oob={oob ? "true" : undefined}>
      <div>
        <dt>Start</dt>
        <dd>{dateTime(session.startedAt, station.timeZone)}</dd>
      </div>
      <div>
        <dt>{session.endedAt ? "Ende" : "Letzter Messwert"}</dt>
        <dd>{view.lastReadingAt || session.endedAt ? time(until, station.timeZone) : "–"}</dd>
      </div>
      <div>
        <dt>Dauer</dt>
        <dd>{duration(session.startedAt, until)}</dd>
      </div>
      <div>
        <dt>Lademenge</dt>
        <dd>{kwh(view.energyKwh)}</dd>
      </div>
      <div>
        <dt>Spitzenleistung</dt>
        <dd>{kw(view.peakKw)}</dd>
      </div>
      <div>
        <dt>Ladestand</dt>
        <dd>
          {percent(session.startSoc)} → {percent(Math.min(session.targetSoc, session.startSoc + view.energyKwh / session.batteryKwh))}
        </dd>
      </div>
    </dl>
  );
};

/**
 * The hidden element that polls. Each answer replaces it with one that asks from the newest
 * reading; once the session has finished the new one has no trigger, so polling stops.
 */
const Poller = ({ sessionId, after, done, oob }: { sessionId: string; after: string; done: boolean; oob?: boolean }) => (
  <div
    id={pollerId(sessionId)}
    hidden
    hx-get={`${sessionHref(sessionId)}/readings?after=${encodeURIComponent(after)}`}
    hx-trigger={done ? undefined : `every ${POLL_SECONDS}s`}
    hx-swap="none"
    hx-swap-oob={oob ? "true" : undefined}
  ></div>
);

/**
 * A poll's answer: the readings after `after` as <data>, appended to the chart out of band, the
 * figures, the status and the next poller. The last one (the session has finished) replaces the
 * chart instead: its x-axis then ends at the last reading.
 */
export const ReadingsUpdate = ({
  view,
  fresh,
  all,
  after,
}: {
  view: SessionView;
  fresh: ReadonlyArray<Reading>;
  /** every reading, for the last answer: the chart is replaced once with its finished version */
  all: ReadonlyArray<Reading>;
  after: string;
}) => {
  const { session, station } = view;
  const done = session.status !== "charging";
  // `after` stays when nothing is new
  return (
    <>
      {done ? (
        <ChargeChartElement
          id={chartId(session.id)}
          label={`Ladekurve von ${session.vehicle} an ${station.name}`}
          samples={toSamples(session, station, all)}
          oob
        />
      ) : fresh.length > 0 ? (
        <div hx-swap-oob={`beforeend:#${chartId(session.id)}`}>
          {toSamples(session, station, fresh).map((sample) => (
            <SampleData sample={sample} />
          ))}
        </div>
      ) : null}
      <Facts view={view} oob />
      <StatusBadge view={view} id={badgeId(session.id)} oob />
      <Poller sessionId={session.id} after={fresh.at(-1)?.at ?? after} done={done} oob />
    </>
  );
};

/** "12 s", "2 min 30 s", "20 min" */
const interval = (minutes: number) => {
  const seconds = Math.round(minutes * 60);
  if (seconds < 60) return `${seconds} s`;
  return seconds % 60 === 0 ? `${seconds / 60} min` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
};

/** every reading, with the time since the one before (the meter reports at irregular times) */
const SampleTable = ({ samples }: { samples: ReadonlyArray<Sample> }) => (
  <details class="curve-table">
    <summary>Messwerte als Tabelle ({samples.length})</summary>
    <div class="table-scroll">
      <table class="api-table">
        <thead>
          <tr>
            <th scope="col">Uhrzeit</th>
            <th scope="col" class="curve-number">
              Abstand
            </th>
            <th scope="col" class="curve-number">
              Ladeleistung
            </th>
            <th scope="col" class="curve-number">
              Lademenge
            </th>
          </tr>
        </thead>
        <tbody>
          {samples.map((s, i) => {
            const previous = samples[i - 1];
            const gap = previous ? s.minute - previous.minute : 0;
            return (
              <tr class={gap > DEFAULT_GAP_MINUTES ? "curve-table__gap" : undefined}>
                <th scope="row">{clock(s.minute)}</th>
                <td class="curve-number">{previous ? interval(gap) : "–"}</td>
                <td class="curve-number">{kwText(s)}</td>
                <td class="curve-number">{kwhText(s)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </details>
);

const Notes = () => (
  <section class="card" lang="en" aria-labelledby="notes-title">
    <h2 id="notes-title" class="card__title">
      How it works
    </h2>
    <ul class="curve-notes">
      <li>
        <strong>Database:</strong> a JSON file with three tables (stations, sessions, readings: meter readings at
        irregular times, seconds to 20 minutes apart). <code>ChargingDb</code> is an Effect service: every query reads the file through Effect's FileSystem
        and decodes it with Schema; writes replace it atomically, one at a time. Errors are typed (
        <code>DbError</code>, <code>SessionNotFound</code>).
      </li>
      <li>
        <strong>Charger:</strong> a background fiber stands in for the wallboxes: for each session still charging it
        writes the next reading (power ramps up, holds, tapers off above 90 %) and ends the session at the target. It
        reports like a real meter: when the power changes by 0.5 kW, else when a random 1–20 minute heartbeat is due.
        The chart joins readings more than 5 minutes apart with a dashed line: nothing was measured there.
      </li>
      <li>
        <strong>Chart:</strong> <code>&lt;charge-chart&gt;</code> takes its samples from <code>&lt;data&gt;</code>{" "}
        children and redraws with keyed D3 joins when children are added; the server draws the first SVG with the same
        code.
      </li>
      <li>
        <strong>Live:</strong> a charging session's page asks every 2 s for the readings after its newest one; the
        answer appends them as <code>&lt;data&gt;</code> (<code>hx-swap-oob="beforeend:#…"</code>) and replaces the
        figures and the poller, which has no trigger once the session has finished.
      </li>
    </ul>
  </section>
);

// ---- showcase: ways to draw the chart ----

const curveInfo: Record<CurveName, { readonly d3: string; readonly text: string }> = {
  linear: { d3: "curveLinear", text: "Gerade Strecken zwischen den Messwerten: exakt, aber eckig. (Standard)" },
  monotone: {
    d3: "curveMonotoneX",
    text: "Glatt und durch jeden Messwert, ohne Überschwingen: steigende kWh bleiben steigend.",
  },
  "step-after": {
    d3: "curveStepAfter",
    text: "Jeder Wert gilt bis zum nächsten Messwert: zeigt, was zuletzt gemessen wurde.",
  },
  step: { d3: "curveStep", text: "Der Wert wechselt jeweils in der Mitte zwischen zwei Messwerten." },
  natural: {
    d3: "curveNatural",
    text: "Natürlicher kubischer Spline: sehr glatt, schwingt an Ecken über (Leistung über dem Maximum, unter 0).",
  },
  cardinal: { d3: "curveCardinal", text: "Kardinal-Spline: durch jeden Messwert, schwingt an Ecken über." },
  "catmull-rom": {
    d3: "curveCatmullRom",
    text: "Zentripetaler Catmull-Rom: durch jeden Messwert, schwingt weniger über als cardinal.",
  },
  basis: {
    d3: "curveBasis",
    text: "B-Spline: am glattesten, geht aber nicht durch die Messwerte; Ecken werden abgeschnitten.",
  },
};

const COMPARE_CHART_ID = "compare-chart";

/**
 * One chart and the ways to draw it: which session, which interpolation, readings as points or
 * not, gaps between readings dashed or solid. Those selects change the chart in place (its
 * `curve`, `points` and `gaps` attributes, see client/charge-chart.ts) and the address with
 * them; picking another session
 * loads the page for it. Without JavaScript, "Anzeigen" submits the same choice.
 */
export const ComparePage = ({
  sessions,
  view,
  readings,
  curve,
  points,
  gaps,
}: {
  sessions: ReadonlyArray<SessionView>;
  view: SessionView;
  readings: ReadonlyArray<Reading>;
  curve: CurveName;
  points: boolean;
  gaps: "dashed" | "solid";
}) => {
  const { session, station } = view;
  return (
    <Layout title="Darstellungen vergleichen" current={nav} head={assets.head}>
      <main class="page" lang="de">
        <header class="intro">
          <p class="curve-back">
            <a href={nav.href}>← Ladevorgänge</a>
          </p>
          <h1>Darstellungen vergleichen</h1>
          <p>
            Dieselben Messwerte, anders gezeichnet. Die Wallbox meldet unregelmäßig (alle paar Sekunden, solange sich die
            Leistung ändert, sonst nach 1 bis 20 Minuten): mit Punkten sieht man, wo wirklich gemessen wurde und was die
            Interpolation dazwischen erfindet. Die übrigen Seiten zeichnen immer linear, ohne Punkte.
          </p>
        </header>

        <section class="card" aria-labelledby="compare-title">
          <h2 id="compare-title" class="card__title">
            {session.vehicle} · {station.name}
          </h2>
          <form class="curve-controls" method="get" action={compareHref}>
            <label class="field">
              <span class="field__label">Ladevorgang</span>
              <select name="session" data-submit>
                {sessions.map((s) => (
                  <option value={s.session.id} selected={s.session.id === session.id || undefined}>
                    {`${dateTime(s.session.startedAt, s.station.timeZone)} · ${s.session.vehicle}${s.session.status === "charging" ? " (lädt)" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Interpolation</span>
              <select name="curve" data-chart={COMPARE_CHART_ID} data-chart-attribute="curve">
                {curveNames.map((name) => (
                  <option
                    value={name}
                    selected={name === curve || undefined}
                    data-description={curveInfo[name].text}
                  >{`${name} · d3.${curveInfo[name].d3}`}</option>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Messpunkte</span>
              <select name="points" data-chart={COMPARE_CHART_ID} data-chart-attribute="points">
                <option value="" selected={!points || undefined}>
                  Nur Linie
                </option>
                <option value="on" selected={points || undefined}>
                  Linie mit Punkten
                </option>
              </select>
            </label>
            <label class="field">
              <span class="field__label">Lücken (über {DEFAULT_GAP_MINUTES} min)</span>
              <select name="gaps" data-chart={COMPARE_CHART_ID} data-chart-attribute="gaps">
                <option value="" selected={gaps === "dashed" || undefined}>
                  Gestrichelt
                </option>
                <option value="solid" selected={gaps === "solid" || undefined}>
                  Durchgezogen
                </option>
              </select>
            </label>
            <noscript>
              <button type="submit" class="button">
                Anzeigen
              </button>
            </noscript>
          </form>
          <p class="curve-description" data-describes="curve" aria-live="polite">
            {curveInfo[curve].text}
          </p>
          <ChargeChart
            id={COMPARE_CHART_ID}
            label={`Ladekurve von ${session.vehicle} an ${station.name}`}
            samples={toSamples(session, station, readings)}
            curve={curve}
            points={points}
            gaps={gaps}
          />
        </section>
      </main>
    </Layout>
  );
};
