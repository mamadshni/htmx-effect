/**
 * Grid builder page: a grid of 12 columns and as many rows as needed, the blocks not on it (the
 * palette) and the saved patterns. Blocks are placed by number (grid-area: row / column / span),
 * so the browser can move them live while dragging; a saved pattern keeps the same layout as
 * grid-template-areas. client/grid-builder.ts does the dragging; every change is
 * a form post the server checks (routes.tsx). Answers to htmx are the whole workspace and the
 * status message (out of band, into the live region that stays on the page).
 */

import { Layout } from "../layout.js";
import { moduleAssets, type NavLink } from "../module.js";
import { areasValue, blocks, boardRows, COLUMNS, gridArea, type Layout as GridLayout, layoutCss, placementOf, rectOf, size, where } from "./grid.js";
import { MAX_NAME, type Pattern, currentLayout, savedPatterns } from "./store.js";

export const nav: NavLink = { href: "/grid", label: "Grid builder" };
export const assets = moduleAssets("grid-builder", {
  styles: new URL("./grid-builder.css", import.meta.url),
  script: new URL("./client/grid-builder.ts", import.meta.url),
});

export const blockId = (id: string) => `grid-block-${id}`;
export const paletteId = (id: string) => `grid-palette-${id}`;
export const loadId = (pattern: string) => `grid-pattern-${pattern}-load`;

export const GridPage = () => (
  <Layout title="Grid builder" current={nav} head={assets.head}>
    <main class="page page--wide">
      <header class="intro">
        <h1>Grid builder</h1>
        <p>
          Drag blocks onto the grid to shape the page. The grid has 12 columns and grows downwards: blocks in the
          way move down to make room, and a block dropped past the side snaps back inside. Save the layout as a
          pattern to load it again, or copy its CSS.
        </p>
      </header>
      <p id="grid-help" class="grid-help">
        Keyboard: Enter picks a block up, the arrow keys move it, Enter drops it, Escape
        cancels. Delete takes a block off the grid.
      </p>
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
  const layout = currentLayout();
  return (
    <div id="grid-workspace" class="grid-workspace" hx-target="this" hx-swap="outerHTML">
      <section class="card grid-board-card" aria-labelledby="grid-board-title">
        <div class="grid-toolbar">
          <h2 id="grid-board-title" class="card__title">
            Layout
          </h2>
          <form method="post" action="/grid/clear" hx-post="/grid/clear">
            <button id="grid-clear" class="button button--ghost" autofocus={focus === "grid-clear"}>
              Clear grid
            </button>
          </form>
        </div>
        <Board layout={layout} focus={focus} />
      </section>
      <Palette layout={layout} focus={focus} />
      <Patterns focus={focus} />
    </div>
  );
};

const Board = ({ layout, focus }: { layout: GridLayout; focus?: string | undefined }) => {
  const rows = boardRows(layout);
  return (
  <div
    id="grid-board"
    class="grid-board"
    role="group"
    aria-labelledby="grid-board-title"
    data-layout={JSON.stringify(layout)}
    style={`--columns: ${COLUMNS}; --rows: ${rows}`}
  >
    {/* the empty cells: drop targets, found under the pointer while dragging */}
    {Array.from({ length: rows }, (_, r) =>
      Array.from({ length: COLUMNS }, (_, c) => (
        <div
          class="grid-cell"
          data-column={String(c + 1)}
          data-row={String(r + 1)}
          style={`grid-column: ${c + 1}; grid-row: ${r + 1}`}
          aria-hidden="true"
        ></div>
      )),
    )}
    {layout.map((placement) => {
      const block = blocks.find((b) => b.id === placement.block);
      return block ? (
        <button
          type="button"
          id={blockId(block.id)}
          class="grid-block"
          data-block={block.id}
          style={`grid-area: ${gridArea(placement)}`}
          aria-describedby="grid-help"
          autofocus={focus === blockId(block.id)}
        >
          <span class="grid-block__label">{block.label}</span>
          <span class="grid-block__size">{size(block)}</span>
          <span class="visually-hidden">, {where(placement)}</span>
        </button>
      ) : null;
    })}
    <div class="grid-preview" aria-hidden="true" hidden></div>
  </div>
  );
};

const Palette = ({ layout, focus }: { layout: GridLayout; focus?: string | undefined }) => {
  const unplaced = blocks.filter((b) => !placementOf(layout, b.id));
  return (
    <section class="card grid-palette" data-palette aria-labelledby="grid-palette-title">
      <h2 id="grid-palette-title" class="card__title">
        Blocks
      </h2>
      <p class="card__lead">Drag one onto the grid. Drag a block here to take it off.</p>
      {unplaced.length === 0 ? (
        <p class="grid-palette__empty">Every block is on the grid.</p>
      ) : (
        <ul class="grid-palette__list">
          {unplaced.map((block) => {
            return (
              <li>
                <button
                  type="button"
                  id={paletteId(block.id)}
                  class="grid-block grid-block--palette"
                  data-block={block.id}
                  style={`--w: ${block.width}; --h: ${block.height}`}
                  aria-describedby="grid-help"
                  autofocus={focus === paletteId(block.id)}
                >
                  <span class="grid-block__label">{block.label}</span>
                  <span class="grid-block__size">{size(block)}</span>
                </button>
              </li>
            );
          })}
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
        Save the layout as
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
  return (
    <li class="grid-pattern">
      <Mini layout={pattern.layout} />
      <div class="grid-pattern__body">
        <p class="grid-pattern__name">
          <strong id={nameId}>{pattern.name}</strong>{" "}
          <span class="grid-pattern__count">
            {pattern.layout.length} {pattern.layout.length === 1 ? "block" : "blocks"}
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
          <summary>CSS</summary>
          <pre>
            <code>{layoutCss(pattern.layout)}</code>
          </pre>
        </details>
      </div>
    </li>
  );
};

/** a small picture of a layout */
const Mini = ({ layout }: { layout: GridLayout }) => (
  <div class="grid-mini" style={`grid-template-areas: ${areasValue(layout)}`} aria-hidden="true">
    {layout.map((p) => (rectOf(p) ? <div class="grid-mini__block" style={`grid-area: ${p.block}`}></div> : null))}
  </div>
);

/** a saved pattern used as a page layout: each area gets a placeholder panel */
export const PatternPage = ({ pattern }: { pattern: Pattern }) => (
  <Layout title={pattern.name} current={nav} head={assets.head}>
    <main class="page page--wide">
      <header class="intro">
        <h1>{pattern.name}</h1>
        <p>
          The saved pattern as a page layout. <a href="/grid">Back to the grid builder</a>
        </p>
      </header>
      <div class="grid-page" style={`grid-template-areas: ${areasValue(pattern.layout)}`}>
        {pattern.layout.map((p) => {
          const block = blocks.find((b) => b.id === p.block);
          return block ? (
            <section class="card grid-page__panel" style={`grid-area: ${block.id}`}>
              <h2 class="card__title">{block.label}</h2>
            </section>
          ) : null;
        })}
      </div>
      <section class="card" aria-labelledby="pattern-css-title">
        <h2 id="pattern-css-title" class="card__title">
          CSS
        </h2>
        <pre class="grid-css">
          <code>{layoutCss(pattern.layout)}</code>
        </pre>
      </section>
    </main>
  </Layout>
);
