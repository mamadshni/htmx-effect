/**
 * Grid builder page: two editable layouts of the same blocks, one for wide screens (12 columns)
 * and one for narrow screens (6 columns), the blocks in neither (the palette) and the saved
 * patterns. A toggle (pure CSS, outside the workspace so htmx swaps keep it) shows one board at
 * a time. Blocks are placed by number (grid-area: row / column / span), so the browser can move
 * and resize them live; a saved pattern keeps both layouts as grid-template-areas.
 * client/grid-builder.ts does the dragging; every change is a form post the server checks
 * (routes.tsx). Answers to htmx are the whole workspace and the status message (out of band,
 * into the live region that stays on the page).
 */

import { Layout } from "../layout.js";
import { moduleAssets, type NavLink } from "../module.js";
import {
  areasValue,
  blocks,
  boardRows,
  type Columns,
  columnsOf,
  COLUMNS,
  gridArea,
  type Layout as GridLayout,
  type Layouts,
  blockStyle,
  blocksInOrder,
  layoutHtml,
  NARROW_BELOW,
  NARROW_COLUMNS,
  placementOf,
  rectOf,
  size,
  type View,
  viewLabel,
  views,
  where,
} from "./grid.js";
import { currentLayouts, MAX_NAME, type Pattern, savedPatterns } from "./store.js";

// <grid-flow> (client/grid-flow.ts): a grid whose blocks are as tall as their content
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "grid-flow": JSX.Attributes<HTMLElement> & { children?: JSX.Node };
    }
  }
}

export const nav: NavLink = { href: "/grid", label: "Grid builder" };
export const assets = moduleAssets("grid-builder", {
  styles: new URL("./grid-builder.css", import.meta.url),
  script: new URL("./client/grid-builder.ts", import.meta.url),
});

/** <grid-flow>'s stylesheet, the same for every pattern (served by routes.tsx) */
export const flowStylesPath = "/assets/grid-builder/grid-flow.css" as const;
const flowHead = (
  <>
    {assets.head}
    <link rel="stylesheet" href={flowStylesPath} />
  </>
);

export const blockId = (view: View, id: string) => `grid-block-${view}-${id}`;
export const paletteId = (id: string) => `grid-palette-${id}`;
export const loadId = (pattern: string) => `grid-pattern-${pattern}-load`;

export const GridPage = () => (
  <Layout title="Grid builder" current={nav} head={assets.head}>
    <main class="page page--wide">
      <header class="intro">
        <h1>Grid builder</h1>
        <p>
          Design the page twice: for wide screens on {COLUMNS} columns and for narrow screens on {NARROW_COLUMNS}{" "}
          (below {NARROW_BELOW}). Both have the same blocks, each with its own place and width. Blocks in the way move
          down to make room. What counts is the columns: rows only put the blocks in order, and on the page each row
          is as tall as its content. Save both layouts as a pattern to load again, or copy its CSS.
        </p>
      </header>
      <p id="grid-help" class="grid-help">
        Drag a block to move it, or its right edge to make it wider or narrower. Keyboard: Enter picks a block up,
        the arrow keys move it, Enter drops it, Escape cancels; Shift + Left or Right makes it narrower or wider;
        Delete takes it off the grid.
      </p>
      <fieldset class="grid-view">
        <legend class="field__label">Edit the layout for</legend>
        <label>
          <input type="radio" name="grid-view" id="grid-view-wide" value="wide" checked /> Wide screens: {COLUMNS}{" "}
          columns
        </label>
        <label>
          <input type="radio" name="grid-view" id="grid-view-narrow" value="narrow" /> Narrow screens:{" "}
          {NARROW_COLUMNS} columns
        </label>
      </fieldset>
      <div id="grid-status" class="grid-status" role="status" aria-live="polite"></div>
      <Workspace />
    </main>
  </Layout>
);

/** the answer to a change: the new workspace, and the message for the live region */
export const Changed = ({ message, focus }: { message: string; focus?: string | undefined }) => (
  <>
    <Workspace focus={focus} />
    <div id="grid-status" hx-swap-oob="innerHTML">
      {message}
    </div>
  </>
);

/** `focus`: the id of the element to focus after the swap (htmx focuses [autofocus]) */
const Workspace = ({ focus }: { focus?: string | undefined }) => {
  const layouts = currentLayouts();
  return (
    <div id="grid-workspace" class="grid-workspace" hx-target="this" hx-swap="outerHTML">
      <section class="card grid-board-card" aria-labelledby="grid-board-title">
        <div class="grid-toolbar">
          <h2 id="grid-board-title" class="card__title">
            Layout
          </h2>
          <form method="post" action="/grid/clear" hx-post="/grid/clear">
            <button id="grid-clear" class="button button--ghost" autofocus={focus === "grid-clear"}>
              Clear both layouts
            </button>
          </form>
        </div>
        {views.map((view) => (
          <Board view={view} layout={layouts[view]} focus={focus} />
        ))}
      </section>
      <Palette layouts={layouts} focus={focus} />
      <Patterns focus={focus} />
    </div>
  );
};

/** the empty cells, drawn under the blocks: the pointer finds them while dragging */
const Cells = ({ columns, rows }: { columns: Columns; rows: number }) =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: columns }, (_, c) => (
      <div
        class="grid-cell"
        data-column={String(c + 1)}
        data-row={String(r + 1)}
        style={`grid-column: ${c + 1}; grid-row: ${r + 1}`}
        aria-hidden="true"
      ></div>
    )),
  );

/** one layout's board; data-* tell the browser code which layout it is and what is in it */
const Board = ({ view, layout, focus }: { view: View; layout: GridLayout; focus?: string | undefined }) => {
  const columns = columnsOf(view);
  const rows = boardRows(layout);
  return (
    <div class={`grid-view-${view}`}>
      <div
        id={`grid-board-${view}`}
        class={`grid-board grid-board--${view}`}
        role="group"
        aria-label={`Layout for ${viewLabel(view)}, ${columns} columns`}
        data-view={view}
        data-columns={String(columns)}
        data-layout={JSON.stringify(layout)}
        style={`--columns: ${columns}; --rows: ${rows}`}
      >
        <Cells columns={columns} rows={rows} />
        {layout.map((placement) => {
          const block = blocks.find((b) => b.id === placement.block);
          return block ? (
            <button
              type="button"
              id={blockId(view, block.id)}
              class="grid-block"
              data-block={block.id}
              style={`grid-area: ${gridArea(placement)}`}
              aria-describedby="grid-help"
              autofocus={focus === blockId(view, block.id)}
            >
              <span class="grid-block__label">{block.label}</span>
              <span class="grid-block__size">{size(placement)}</span>
              <span class="visually-hidden">, {where(placement)}</span>
              {/* drag it to change the width; the keyboard way is Shift + Left / Right */}
              <span class="grid-block__resize" aria-hidden="true"></span>
            </button>
          ) : null;
        })}
        <div class="grid-preview" aria-hidden="true" hidden></div>
      </div>
    </div>
  );
};

const Palette = ({ layouts, focus }: { layouts: Layouts; focus?: string | undefined }) => {
  const unplaced = blocks.filter((b) => !placementOf(layouts.wide, b.id));
  return (
    <section class="card grid-palette" data-palette aria-labelledby="grid-palette-title">
      <h2 id="grid-palette-title" class="card__title">
        Blocks
      </h2>
      <p class="card__lead">
        Drag one onto the grid: it is added to both layouts. Drag a block here to take it off both.
      </p>
      {unplaced.length === 0 ? (
        <p class="grid-palette__empty">Every block is on the grid.</p>
      ) : (
        <ul class="grid-palette__list">
          {unplaced.map((block) => (
            <li>
              <button
                type="button"
                id={paletteId(block.id)}
                class="grid-block grid-block--palette"
                data-block={block.id}
                aria-describedby="grid-help"
                autofocus={focus === paletteId(block.id)}
              >
                <span class="grid-block__label">{block.label}</span>
                <span class="grid-block__size">
                  {block.width}×{block.height}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const Patterns = ({ focus }: { focus?: string | undefined }) => (
  <section class="card grid-patterns" aria-labelledby="grid-patterns-title">
    <h2 id="grid-patterns-title" class="card__title">
      Patterns
    </h2>
    <form class="grid-save" method="post" action="/grid/save" hx-post="/grid/save">
      <label for="grid-save-name" class="field__label">
        Save both layouts as
      </label>
      <div class="grid-save__row">
        <input
          id="grid-save-name"
          class="grid-save__input"
          name="name"
          required
          maxlength={String(MAX_NAME)}
          autocomplete="off"
          placeholder="e.g. Dashboard"
          autofocus={focus === "grid-save-name"}
        />
        <button class="button">Save</button>
      </div>
    </form>
    <ul class="grid-patterns__list">
      {savedPatterns().map((pattern) => (
        <PatternItem pattern={pattern} focus={focus} />
      ))}
    </ul>
  </section>
);

const PatternItem = ({ pattern, focus }: { pattern: Pattern; focus?: string | undefined }) => {
  const nameId = `grid-pattern-${pattern.id}-name`;
  const count = pattern.layouts.wide.length;
  return (
    <li class="grid-pattern">
      <div class="grid-minis">
        {views.map((view) => (
          <Mini layout={pattern.layouts[view]} columns={columnsOf(view)} />
        ))}
      </div>
      <div class="grid-pattern__body">
        <p class="grid-pattern__name">
          <strong id={nameId}>{pattern.name}</strong>{" "}
          <span class="grid-pattern__count">
            {count} {count === 1 ? "block" : "blocks"}
          </span>
        </p>
        <div class="button-row">
          <form method="post" action="/grid/load" hx-post="/grid/load">
            <input type="hidden" name="id" value={pattern.id} />
            <button
              id={loadId(pattern.id)}
              class="button button--ghost"
              aria-describedby={nameId}
              autofocus={focus === loadId(pattern.id)}
            >
              Load
            </button>
          </form>
          <a class="button button--ghost" href={`/grid/patterns/${pattern.id}`} aria-describedby={nameId}>
            Open
          </a>
          <form method="post" action="/grid/delete" hx-post="/grid/delete">
            <input type="hidden" name="id" value={pattern.id} />
            <button class="button button--ghost" aria-describedby={nameId}>
              Delete
            </button>
          </form>
        </div>
        <details class="grid-pattern__css">
          <summary>HTML</summary>
          <Code layouts={pattern.layouts} />
        </details>
      </div>
    </li>
  );
};

/** a small picture of a layout */
const Mini = ({ layout, columns }: { layout: GridLayout; columns: Columns }) => (
  <div
    class="grid-mini"
    style={`--columns: ${columns}; grid-template-areas: ${areasValue(layout, columns)}`}
    aria-hidden="true"
  >
    {layout.map((p) => (rectOf(p) ? <div class="grid-mini__block" style={`grid-area: ${p.block}`}></div> : null))}
  </div>
);

/** what to copy: the markup (each block's place on its style), and the two files that go with every pattern */
const Code = ({ layouts }: { layouts: Layouts }) => (
  <>
    <p class="grid-code-note">
      Include once on the page: <a href={flowStylesPath}>grid-flow.css</a> (the same for every pattern) and{" "}
      <code>src/grid-builder/client/grid-flow.ts</code> (makes each block as tall as its content; without it the
      blocks still get their columns, on shared rows). Each block's place is on its <code>style</code>:
    </p>
    <pre class="grid-css">
      <code>{layoutHtml(layouts)}</code>
    </pre>
  </>
);

const samples = [
  "Short.",
  "A few lines of text: this block is as tall as what is in it.",
  "Type here to make this block taller or shorter. Only the blocks under it, in the columns it covers, move down; the blocks next to it keep their own height.",
];

/**
 * A saved pattern used as a page: the same markup as the copy above (grid-flow.css, <grid-flow>
 * from the module's script, each block's place on its style), with editable text in each block
 * to try the heights.
 */
export const PatternPage = ({ pattern }: { pattern: Pattern }) => (
  <Layout title={pattern.name} current={nav} head={flowHead}>
    <main class="page page--wide">
      <header class="intro">
        <h1>{pattern.name}</h1>
        <p>
          The saved pattern as a page: {NARROW_COLUMNS} columns below {NARROW_BELOW}, {COLUMNS} from there up. Each
          block is as tall as its content: edit the text in one and only the blocks under it move.{" "}
          <a href="/grid">Back to the grid builder</a>
        </p>
      </header>
      <grid-flow class="grid-page">
        {blocksInOrder(pattern.layouts).map((id, i) => {
            const block = blocks.find((b) => b.id === id);
            return block ? (
              <section
                class={`card grid-page__panel ${block.id}`}
                style={blockStyle(pattern.layouts, block.id)}
                aria-labelledby={`panel-${block.id}`}
              >
                <h2 id={`panel-${block.id}`} class="card__title">
                  {block.label}
                </h2>
                <p class="grid-page__text" contenteditable aria-label={`${block.label}: sample text, editable`}>
                  {samples[i % samples.length]}
                </p>
              </section>
            ) : null;
          })}
      </grid-flow>
      <section class="card" aria-labelledby="pattern-html-title">
        <h2 id="pattern-html-title" class="card__title">
          HTML
        </h2>
        <Code layouts={pattern.layouts} />
      </section>
    </main>
  </Layout>
);
