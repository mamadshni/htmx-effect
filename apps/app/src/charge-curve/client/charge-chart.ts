/**
 * <charge-chart>: a charging curve fed by its <data> children, drawn with D3 (draw.ts).
 *
 *   <charge-chart id="…" live min-minutes="3">
 *     <data value="570,0,0">09:30 Uhr: 0,0 kW, 0,00 kWh</data>
 *     <data value="571,1.44,0.012">09:31 Uhr: 1,4 kW, 0,01 kWh</data>
 *     …
 *   </charge-chart>
 *
 * `value` is "minute,kW,kWh" (minute = minutes since midnight, with a fraction for the seconds:
 * readings come at irregular times). Add or remove <data> children
 * (e.g. htmx `hx-swap-oob="beforeend:#id"`) and the chart calls drawCurve again: D3 joins the
 * samples into the SVG it has (the server's, at first), so new ones are appended and, when the
 * scales change, everything moves to them with a transition.
 *
 * Attributes: `live` (the x-axis leaves room for samples to come), `min-minutes` (a
 * placeholder until the samples span that many minutes), `curve` (the D3 interpolation, see
 * `curves` in draw.ts; changing it redraws), `points` (a dot on each reading), `gap-minutes`
 * (readings further apart are joined by a dashed line: nothing was measured between them;
 * default 5), `gaps="solid"` (join them with the same solid line instead).
 *
 * Controls: a <select data-chart="<id>" data-chart-attribute="curve"> sets that attribute on
 * that chart when it changes (an empty value removes it); see the bottom of this file.
 *
 * The element is also the slider (role="slider", set by the server): mouse hover or touch drag
 * (d3.pointer + bisector), keys ←/→ (Shift: 10), Page Up/Down (10), Home/End. At the end it
 * follows new samples; elsewhere it stays on its minute.
 */

import { bisector, pointer, select } from "d3";
import {
  DEFAULT_GAP_MINUTES,
  VIEW_WIDTH,
  clock,
  drawCurve,
  frameOf,
  isCurveName,
  kwhText,
  kwText,
  moveSlider,
  type Sample,
  type Svg,
  scales,
  shareOf,
  valueText,
} from "../draw.js";

/** transition length when the scales change (ms) */
const DURATION = 600;
const BIG_STEP = 10;
/** past this share of the width the tooltip shows left of the slider */
const FLIP_AT = 0.55;

const nearest = bisector<Sample, number>((s) => s.minute).center;

/** "minute,kW,kWh" → a sample; null when it is not three finite numbers */
const parseValue = (value: string): Sample | null => {
  const [minute, kw, kwh] = value.split(",").map(Number);
  return minute !== undefined && kw !== undefined && kwh !== undefined && [minute, kw, kwh].every(Number.isFinite)
    ? { minute, kw, kwh }
    : null;
};

class ChargeChart extends HTMLElement {
  #samples: ReadonlyArray<Sample> = [];
  /** the minute the slider is on; null: follow the newest sample */
  #minute: number | null = null;
  #dragging = false;
  /**
   * Keeps text, markers and lines at their screen size whatever the chart's width (see the CSS).
   * Set on the plot, not on the chart itself: when htmx swaps a chart in, it puts the server's
   * attributes back on the element with that id a moment later (settling), style included.
   */
  #resize = new ResizeObserver(([entry]) => {
    const width = entry?.contentRect.width ?? 0;
    const plot = this.querySelector<HTMLElement>(":scope > .curve-plot");
    if (width > 0) plot?.style.setProperty("--curve-scale", (VIEW_WIDTH / width).toFixed(4));
  });
  #observer = new MutationObserver((records) => {
    // only <data> children matter (not the SVG and tooltip the chart changes itself)
    const touched = records.some((r) =>
      [...r.addedNodes, ...r.removedNodes].some((n) => n instanceof HTMLDataElement),
    );
    if (touched) this.#update(DURATION);
  });

  static observedAttributes = ["curve", "points", "gap-minutes", "gaps"];

  /** another interpolation or dots on/off: draw again (same frame, so no transition) */
  attributeChangedCallback() {
    if (this.isConnected) this.#update(0);
  }

  connectedCallback() {
    this.#observer.observe(this, { childList: true });
    this.#resize.observe(this);
    this.addEventListener("keydown", this.#onKey);
    this.addEventListener("pointerdown", this.#onPointerDown);
    this.addEventListener("pointermove", this.#onPointerMove);
    this.addEventListener("pointerup", this.#onPointerUp);
    this.addEventListener("pointercancel", this.#onPointerUp);
    // the first draw adopts the SVG the server drew (no transition: nothing changes)
    this.#update(0);
  }

  disconnectedCallback() {
    this.#observer.disconnect();
    this.#resize.disconnect();
  }

  /** the samples from the <data> children, by time, one per minute */
  #read(): ReadonlyArray<Sample> {
    const byMinute = new Map<number, Sample>();
    for (const data of this.querySelectorAll<HTMLDataElement>(":scope > data")) {
      const sample = parseValue(data.value);
      if (sample) byMinute.set(sample.minute, sample);
      else console.warn("<charge-chart>: ignored <data value=%o> (expected minute,kW,kWh)", data.value);
    }
    return [...byMinute.values()].sort((a, b) => a.minute - b.minute);
  }

  get #gapMinutes() {
    const value = Number(this.getAttribute("gap-minutes") ?? DEFAULT_GAP_MINUTES);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_GAP_MINUTES;
  }

  get #minMinutes() {
    const value = Number(this.getAttribute("min-minutes") ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  get #svg(): Svg | null {
    const node = this.querySelector<SVGSVGElement>(":scope > .curve-plot > svg");
    return node ? select(node) : null;
  }

  #update(duration: number) {
    const samples = this.#read();
    this.#samples = samples;
    const plot = this.querySelector<HTMLElement>(":scope > .curve-plot");
    const first = samples[0];
    const last = samples.at(-1);
    if (!plot || !first || !last || last.minute - first.minute < this.#minMinutes) return;

    let svg = this.#svg;
    if (!svg) {
      // the first curve: the placeholder makes way for an SVG D3 draws from scratch
      plot.replaceChildren();
      svg = select(plot).append("svg") as unknown as Svg;
    }
    const curve = this.getAttribute("curve");
    if (curve !== null && !isCurveName(curve)) console.warn("<charge-chart>: unknown curve %o, drawing linear", curve);
    drawCurve(svg, samples, {
      id: this.id,
      live: this.hasAttribute("live"),
      duration,
      curve: isCurveName(curve) ? curve : "linear",
      points: this.hasAttribute("points"),
      gapMinutes: this.#gapMinutes,
      dashGaps: this.getAttribute("gaps") !== "solid",
    });
    const index = this.#minute === null ? -1 : samples.findIndex((s) => s.minute === this.#minute);
    this.#show(index < 0 ? samples.length - 1 : index, duration);
  }

  /** move the slider (and tooltip) to the `index`-th sample */
  #show(index: number, duration = 0) {
    const svg = this.#svg;
    const frame = svg && frameOf(svg);
    const samples = this.#samples;
    const i = Math.min(samples.length - 1, Math.max(0, index));
    const sample = samples[i];
    if (!svg || !frame || !sample) return;
    moveSlider(svg, sample, duration);

    const tooltip = this.querySelector<HTMLElement>(":scope > [data-curve-tooltip]");
    if (tooltip) {
      const share = shareOf(frame, sample);
      tooltip.hidden = false;
      tooltip.style.left = `${(share * 100).toFixed(2)}%`;
      tooltip.classList.toggle("is-flipped", share > FLIP_AT);
      for (const [slot, text] of [
        ["time", `${clock(sample.minute)} Uhr`],
        ["kw", kwText(sample)],
        ["kwh", kwhText(sample)],
      ] as const) {
        const el = tooltip.querySelector(`[data-slot="${slot}"]`);
        if (el) el.textContent = text;
      }
    }

    const atEnd = i === samples.length - 1;
    this.#minute = atEnd ? null : sample.minute;
    // the end label shows the same value as the tooltip there; the tooltip would cover it
    this.classList.toggle("is-at-end", atEnd);
    this.setAttribute("aria-valuemax", String(samples.length - 1));
    this.setAttribute("aria-valuenow", String(i));
    this.setAttribute("aria-valuetext", valueText(sample));
  }

  #index() {
    const index = this.#minute === null ? -1 : this.#samples.findIndex((s) => s.minute === this.#minute);
    return index < 0 ? this.#samples.length - 1 : index;
  }

  #onKey = (event: KeyboardEvent) => {
    if (event.target !== this || this.#samples.length === 0) return;
    const current = this.#index();
    const step = event.shiftKey ? BIG_STEP : 1;
    const targets: Record<string, number> = {
      ArrowLeft: current - step,
      ArrowDown: current - step,
      ArrowRight: current + step,
      ArrowUp: current + step,
      PageDown: current - BIG_STEP,
      PageUp: current + BIG_STEP,
      Home: 0,
      End: this.#samples.length - 1,
    };
    const index = targets[event.key];
    if (index === undefined) return;
    event.preventDefault();
    this.#show(index);
  };

  /** the sample under the pointer, from its position in the SVG's own units */
  #showAt(event: PointerEvent) {
    const svg = this.#svg;
    const frame = svg && frameOf(svg);
    const node = svg?.node();
    if (!frame || !node) return;
    const [px] = pointer(event, node);
    this.#show(nearest(this.#samples as Array<Sample>, scales(frame).x.invert(px)));
  }

  #onPointerDown = (event: PointerEvent) => {
    if (!(event.target instanceof Element) || !event.target.matches(".curve-overlay")) return;
    this.#dragging = true;
    // keep receiving the moves while the finger leaves the chart
    event.target.setPointerCapture(event.pointerId);
    this.#showAt(event);
  };

  #onPointerMove = (event: PointerEvent) => {
    const overOverlay = event.target instanceof Element && event.target.matches(".curve-overlay");
    if (this.#dragging || (event.pointerType === "mouse" && overOverlay)) this.#showAt(event);
  };

  #onPointerUp = () => {
    this.#dragging = false;
  };
}

customElements.define("charge-chart", ChargeChart);

// ---- controls ----

/**
 * <select data-chart="<chart id>" data-chart-attribute="<name>">: on change, the chosen value
 * becomes that attribute of that chart (an empty value removes it), which redraws it in place.
 * The page's address follows (the select's name and value in the query), so a view can be linked
 * and reloaded; the server renders the same choice.
 */
document.addEventListener("change", (event) => {
  const select = event.target;
  if (!(select instanceof HTMLSelectElement) || !select.dataset.chart || !select.dataset.chartAttribute) return;
  const chart = document.getElementById(select.dataset.chart);
  if (!chart) return;
  if (select.value) chart.setAttribute(select.dataset.chartAttribute, select.value);
  else chart.removeAttribute(select.dataset.chartAttribute);
  const url = new URL(location.href);
  url.searchParams.set(select.name, select.value);
  history.replaceState(null, "", url);
  // a text that explains the choice: <… data-describes="<select name>">, from the option's data-description
  const description = document.querySelector(`[data-describes="${CSS.escape(select.name)}"]`);
  const text = select.selectedOptions[0]?.dataset.description;
  if (description && text !== undefined) description.textContent = text;
});

/** <select data-submit>: choosing submits its form (e.g. another session: a new page) */
document.addEventListener("change", (event) => {
  const select = event.target;
  if (select instanceof HTMLSelectElement && select.hasAttribute("data-submit")) select.form?.requestSubmit();
});
