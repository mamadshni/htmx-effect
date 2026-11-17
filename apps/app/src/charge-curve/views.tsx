/**
 * Graph page: the charging curve (Ladekurve) of a charging session, drawn with D3 by
 * <charge-curve> (client/charge-curve.ts). The server renders the samples as JSON inside the
 * element; the element draws them and redraws whenever they change.
 *
 * Two examples: a finished session, and a live one that htmx polls (`hx-trigger="every 2s"`).
 * Each poll swaps only the JSON (so the slider and focus stay where they are) and the status
 * line (out of band). When the session is over the server answers 286 and htmx stops polling.
 */

import { Layout } from "../layout.js";
import { moduleAssets, type NavLink } from "../module.js";
import {
  LIVE_MINUTES_PER_SECOND,
  LIVE_POLL_SECONDS,
  liveElapsed,
  MIN_LIVE_MINUTES,
  type Sample,
  SESSION_MINUTES,
  samplesUntil,
  session,
} from "./data.js";

export const nav: NavLink = { href: "/graph", label: "Graph" };
export const assets = moduleAssets("charge-curve", {
  styles: new URL("./charge-curve.css", import.meta.url),
  script: new URL("./client/charge-curve.ts", import.meta.url),
});

const LIVE_DATA_ID = "live-curve-data";
const LIVE_STATUS_ID = "live-curve-status";

const kwh = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kw = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

/** the samples as JSON for <charge-curve> (never executed: type application/json) */
const SamplesJson = ({ samples, id }: { samples: ReadonlyArray<Sample>; id?: string }) => (
  // the JSX types only allow module/importmap; a data block is valid HTML
  <script {...({ type: "application/json" } as object)} id={id} data-samples>
    {/* "<" escaped so the JSON can never close the script element */}
    {JSON.stringify(samples).replaceAll("<", "\\u003c")}
  </script>
);

export const GraphPage = ({ liveStart }: { liveStart: number }) => (
  <Layout title="Graph" current={nav} head={assets.head}>
    <main class="page page--wide">
      <header class="intro">
        <h1>Ladekurve</h1>
        <p>
          The charging curve of a charging session, drawn with D3: charging power (kW, right scale) and energy
          charged (kWh, left scale). Move the slider with the mouse, by dragging on touch, or focus the chart
          and use the arrow keys (Shift or Page Up/Down: 10 minutes, Home/End: start/end).
        </p>
      </header>

      <section class="card" lang="de" aria-labelledby="curve-title">
        <h2 id="curve-title" class="card__title">
          Abgeschlossener Ladevorgang
        </h2>
        <charge-curve class="charge-curve" aria-label="Ladekurve des Ladevorgangs">
          <SamplesJson samples={session} />
        </charge-curve>
        <SampleTable samples={session} />
      </section>

      <LiveCard start={liveStart} />

      <Notes />
    </main>
  </Layout>
);

/**
 * The live example. The card polls itself, swapping only the JSON inside the chart; the
 * restart button replaces the whole card with a new session.
 */
export const LiveCard = ({ start }: { start: number }) => (
  <section
    class="card"
    lang="de"
    aria-labelledby="live-title"
    hx-get={`/graph/live?start=${start}`}
    hx-trigger={`every ${LIVE_POLL_SECONDS}s`}
    hx-target={`#${LIVE_DATA_ID}`}
    hx-swap="outerHTML"
  >
    <div class="curve-header">
      <h2 id="live-title" class="card__title">
        Live-Ladevorgang
      </h2>
      <button
        type="button"
        class="button button--ghost"
        hx-get="/graph/live-card"
        hx-target="closest section"
        hx-swap="outerHTML"
      >
        Neu starten
      </button>
    </div>
    <LiveStatus elapsed={liveElapsed(start)} />
    <charge-curve class="charge-curve" aria-label="Ladekurve des laufenden Ladevorgangs" min-minutes={MIN_LIVE_MINUTES} live>
      <SamplesJson samples={samplesUntil(liveElapsed(start))} id={LIVE_DATA_ID} />
    </charge-curve>
  </section>
);

const LiveStatus = ({ elapsed, oob }: { elapsed: number; oob?: boolean }) => {
  const samples = samplesUntil(elapsed);
  const last = samples.at(-1);
  const done = elapsed >= SESSION_MINUTES;
  return (
    <p id={LIVE_STATUS_ID} class="curve-status" hx-swap-oob={oob ? "true" : undefined}>
      <span class={done ? "curve-status__dot" : "curve-status__dot curve-status__dot--live"} aria-hidden="true"></span>
      {done ? "Beendet" : "Lädt"} · {elapsed} min · {kwh.format(last?.kwh ?? 0)} kWh · {kw.format(last?.kw ?? 0)} kW
      <span class="curve-status__note">
        (simuliert: {LIVE_MINUTES_PER_SECOND} min pro Sekunde, Abfrage alle {LIVE_POLL_SECONDS} s)
      </span>
    </p>
  );
};

/** a poll's answer: the new JSON (swapped into the chart) and the status line (out of band) */
export const LiveUpdate = ({ elapsed }: { elapsed: number }) => (
  <>
    <SamplesJson samples={samplesUntil(elapsed)} id={LIVE_DATA_ID} />
    <LiveStatus elapsed={elapsed} oob />
  </>
);

/** the same values as a table, every 10 minutes and the last sample (for screen readers and a quick check) */
const SampleTable = ({ samples }: { samples: ReadonlyArray<Sample> }) => {
  const rows = samples.filter((s, i) => s.minute % 10 === 0 || i === samples.length - 1);
  return (
    <details class="curve-table">
      <summary>Werte als Tabelle</summary>
      <div class="table-scroll">
        <table class="api-table">
          <thead>
            <tr>
              <th scope="col">Uhrzeit</th>
              <th scope="col" class="curve-number">
                Ladeleistung
              </th>
              <th scope="col" class="curve-number">
                Lademenge
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr>
                <th scope="row">{clock(s.minute)}</th>
                <td class="curve-number">{kw.format(s.kw)} kW</td>
                <td class="curve-number">{kwh.format(s.kwh)} kWh</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
};

/** how each acceptance criterion and open question is answered here */
const Notes = () => (
  <section class="card" aria-labelledby="notes-title">
    <h2 id="notes-title" class="card__title">
      Acceptance criteria and open questions
    </h2>
    <ul class="curve-notes">
      <li>
        <strong>Two lines, two scales with labels, legend, gradient area, horizontal grid lines:</strong> done. Both
        scales get the same number of ticks (nice steps such as 2, 2.5, 3, 4, 5), so one set of grid lines fits both.
      </li>
      <li>
        <strong>Slider with arrow keys:</strong> the chart is one focusable <code>role="slider"</code>; its value
        text reads time, kW and kWh. The slider marks where it crosses both curves.
      </li>
      <li>
        <strong>Tooltip:</strong> it belongs to the slider, not to hover, so it works the same for mouse, touch and
        keyboard.
      </li>
      <li>
        <strong>Grey vertical bands:</strong> dynamic. The time unit is the smallest of 5, 10, 15, 30, 60, 120
        minutes that gives at most 8 bands (4 on narrow screens); the x-axis ticks use the same unit.
      </li>
      <li>
        <strong>Mobile:</strong> under 520 px the chart is lower, the axis titles go (the units stay in the tick
        labels), there are fewer ticks and the legend wraps. Below about 280 px it is still readable but little more.
        Touch: a horizontal drag moves the slider, a vertical one scrolls the page (<code>touch-action: pan-y</code>);
        the tooltip sits at the top of the chart so the finger does not cover it.
      </li>
      <li>
        <strong>Live (htmx):</strong> <code>hx-trigger="every 2s"</code> polls; the server answers 286 when the
        session is over and htmx stops. Other options: <code>load delay:2s</code> on the response (the server decides
        each next interval), or server-sent events with the SSE extension.
      </li>
      <li>
        <strong>Minimum extent:</strong> the x-axis spans at least 30 minutes and each y-axis at least 1, so a session
        that just started is not stretched across the whole chart. Before {MIN_LIVE_MINUTES} minutes of samples a
        placeholder is shown instead of a curve.
      </li>
      <li>
        <strong>Note:</strong> two y-scales make crossing points look meaningful when they are not (where kW crosses
        kWh depends only on the scales). If that confuses users, two stacked charts sharing the time axis are the
        alternative.
      </li>
    </ul>
  </section>
);
