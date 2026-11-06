/**
 * <grid-flow>: a CSS grid whose blocks are as tall as their content, each pushed down only by
 * the blocks above it in the columns it covers. A plain grid cannot do that: its rows are shared,
 * so one tall block makes its whole row (and everything spanning it) taller.
 *
 * Each child says where it goes with custom properties: --row (order: top to bottom), --column
 * and --span (columns, 1-based). grid-flow.css sets them from the --wide-* or --narrow-* values on
 * the child's style attribute, per screen size, so media queries decide, not this script.
 * Without this script, grid-flow.css places the blocks on rows of their own.
 *
 * With it, [data-flowing] puts every block in grid row 1 (aligned to the top), and this sets
 * each block's margin-top to just below the lowest block above it in its columns, plus the row
 * gap. It runs again whenever a block or the grid changes size (content, fonts, breakpoints),
 * straight from the ResizeObserver callback: after layout, before paint, so nothing flickers.
 * Margins do not change a block's size, so this does not loop.
 *
 * Standalone: copy this file and grid-flow.css to use a pattern in another page.
 */

interface Item {
  readonly el: HTMLElement;
  readonly row: number;
  readonly column: number;
  readonly span: number;
  readonly height: number;
}

const property = (style: CSSStyleDeclaration, name: string, fallback: number) => {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
};

export class GridFlow extends HTMLElement {
  #width = -1;
  readonly #resized = new ResizeObserver((entries) => {
    // the grid's own height changes with the margins set here: only its width counts
    const relevant = entries.some((entry) => {
      if (entry.target !== this) return true;
      const changed = entry.contentRect.width !== this.#width;
      this.#width = entry.contentRect.width;
      return changed;
    });
    if (relevant) this.layout();
  });
  readonly #changed = new MutationObserver(() => this.#observe());

  connectedCallback() {
    this.dataset["flowing"] = "";
    this.#changed.observe(this, { childList: true });
    this.#observe();
  }

  disconnectedCallback() {
    this.#resized.disconnect();
    this.#changed.disconnect();
    delete this.dataset["flowing"];
  }

  /** watch the grid and every block (again after children change); observing reports the current sizes, which lays out */
  #observe() {
    this.#resized.disconnect();
    this.#width = -1;
    this.#resized.observe(this);
    for (const child of this.children) this.#resized.observe(child);
  }

  /** measure everything first, then set every margin: one layout pass */
  layout() {
    const gap = Number.parseFloat(getComputedStyle(this).rowGap) || 0;
    const items: Array<Item> = [];
    for (const el of this.children) {
      if (!(el instanceof HTMLElement)) continue;
      const style = getComputedStyle(el);
      if (style.display === "none") continue;
      items.push({
        el,
        row: property(style, "--row", 1),
        column: property(style, "--column", 1),
        span: property(style, "--span", 1),
        height: el.getBoundingClientRect().height,
      });
    }
    items.sort((a, b) => a.row - b.row || a.column - b.column);

    const placed: Array<{ readonly column: number; readonly span: number; readonly bottom: number }> = [];
    const tops = items.map((item) => {
      const above = placed.filter((p) => p.column < item.column + item.span && item.column < p.column + p.span);
      const top = Math.max(0, ...above.map((p) => p.bottom + gap));
      placed.push({ column: item.column, span: item.span, bottom: top + item.height });
      return top;
    });
    items.forEach((item, i) => {
      item.el.style.marginTop = `${tops[i]}px`;
    });
  }
}

if (!customElements.get("grid-flow")) customElements.define("grid-flow", GridFlow);
