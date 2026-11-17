/**
 * <charge-chart> on the server: the <data> children (the samples), the SVG drawn by the same
 * D3 code the browser uses (draw.ts, here on a small DOM: linkedom), the tooltip and the legend.
 * In the browser the element (client/charge-chart.ts) adopts that SVG and redraws it with D3
 * whenever <data> children are added.
 */

import { select } from "d3";
import { parseHTML } from "linkedom";
import { fromHtml } from "tsx-to-html";
import {
  clock,
  drawCurve,
  frameFor,
  kwhText,
  kwText,
  moveSlider,
  type CurveName,
  type DrawOptions,
  type Sample,
  shareOf,
  type Svg,
  valueText,
} from "./draw.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/** the SVG for `samples`, drawn with D3 on the server, the slider on the last sample */
const svgMarkup = (id: string, samples: ReadonlyArray<Sample>, options: Omit<DrawOptions, "id">) => {
  const { document } = parseHTML("<!doctype html><html><body></body></html>");
  const node = document.createElementNS(SVG_NS, "svg");
  const svg = select(node as unknown as SVGSVGElement) as Svg;
  drawCurve(svg, samples, { id, ...options });
  const last = samples.at(-1);
  if (last) moveSlider(svg, last);
  return fromHtml(node.outerHTML);
};

/** one sample: machine value "minute,kW,kWh", readable text */
export const SampleData = ({ sample }: { sample: Sample }) => (
  <data value={`${sample.minute},${sample.kw},${sample.kwh}`}>
    {clock(sample.minute)} Uhr: {kwText(sample)}, {kwhText(sample)}
  </data>
);

interface ChartProps {
  readonly id: string;
  readonly label: string;
  readonly samples: ReadonlyArray<Sample>;
  /** the x-axis leaves room for samples to come */
  readonly live?: boolean;
  /** a placeholder until the samples span that many minutes */
  readonly minMinutes?: number;
  /** interpolation between readings (default linear) */
  readonly curve?: CurveName;
  /** mark each reading with a dot */
  readonly points?: boolean;
  /** readings further apart than this (minutes) are joined by a dashed line (default 5) */
  readonly gapMinutes?: number;
  /** gaps between readings dashed (default) or solid like the rest */
  readonly gaps?: "dashed" | "solid";
}

/** the chart with its legend */
export const ChargeChart = (props: ChartProps) => (
  <div class="curve-widget">
    <ChargeChartElement {...props} />
    <ul class="curve-legend" aria-hidden="true">
      <li>
        <span class="curve-legend__dot"></span>Ladeleistung in kW
      </li>
      <li>
        <span class="curve-legend__line"></span>Lademenge in kWh
      </li>
      {/* shown while the chart has points (CSS), which a select can switch */}
      <li class="curve-legend__item--points">
        <span class="curve-legend__point"></span>Messwert
      </li>
      <li class="curve-legend__item--gaps">
        <span class="curve-legend__gap"></span>Lücke ohne Messwert
      </li>
    </ul>
  </div>
);

/**
 * The <charge-chart> element alone; with `oob`, a poll answer that replaces the one on the page
 * (once, when a live session has finished: its axis no longer needs room for what is coming).
 */
export const ChargeChartElement = ({
  id,
  label,
  samples,
  live = false,
  minMinutes = 0,
  curve,
  points = false,
  gapMinutes,
  gaps = "dashed",
  oob,
}: ChartProps & { readonly oob?: boolean }) => {
  const first = samples[0];
  const last = samples.at(-1);
  const shown = !!first && !!last && last.minute - first.minute >= minMinutes;
  const share = shown && last ? shareOf(frameFor(samples, live), last) : 0;
  return (
    <charge-chart
      id={id}
      hx-swap-oob={oob ? "true" : undefined}
      class="curve is-at-end"
      live={live || undefined}
      curve={curve}
      points={points || undefined}
      gap-minutes={gapMinutes}
      gaps={gaps === "solid" ? "solid" : undefined}
      min-minutes={minMinutes || undefined}
      role="slider"
      tabindex="0"
      aria-label={label}
      aria-valuemin="0"
      aria-valuemax={String(Math.max(0, samples.length - 1))}
      aria-valuenow={String(Math.max(0, samples.length - 1))}
      aria-valuetext={shown && last ? valueText(last) : "Noch keine Messwerte"}
    >
      {samples.map((sample) => (
        <SampleData sample={sample} />
      ))}
      <div class="curve-plot">
        {shown ? (
          svgMarkup(id, samples, {
            live,
            points,
            ...(curve ? { curve } : {}),
            ...(gapMinutes ? { gapMinutes } : {}),
            dashGaps: gaps !== "solid",
          })
        ) : (
          <p class="curve-placeholder">
            {first
              ? `Ladevorgang gestartet. Die Ladekurve erscheint nach ${minMinutes} Minuten.`
              : "Noch keine Messwerte."}
          </p>
        )}
      </div>
      <div
        class={share > 0.55 ? "curve-tooltip is-flipped" : "curve-tooltip"}
        data-curve-tooltip
        aria-hidden="true"
        hidden={!shown || undefined}
        style={`left: ${(share * 100).toFixed(2)}%`}
      >
        <span class="curve-tooltip__time" data-slot="time">
          {shown && last ? `${clock(last.minute)} Uhr` : ""}
        </span>
        <span class="curve-tooltip__row">
          <span class="curve-legend__dot"></span>Ladeleistung
          <strong data-slot="kw">{shown && last ? kwText(last) : ""}</strong>
        </span>
        <span class="curve-tooltip__row">
          <span class="curve-legend__line"></span>Lademenge
          <strong data-slot="kwh">{shown && last ? kwhText(last) : ""}</strong>
        </span>
      </div>
    </charge-chart>
  );
};
