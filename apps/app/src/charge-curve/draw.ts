/**
 * The charging curve, drawn with D3. One function, `drawCurve`, used in two places:
 * - on the server (chart.tsx), on a small DOM (linkedom), for the first paint
 * - in the browser (client/curve.ts), on the same SVG, each time new samples arrive
 *
 * Every element is a D3 data join (`selection.join`), so drawing on an existing SVG updates it
 * instead of starting over: new samples enter, the curves grow, and when the data outgrows the
 * frame (the x-axis grows in steps of 30 minutes, the y-axes in nice steps) bands, ticks,
 * curves and the end marker move to the new scales with a transition. Joins are keyed, and
 * each element also writes its key in `data-key`, so the first draw in the browser matches
 * the elements the server rendered (they have no bound data yet).
 *
 * The samples come from the caller: in the browser, the <data> children of <charge-chart>
 * (client/charge-chart.ts).
 *
 * Fixed viewBox (800 × 600, 4:3): the SVG scales with its container.
 */

import {
  area,
  type CurveFactory,
  curveBasis,
  curveCardinal,
  curveCatmullRom,
  curveLinear,
  curveMonotoneX,
  curveNatural,
  curveStep,
  curveStepAfter,
  easeCubicOut,
  line,
  scaleLinear,
  type Selection,
  type Transition,
} from "d3";

export interface Sample {
  /** minutes since midnight */
  readonly minute: number;
  readonly kw: number;
  readonly kwh: number;
}

export type Svg = Selection<SVGSVGElement, unknown, null, undefined>;
type AnySelection = Selection<any, any, any, any>;
type AnyTransition = Transition<any, any, any, any>;

export const VIEW_WIDTH = 800;
export const VIEW_HEIGHT = 600;
const PLOT_LEFT = 108;
const PLOT_RIGHT = VIEW_WIDTH - 92;
const PLOT_TOP = 28;
const PLOT_BOTTOM = VIEW_HEIGHT - 52;

/** the x-axis spans at least this many minutes; a live one grows in steps of it */
const DOMAIN_STEP_MINUTES = 30;
const MIN_Y = 1;
/** intervals on both y-axes, so one set of grid lines fits both */
const Y_INTERVALS = 4;
const TIME_UNITS = [5, 10, 15, 30, 60, 120, 240];
const MAX_BANDS = 8;
/** x ticks closer than this to the start or end tick are left out */
const TICK_GAP = 48;

// ---- formatting ----

const fmtKwh = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKw = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtTick = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

/** "09:42", or "09:42:30" for a time between whole minutes (readings come at any second) */
export const clock = (minute: number) => {
  const total = Math.round(minute * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad(Math.floor(total / 3600) % 24)}:${pad(Math.floor(total / 60) % 60)}`;
  return total % 60 === 0 ? hhmm : `${hhmm}:${pad(total % 60)}`;
};
export const kwText = (s: Sample) => `${fmtKw.format(s.kw)} kW`;
export const kwhText = (s: Sample) => `${fmtKwh.format(s.kwh)} kWh`;
export const valueText = (s: Sample) => `${clock(s.minute)} Uhr: Ladeleistung ${kwText(s)}, Lademenge ${kwhText(s)}`;

// ---- frame and scales ----

export interface Frame {
  readonly start: number;
  readonly end: number;
  readonly kwhStep: number;
  readonly kwStep: number;
}

/** the smallest "nice" step (1, 2, 2.5, 3, 4, 5 × 10^n) such that 4 steps cover `max` */
const niceStep = (max: number) => {
  const raw = Math.max(max, MIN_Y) / Y_INTERVALS;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 3, 4, 5, 10].find((f) => f * power >= raw - 1e-9) ?? 10) * power;
  return Number(step.toPrecision(6));
};

/** a finished session ends at its last sample; a live one leaves room to the next 30 minutes */
export const frameFor = (samples: ReadonlyArray<Sample>, live: boolean): Frame => {
  const start = samples[0]?.minute ?? 0;
  const last = samples.at(-1)?.minute ?? start;
  const span = live
    ? Math.ceil((last - start + 1) / DOMAIN_STEP_MINUTES) * DOMAIN_STEP_MINUTES
    : Math.max(last - start, DOMAIN_STEP_MINUTES);
  return {
    start,
    end: start + span,
    kwhStep: niceStep(Math.max(0, ...samples.map((s) => s.kwh))),
    kwStep: niceStep(Math.max(0, ...samples.map((s) => s.kw))),
  };
};

const frameKey = (f: Frame) => [f.start, f.end, f.kwhStep, f.kwStep].join(" ");

/** the frame an SVG was last drawn with */
export const frameOf = (svg: Svg): Frame | null => {
  const [start, end, kwhStep, kwStep] = (svg.attr("data-frame") ?? "").split(" ").map(Number);
  return start !== undefined && end && kwhStep && kwStep ? { start, end, kwhStep, kwStep } : null;
};

export const scales = (f: Frame) => ({
  x: scaleLinear().domain([f.start, f.end]).range([PLOT_LEFT, PLOT_RIGHT]),
  yKwh: scaleLinear()
    .domain([0, f.kwhStep * Y_INTERVALS])
    .range([PLOT_BOTTOM, PLOT_TOP]),
  yKw: scaleLinear()
    .domain([0, f.kwStep * Y_INTERVALS])
    .range([PLOT_BOTTOM, PLOT_TOP]),
});
type Scales = ReturnType<typeof scales>;

// ---- join helpers ----

/** the one child `tag.cls` of `parent`, created on the first draw */
const one = (parent: AnySelection, tag: string, cls: string): AnySelection =>
  parent.selectAll(`${tag}.${cls}`).data([null]).join(tag).attr("class", cls);

/**
 * A join key: the datum's key, or for an element the server rendered (no datum yet) the key
 * it wrote in data-key.
 */
const keyed =
  <D>(key: (d: D) => string | number) =>
  function (this: Element, d: unknown) {
    return d === undefined ? (this.getAttribute("data-key") ?? "") : String(key(d as D));
  };

/** set attributes now, or through the transition when there is one */
const to = (selection: AnySelection, t: AnyTransition | null): AnySelection =>
  (t ? selection.transition(t) : selection) as AnySelection;

// ---- interpolation ----

/**
 * How the lines and the area get from one reading to the next (D3 curve factories). The
 * comparison page draws one chart per entry.
 */
export const curves = {
  /** straight segments through every reading */
  linear: curveLinear,
  /** smooth, through every reading, never overshoots between two of them (monotone in x) */
  monotone: curveMonotoneX,
  /** each value holds until the next reading: a reading as the value of the minute after it */
  "step-after": curveStepAfter,
  /** each value holds from halfway before to halfway after its reading */
  step: curveStep,
  /** natural cubic spline: smooth through every reading, overshoots at sharp corners */
  natural: curveNatural,
  /** cardinal spline (tension 0): through every reading, can overshoot */
  cardinal: curveCardinal,
  /** centripetal Catmull–Rom: through every reading, overshoots less than cardinal */
  "catmull-rom": curveCatmullRom,
  /** B-spline: very smooth, but does not pass through the readings (corners get cut) */
  basis: curveBasis,
} as const satisfies Record<string, CurveFactory>;

export type CurveName = keyof typeof curves;
export const curveNames = Object.keys(curves) as ReadonlyArray<CurveName>;
export const isCurveName = (value: string | null | undefined): value is CurveName =>
  value !== null && value !== undefined && Object.hasOwn(curves, value);

// ---- drawing ----

export const DEFAULT_GAP_MINUTES = 5;

/** a break in a line (D3 `line.defined`): the readings on either side are not joined */
type Point = Sample | null;

/**
 * Readings come at irregular times. Where two are close, the line between them is solid; where
 * they are more than `gapMinutes` apart, it is broken (`solid`) and the gap is drawn on its own,
 * dashed (`bridges`: the two readings around each gap, gaps separated by breaks).
 */
const splitAtGaps = (samples: ReadonlyArray<Sample>, gapMinutes: number) => {
  const solid: Array<Point> = [];
  const bridges: Array<Point> = [];
  samples.forEach((sample, i) => {
    const previous = samples[i - 1];
    if (previous && sample.minute - previous.minute > gapMinutes) {
      solid.push(null);
      bridges.push(previous, sample, null);
    }
    solid.push(sample);
  });
  return { solid, bridges };
};

export interface DrawOptions {
  /** prefix for the ids of the gradient and clip path */
  readonly id: string;
  /** a running session: the x-axis leaves room for what is coming */
  readonly live: boolean;
  /** transition length (ms) when the frame changes; 0: no transition (the server) */
  readonly duration?: number;
  /** interpolation between readings (default linear) */
  readonly curve?: CurveName;
  /** also mark each reading with a dot (to see what an interpolation does between them) */
  readonly points?: boolean;
  /**
   * Readings further apart than this (minutes) leave a gap: nothing was measured there, so the
   * lines are dashed across it instead of solid (default 5).
   */
  readonly gapMinutes?: number;
  /** draw the gaps dashed (default) or as solid as the rest of the line */
  readonly dashGaps?: boolean;
}

/** draw `samples` on `svg`, or update what is drawn there to them */
export const drawCurve = (
  svg: Svg,
  samples: ReadonlyArray<Sample>,
  {
    id,
    live,
    duration = 0,
    curve = "linear",
    points = false,
    gapMinutes = DEFAULT_GAP_MINUTES,
    dashGaps = true,
  }: DrawOptions,
) => {
  const last = samples.at(-1);
  if (!last) return;
  const frame = frameFor(samples, live);
  const previous = frameOf(svg);
  const changed = previous !== null && frameKey(previous) !== frameKey(frame);
  const t: AnyTransition | null =
    changed && duration > 0 ? svg.transition("frame").duration(duration).ease(easeCubicOut) : null;
  const now = scales(frame);
  // where things were: new elements start there, then move with the rest
  const before = scales(previous ?? frame);

  svg
    .attr("viewBox", `0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`)
    .attr("aria-hidden", "true")
    .attr("data-frame", frameKey(frame));

  // ---- defs: the area's gradient (user space, the area grows under it) and the plot's clip ----
  const defs = one(svg, "defs", "curve-defs");
  one(defs, "linearGradient", "curve-gradient")
    .attr("id", `${id}-gradient`)
    .attr("gradientUnits", "userSpaceOnUse")
    .attr("x1", 0)
    .attr("x2", 0)
    .attr("y1", PLOT_TOP)
    .attr("y2", PLOT_BOTTOM)
    .selectAll("stop")
    .data(["top", "bottom"])
    .join("stop")
    .attr("class", (d: string) => `curve-gradient-${d}`)
    .attr("offset", (_: string, i: number) => i);
  one(one(defs, "clipPath", "curve-clip").attr("id", `${id}-clip`), "rect", "curve-clip-rect")
    .attr("x", PLOT_LEFT - 4)
    .attr("y", PLOT_TOP - 8)
    .attr("width", PLOT_RIGHT - PLOT_LEFT + 8)
    .attr("height", PLOT_BOTTOM - PLOT_TOP + 12);

  // ---- grey bands, every other time unit ----
  const unit = TIME_UNITS.find((u) => (frame.end - frame.start) / u <= MAX_BANDS) ?? 240;
  const boundaries: Array<number> = [];
  for (let m = Math.ceil(frame.start / unit) * unit; m <= frame.end; m += unit) boundaries.push(m);
  const bandStarts = [frame.start, ...boundaries].filter((m) => Math.floor(m / unit) % 2 === 1 && m < frame.end);
  const bandEnd = (m: number, f: Frame) => Math.min(f.end, Math.floor(m / unit) * unit + unit);
  const bands = one(svg, "g", "curve-bands")
    .selectAll("rect")
    .data(bandStarts, keyed<number>((m) => m))
    .join(
      (enter: AnySelection) =>
        enter
          .append("rect")
          .attr("class", "curve-band")
          .attr("data-key", (m: number) => m)
          .attr("y", PLOT_TOP)
          .attr("height", PLOT_BOTTOM - PLOT_TOP)
          .attr("x", (m: number) => before.x(m))
          .attr("width", (m: number) => Math.max(0, before.x(bandEnd(m, previous ?? frame)) - before.x(m))),
      (update: AnySelection) => update,
      (exit: AnySelection) => exit.remove(),
    );
  to(bands, t)
    .attr("x", (m: number) => now.x(m))
    .attr("width", (m: number) => now.x(bandEnd(m, frame)) - now.x(m));

  // ---- horizontal grid lines and both y-axes (5 fixed rows; only the labels change) ----
  const rows = Array.from({ length: Y_INTERVALS + 1 }, (_, i) => i);
  const rowY = (i: number) => now.yKwh(i * frame.kwhStep);
  one(svg, "g", "curve-grid")
    .selectAll("line")
    .data(rows, keyed<number>((i) => i))
    .join("line")
    .attr("data-key", (i: number) => i)
    .attr("x1", PLOT_LEFT)
    .attr("x2", PLOT_RIGHT)
    .attr("y1", rowY)
    .attr("y2", rowY);
  one(svg, "g", "curve-ticks-kwh")
    .selectAll("text")
    .data(rows, keyed<number>((i) => i))
    .join("text")
    .attr("data-key", (i: number) => i)
    // on the plot's edge; the gap to it is CSS (screen pixels at any width)
    .attr("class", "curve-tick curve-tick--kwh")
    .attr("x", PLOT_LEFT)
    .attr("y", rowY)
    .attr("text-anchor", "end")
    .attr("dominant-baseline", "middle")
    .text((i: number) => `${fmtTick.format(i * frame.kwhStep)} kWh`);
  one(svg, "g", "curve-ticks-kw")
    .selectAll("text")
    .data(rows, keyed<number>((i) => i))
    .join("text")
    .attr("data-key", (i: number) => i)
    .attr("class", "curve-tick curve-tick--kw")
    .attr("x", PLOT_RIGHT)
    .attr("y", rowY)
    .attr("dominant-baseline", "middle")
    .text((i: number) => `${fmtTick.format(i * frame.kwStep)} kW`);

  // ---- x-axis: start, end, and the band boundaries that do not crowd them ----
  const xTicks = [
    frame.start,
    ...boundaries.filter(
      (m) => now.x(m) - now.x(frame.start) > TICK_GAP && (m === frame.end || now.x(frame.end) - now.x(m) > TICK_GAP),
    ),
    ...(boundaries.includes(frame.end) ? [] : [frame.end]),
  ];
  const ticks = one(svg, "g", "curve-ticks-time")
    .selectAll("text")
    .data(xTicks, keyed<number>((m) => m))
    .join(
      (enter: AnySelection) =>
        enter
          .append("text")
          .attr("class", "curve-tick curve-tick--time")
          .attr("data-key", (m: number) => m)
          .attr("y", PLOT_BOTTOM)
          .attr("dominant-baseline", "hanging")
          .attr("text-anchor", "middle")
          .attr("x", (m: number) => before.x(m))
          .attr("opacity", t ? 0 : 1)
          .text(clock),
      (update: AnySelection) => update,
      (exit: AnySelection) =>
        t
          ? exit
              .transition(t)
              .attr("x", (m: number) => now.x(m))
              .attr("opacity", 0)
              .remove()
          : exit.remove(),
    );
  // keep the labels in time order in the DOM (narrow charts hide every other one by position)
  ticks.order();
  to(ticks, t)
    .attr("x", (m: number) => now.x(m))
    .attr("opacity", 1);

  // ---- axis titles ----
  const middle = (PLOT_TOP + PLOT_BOTTOM) / 2;
  one(svg, "text", "curve-title-kwh")
    .attr("transform", `translate(22 ${middle}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text("Lademenge");
  one(svg, "text", "curve-title-kw")
    .attr("transform", `translate(${VIEW_WIDTH - 22} ${middle}) rotate(90)`)
    .attr("text-anchor", "middle")
    .text("Ladeleistung");

  // ---- curves ----
  // The area is one path under all readings. Each line is two paths: solid where readings are
  // close, dashed across the gaps between them (see splitAtGaps); the dashed one is under it.
  // On a frame change the new samples are first drawn in the old scales (clipped), then all
  // points move to the new ones: same number of points before and after, so D3 interpolates
  // the paths point by point.
  const factory = curves[curve];
  // not dashing the gaps: no gap is long enough, so every reading joins the solid line
  const { solid, bridges } = splitAtGaps(samples, dashGaps ? gapMinutes : Number.POSITIVE_INFINITY);
  const defined = (d: Point): d is Sample => d !== null;
  const shapes = (s: Scales) => ({
    area: (data: ReadonlyArray<Point>) =>
      area<Point>()
        .curve(factory)
        .defined(defined)
        .x((d) => s.x(d!.minute))
        .y0(PLOT_BOTTOM)
        .y1((d) => s.yKw(d!.kw))(data as Array<Point>),
    power: (data: ReadonlyArray<Point>) =>
      line<Point>()
        .curve(factory)
        .defined(defined)
        .x((d) => s.x(d!.minute))
        .y((d) => s.yKw(d!.kw))(data as Array<Point>),
    energy: (data: ReadonlyArray<Point>) =>
      line<Point>()
        .curve(factory)
        .defined(defined)
        .x((d) => s.x(d!.minute))
        .y((d) => s.yKwh(d!.kwh))(data as Array<Point>),
  });
  const from = shapes(before);
  const into = shapes(now);
  const plot = one(svg, "g", "curve-curves").attr("clip-path", `url(#${id}-clip)`);
  // creation order is drawing order: area, then the dashed gaps, then the solid lines
  const paths = [
    ["curve-area", "area", samples],
    ["curve-power-gap", "power", bridges],
    ["curve-energy-gap", "energy", bridges],
    ["curve-power", "power", solid],
    ["curve-energy", "energy", solid],
  ] as const;
  for (const [cls, shape, data] of paths) {
    const path = one(plot, "path", cls).datum(data);
    if (shape === "area") path.attr("fill", `url(#${id}-gradient)`);
    if (t) path.attr("d", from[shape](data) ?? "");
    to(path, t).attr("d", into[shape](data) ?? "");
  }

  // ---- the readings as dots (optional), keyed by minute like everything else ----
  for (const [name, y] of [
    ["kw", (d: Sample, s: Scales) => s.yKw(d.kw)],
    ["kwh", (d: Sample, s: Scales) => s.yKwh(d.kwh)],
  ] as const) {
    const dots = one(plot, "g", `curve-points-${name}`)
      .selectAll("circle")
      .data(points ? samples : [], keyed<Sample>((d) => d.minute))
      .join(
        (enter: AnySelection) =>
          enter
            .append("circle")
            .attr("data-key", (d: Sample) => d.minute)
            .attr("cx", (d: Sample) => before.x(d.minute))
            .attr("cy", (d: Sample) => y(d, before)),
        (update: AnySelection) => update,
        (exit: AnySelection) => exit.remove(),
      );
    to(dots, t)
      .attr("cx", (d: Sample) => now.x(d.minute))
      .attr("cy", (d: Sample) => y(d, now));
  }

  // ---- end marker: the newest energy value ----
  // right of and below the point while there is room (a live session), else left of and above it
  const endX = now.x(last.minute);
  const endY = now.yKwh(last.kwh);
  const right = endX + 100 <= PLOT_RIGHT;
  const end = one(svg, "g", "curve-end-marker").datum(last);
  to(one(end, "circle", "curve-end").attr("r", 6), t)
    .attr("cx", endX)
    .attr("cy", endY);
  to(one(end, "text", "curve-end-label").text(kwhText(last)).attr("text-anchor", right ? "start" : "end"), t)
    .attr("x", right ? endX + 10 : endX - 12)
    .attr("y", right ? endY + 26 : endY - 14);

  // ---- slider (moved by moveSlider) and the pointer surface on top ----
  const slider = one(svg, "g", "curve-slider");
  one(slider, "line", "curve-slider-line").attr("y1", PLOT_TOP).attr("y2", PLOT_BOTTOM);
  one(slider, "circle", "curve-marker-kw").attr("r", 6);
  one(slider, "circle", "curve-marker-kwh").attr("r", 6);
  one(svg, "rect", "curve-overlay")
    .attr("x", PLOT_LEFT)
    .attr("y", PLOT_TOP)
    .attr("width", PLOT_RIGHT - PLOT_LEFT)
    .attr("height", PLOT_BOTTOM - PLOT_TOP);
};

/** put the slider on a sample, in the frame the SVG has (with a transition when given) */
export const moveSlider = (svg: Svg, sample: Sample, duration = 0) => {
  const frame = frameOf(svg);
  if (!frame) return;
  const { x, yKw, yKwh } = scales(frame);
  const t = duration > 0 ? svg.transition("slider").duration(duration).ease(easeCubicOut) : null;
  const sx = x(sample.minute);
  to(svg.select(".curve-slider-line"), t).attr("x1", sx).attr("x2", sx);
  to(svg.select(".curve-marker-kw"), t).attr("cx", sx).attr("cy", yKw(sample.kw));
  to(svg.select(".curve-marker-kwh"), t).attr("cx", sx).attr("cy", yKwh(sample.kwh));
};

/** where the tooltip goes, as a share of the width (0–1), for a sample in a frame */
export const shareOf = (frame: Frame, sample: Sample) => scales(frame).x(sample.minute) / VIEW_WIDTH;
