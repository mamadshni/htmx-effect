/**
 * <charge-curve>: the charging curve of a charging session, drawn with D3.
 *
 * Data: a child <script type="application/json" data-samples> with [{ minute, kw, kwh }]
 * (minute = minutes since midnight). The element redraws when that script is replaced or
 * changed (e.g. by an htmx swap) and when its width changes.
 *
 * - power (kW) as a line with a gradient area, on the right scale; energy (kWh) as a line on
 *   the left scale; both scales get the same number of ticks so the grid lines fit both
 * - grey bands every other time unit; the unit adapts to the session's length
 * - one slider (role="slider"): mouse hover, touch drag and the arrow keys move it; it marks
 *   where it crosses both curves and its tooltip shows the values at that time
 * - attributes: `min-minutes` (placeholder until there are that many minutes of samples),
 *   `live` (the slider follows the newest sample while it is at the end)
 */

import { area, axisBottom, axisLeft, axisRight, bisector, curveMonotoneX, line, scaleLinear, select } from "d3";

interface Sample {
  readonly minute: number;
  readonly kw: number;
  readonly kwh: number;
}

type Svg = ReturnType<typeof select<SVGSVGElement, unknown>>;

/** under this width the chart drops the axis titles and uses fewer ticks */
const COMPACT_WIDTH = 520;
/** the x-axis spans at least this many minutes, so a short session is not stretched */
const MIN_DOMAIN_MINUTES = 30;
/** each y-axis goes up to at least this value */
const MIN_Y = 1;
/** number of intervals on both y-axes (5 grid lines including 0) */
const Y_INTERVALS = 4;
/** candidate time units for the bands and x ticks, in minutes */
const TIME_UNITS = [5, 10, 15, 30, 60, 120, 240];

const fmtKwh = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKw = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtTick = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 });

const clock = (minute: number) => {
  const m = Math.round(minute);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** the smallest "nice" step (1, 2, 2.5, 3, 4, 5 × 10^n) such that `intervals` steps cover `max` */
const niceStep = (max: number, intervals: number) => {
  const raw = Math.max(max, MIN_Y) / intervals;
  const power = 10 ** Math.floor(Math.log10(raw));
  const factor = [1, 2, 2.5, 3, 4, 5, 10].find((f) => f * power >= raw - 1e-9) ?? 10;
  return factor * power;
};

/** the smallest time unit giving at most `maxBands` intervals over `minutes` */
const timeUnit = (minutes: number, maxBands: number) =>
  TIME_UNITS.find((unit) => minutes / unit <= maxBands) ?? TIME_UNITS[TIME_UNITS.length - 1]!;

let nextId = 0;

class ChargeCurve extends HTMLElement {
  #samples: ReadonlyArray<Sample> = [];
  /** index of the sample the slider is on; null: not placed yet (goes to the end) */
  #index: number | null = null;
  #root: HTMLDivElement | null = null;
  #width = 0;
  #id = `charge-curve-${++nextId}`;
  #observer = new MutationObserver(() => this.#read());
  #resize = new ResizeObserver((entries) => {
    const width = Math.floor(entries[0]?.contentRect.width ?? 0);
    if (width !== this.#width) {
      this.#width = width;
      this.#render();
    }
  });
  /** the parts the slider moves, set by #render */
  #slider: ((index: number) => void) | null = null;

  connectedCallback() {
    this.#root ??= this.#createRoot();
    this.#observer.observe(this, { childList: true, subtree: true, characterData: true });
    this.#resize.observe(this);
    this.#read();
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    this.#resize.disconnect();
  }

  get #minMinutes() {
    const value = Number(this.getAttribute("min-minutes") ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  #createRoot() {
    const root = document.createElement("div");
    root.className = "curve-root";
    root.addEventListener("keydown", (event) => this.#onKey(event));
    this.append(root);
    return root;
  }

  /** read the samples from the JSON child; keep the previous ones if it is invalid */
  #read() {
    const script = this.querySelector<HTMLScriptElement>("script[data-samples]");
    if (!script) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(script.textContent ?? "[]");
    } catch {
      console.warn("<charge-curve>: invalid samples JSON");
      return;
    }
    if (!Array.isArray(parsed)) return;
    const samples = parsed.filter(
      (s): s is Sample =>
        typeof s === "object" &&
        s !== null &&
        Number.isFinite(s.minute) &&
        Number.isFinite(s.kw) &&
        Number.isFinite(s.kwh),
    );
    if (samples.length === this.#samples.length && samples.at(-1)?.minute === this.#samples.at(-1)?.minute) return;
    // live: a slider at the end follows the newest sample; elsewhere it stays on its time
    const atEnd = this.#index === null || this.#index === this.#samples.length - 1;
    const minute = this.#index === null ? null : this.#samples[this.#index]?.minute;
    this.#samples = samples;
    if (atEnd && (this.hasAttribute("live") || this.#index === null)) this.#index = null;
    else if (minute != null) this.#index = Math.max(0, samples.findIndex((s) => s.minute >= minute));
    this.#render();
  }

  #onKey(event: KeyboardEvent) {
    const last = this.#samples.length - 1;
    if (last < 0 || this.#slider === null) return;
    const current = this.#index ?? last;
    const big = 10;
    const target = (() => {
      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          return current - (event.shiftKey ? big : 1);
        case "ArrowRight":
        case "ArrowUp":
          return current + (event.shiftKey ? big : 1);
        case "PageDown":
          return current - big;
        case "PageUp":
          return current + big;
        case "Home":
          return 0;
        case "End":
          return last;
        default:
          return null;
      }
    })();
    if (target === null) return;
    event.preventDefault();
    this.#slider(Math.min(last, Math.max(0, target)));
  }

  #render() {
    const root = this.#root;
    if (!root || this.#width === 0) return;
    const samples = this.#samples;
    const first = samples[0];
    const latest = samples.at(-1);

    // too little data yet: a placeholder instead of a curve that says nothing
    if (!first || !latest || latest.minute - first.minute < this.#minMinutes) {
      this.#slider = null;
      root.removeAttribute("role");
      root.removeAttribute("tabindex");
      root.replaceChildren(
        Object.assign(document.createElement("p"), {
          className: "curve-placeholder",
          textContent: first
            ? `Ladevorgang gestartet. Die Ladekurve erscheint nach ${this.#minMinutes} Minuten.`
            : "Noch keine Messwerte.",
        }),
      );
      return;
    }

    const compact = this.#width < COMPACT_WIDTH;
    const width = this.#width;
    const height = compact ? 240 : 380;
    const margin = compact
      ? { top: 16, right: 44, bottom: 28, left: 52 }
      : { top: 20, right: 84, bottom: 32, left: 96 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // ---- scales ----
    const start = first.minute;
    const end = Math.max(latest.minute, start + MIN_DOMAIN_MINUTES);
    const x = scaleLinear().domain([start, end]).range([0, innerWidth]);
    const kwhStep = niceStep(Math.max(...samples.map((s) => s.kwh)), Y_INTERVALS);
    const kwStep = niceStep(Math.max(...samples.map((s) => s.kw)), Y_INTERVALS);
    const yKwh = scaleLinear().domain([0, kwhStep * Y_INTERVALS]).range([innerHeight, 0]);
    const yKw = scaleLinear().domain([0, kwStep * Y_INTERVALS]).range([innerHeight, 0]);
    const tickCount = compact ? 2 : Y_INTERVALS;
    const kwhTicks = Array.from({ length: Y_INTERVALS + 1 }, (_, i) => i * kwhStep).filter(
      (_, i) => i % (Y_INTERVALS / tickCount) === 0,
    );
    const kwTicks = kwhTicks.map((v) => (v / kwhStep) * kwStep);

    // time unit for bands and x ticks: dynamic, from the domain's length
    const unit = timeUnit(end - start, compact ? 4 : 8);
    const firstBoundary = Math.ceil(start / unit) * unit;
    const boundaries: Array<number> = [];
    for (let m = firstBoundary; m <= end; m += unit) boundaries.push(m);

    // ---- svg ----
    root.replaceChildren();
    root.setAttribute("role", "slider");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", this.getAttribute("aria-label") ?? "Ladekurve");
    root.setAttribute("aria-valuemin", String(0));
    root.setAttribute("aria-valuemax", String(samples.length - 1));

    const svg: Svg = select(root)
      .append("svg")
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("height", height)
      .attr("aria-hidden", "true");
    const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const gradientId = `${this.#id}-gradient`;
    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", gradientId)
      .attr("x1", 0)
      .attr("x2", 0)
      .attr("y1", 0)
      .attr("y2", 1);
    gradient.append("stop").attr("offset", "0%").style("stop-color", "var(--curve-power)").attr("stop-opacity", 0.32);
    gradient.append("stop").attr("offset", "100%").style("stop-color", "var(--curve-power)").attr("stop-opacity", 0.02);

    // grey bands: every other time unit, clipped to the plot
    plot
      .append("g")
      .selectAll("rect")
      .data([start, ...boundaries].filter((m) => Math.floor(m / unit) % 2 === 1))
      .join("rect")
      .attr("x", (m) => x(m))
      .attr("width", (m) => x(Math.min(end, Math.floor(m / unit) * unit + unit)) - x(m))
      .attr("y", 0)
      .attr("height", innerHeight)
      .style("fill", "var(--curve-band)");

    // horizontal grid lines (shared by both scales)
    plot
      .append("g")
      .selectAll("line")
      .data(kwhTicks)
      .join("line")
      .attr("x1", 0)
      .attr("x2", innerWidth)
      .attr("y1", (v) => yKwh(v))
      .attr("y2", (v) => yKwh(v))
      .style("stroke", "var(--curve-grid)")
      .attr("stroke-width", 1)
      .attr("shape-rendering", "crispEdges");

    // ---- axes ----
    const leftAxis = plot
      .append("g")
      .attr("class", "curve-axis")
      .call(
        axisLeft(yKwh)
          .tickValues(kwhTicks)
          .tickSize(0)
          .tickPadding(compact ? 6 : 16)
          .tickFormat((v) => `${fmtTick.format(Number(v))} kWh`),
      );
    const rightAxis = plot
      .append("g")
      .attr("class", "curve-axis")
      .attr("transform", `translate(${innerWidth},0)`)
      .call(
        axisRight(yKw)
          .tickValues(kwTicks)
          .tickSize(0)
          .tickPadding(compact ? 6 : 16)
          .tickFormat((v) => `${fmtTick.format(Number(v))} kW`),
      );
    const xTicks = boundaries.filter((m) => x(m) > 24 && x(m) < innerWidth - 24);
    const bottomAxis = plot
      .append("g")
      .attr("class", "curve-axis")
      .attr("transform", `translate(0,${innerHeight})`)
      .call(
        axisBottom(x)
          .tickValues([start, ...xTicks, ...(compact ? [] : [latest.minute])])
          .tickSize(0)
          .tickPadding(10)
          .tickFormat((m) => clock(Number(m))),
      );
    for (const axis of [leftAxis, rightAxis, bottomAxis]) axis.select(".domain").remove();
    // the last sample's time ends the axis; drop a tick that would overlap it
    if (!compact) {
      const lastX = x(latest.minute);
      bottomAxis
        .selectAll<SVGGElement, number>(".tick")
        .filter((m) => m !== latest.minute && Math.abs(x(m) - lastX) < 36)
        .remove();
    }

    if (!compact) {
      plot
        .append("text")
        .attr("class", "curve-axis-title")
        .attr("transform", `translate(${-margin.left + 14},${innerHeight / 2}) rotate(-90)`)
        .attr("text-anchor", "middle")
        .text("Lademenge");
      plot
        .append("text")
        .attr("class", "curve-axis-title")
        .attr("transform", `translate(${innerWidth + margin.right - 14},${innerHeight / 2}) rotate(90)`)
        .attr("text-anchor", "middle")
        .text("Ladeleistung");
    }

    // ---- curves ----
    plot
      .append("path")
      .datum(samples)
      .attr("fill", `url(#${gradientId})`)
      .attr(
        "d",
        area<Sample>()
          .curve(curveMonotoneX)
          .x((s) => x(s.minute))
          .y0(innerHeight)
          .y1((s) => yKw(s.kw)),
      );
    plot
      .append("path")
      .datum(samples)
      .attr("fill", "none")
      .style("stroke", "var(--curve-power)")
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round")
      .attr(
        "d",
        line<Sample>()
          .curve(curveMonotoneX)
          .x((s) => x(s.minute))
          .y((s) => yKw(s.kw)),
      );
    plot
      .append("path")
      .datum(samples)
      .attr("fill", "none")
      .style("stroke", "var(--curve-energy)")
      .attr("stroke-width", 2)
      .attr("stroke-linejoin", "round")
      .attr(
        "d",
        line<Sample>()
          .curve(curveMonotoneX)
          .x((s) => x(s.minute))
          .y((s) => yKwh(s.kwh)),
      );

    // the newest energy value, labelled directly at the end of its line
    const endX = x(latest.minute);
    const endY = yKwh(latest.kwh);
    plot
      .append("circle")
      .attr("cx", endX)
      .attr("cy", endY)
      .attr("r", 5)
      .style("fill", "var(--surface)")
      .style("stroke", "var(--curve-energy)")
      .attr("stroke-width", 2);
    // below and right of the point while there is room inside the plot (a live session), else
    // above and left of it, so it never runs into the right axis
    const labelRight = endX + 90 <= innerWidth;
    const endLabel = plot
      .append("text")
      .attr("class", "curve-end-label")
      .attr("x", labelRight ? endX + 8 : endX - 10)
      .attr("y", labelRight ? endY + 22 : endY - 12)
      .attr("text-anchor", labelRight ? "start" : "end")
      .text(`${fmtKwh.format(latest.kwh)} kWh`);

    // ---- slider ----
    const slider = plot.append("g").attr("pointer-events", "none");
    const sliderLine = slider
      .append("line")
      .attr("y1", 0)
      .attr("y2", innerHeight)
      .style("stroke", "var(--curve-ink)")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "3 3");
    const marker = (color: string) =>
      slider
        .append("circle")
        .attr("r", 5)
        .style("fill", color)
        .style("stroke", "var(--surface)")
        .attr("stroke-width", 2);
    const powerMarker = marker("var(--curve-power)");
    const energyMarker = marker("var(--curve-energy)");

    const tooltip = document.createElement("div");
    tooltip.className = "curve-tooltip";
    tooltip.setAttribute("aria-hidden", "true");
    const time = tooltip.appendChild(Object.assign(document.createElement("span"), { className: "curve-tooltip__time" }));
    const row = (swatch: string, label: string) => {
      const el = tooltip.appendChild(Object.assign(document.createElement("span"), { className: "curve-tooltip__row" }));
      el.append(Object.assign(document.createElement("span"), { className: swatch }), label);
      return el.appendChild(document.createElement("strong"));
    };
    const powerValue = row("curve-legend__dot", "Ladeleistung");
    const energyValue = row("curve-legend__line", "Lademenge");
    root.append(tooltip);

    const move = (index: number) => {
      const s = samples[index];
      if (!s) return;
      this.#index = index === samples.length - 1 && this.hasAttribute("live") ? null : index;
      const sx = x(s.minute);
      sliderLine.attr("x1", sx).attr("x2", sx);
      powerMarker.attr("cx", sx).attr("cy", yKw(s.kw));
      energyMarker.attr("cx", sx).attr("cy", yKwh(s.kwh));
      // on the last sample the tooltip shows the same value and would cover the label
      endLabel.attr("visibility", index === samples.length - 1 ? "hidden" : null);
      time.textContent = `${clock(s.minute)} Uhr`;
      powerValue.textContent = `${fmtKw.format(s.kw)} kW`;
      energyValue.textContent = `${fmtKwh.format(s.kwh)} kWh`;
      // compact: tooltip pinned to the top edge, beside the slider; wide: next to it, flipped near the right edge
      const tipWidth = tooltip.offsetWidth;
      const left = margin.left + sx + 12;
      tooltip.style.insetInlineStart = `${left + tipWidth > width ? margin.left + sx - 12 - tipWidth : left}px`;
      tooltip.style.insetBlockStart = compact ? "0" : `${margin.top + 8}px`;
      root.setAttribute("aria-valuenow", String(index));
      root.setAttribute(
        "aria-valuetext",
        `${clock(s.minute)} Uhr: Ladeleistung ${fmtKw.format(s.kw)} kW, Lademenge ${fmtKwh.format(s.kwh)} kWh`,
      );
    };
    this.#slider = move;

    // pointer: hover (mouse) or drag (touch, pen) moves the slider to the nearest sample
    const nearest = bisector<Sample, number>((s) => s.minute).center;
    const fromPointer = (event: PointerEvent) => {
      const rect = (svg.node() as SVGSVGElement).getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * width - margin.left;
      move(nearest(samples, x.invert(Math.min(innerWidth, Math.max(0, px)))));
    };
    svg
      .append("rect")
      .attr("x", margin.left)
      .attr("y", margin.top)
      .attr("width", innerWidth)
      .attr("height", innerHeight)
      .attr("fill", "transparent")
      .on("pointerdown", (event: PointerEvent) => {
        (event.currentTarget as Element).setPointerCapture(event.pointerId);
        fromPointer(event);
      })
      .on("pointermove", (event: PointerEvent) => {
        if (event.pointerType === "mouse" || (event.currentTarget as Element).hasPointerCapture(event.pointerId)) {
          fromPointer(event);
        }
      });

    move(Math.min(this.#index ?? samples.length - 1, samples.length - 1));

    // ---- legend ----
    const legend = document.createElement("ul");
    legend.className = "curve-legend";
    legend.setAttribute("aria-hidden", "true");
    for (const [swatch, label] of [
      ["curve-legend__dot", "Ladeleistung in kW"],
      ["curve-legend__line", "Lademenge in kWh"],
    ] as const) {
      const item = legend.appendChild(document.createElement("li"));
      item.append(Object.assign(document.createElement("span"), { className: swatch }), label);
    }
    root.append(legend);
  }
}

customElements.define("charge-curve", ChargeCurve);
