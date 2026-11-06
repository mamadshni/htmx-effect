/** <app-range-picker>: a cally range calendar with relative presets, as in the design. */

import { Layout } from "../layout.js";
import { moduleAssets, type NavLink } from "../module.js";
import { EventLogScript, ExampleCard } from "../showcase/example.js";
import { examples } from "./examples.js";

export const nav: NavLink = { href: "/range-picker", label: "Range presets" };
export const assets = moduleAssets("range-picker", {
  styles: new URL("./range-picker.css", import.meta.url),
  script: new URL("./client/range-picker.ts", import.meta.url),
});

export const RangePickerPage = () => (
  <Layout
    title="Range presets"
    current={nav}
    head={assets.head}
  >
    <main class="page page--wide">
      <header class="intro">
        <h1>Range presets</h1>
        <p>
          A date range field built on <a href="https://github.com/WickyNilliams/cally">cally</a>'s{" "}
          <code>&lt;calendar-range&gt;</code>: relative presets on the side (this week, last month, the months before,
          this year …), two months, Cancel and Apply. Days after today cannot be picked. The change event carries{" "}
          <code>{"{ value, preset }"}</code>, so a relative choice like "last week" can be stored as such.
        </p>
      </header>
      <div class="examples">
        {examples.map((example) => (
          <ExampleCard example={example} />
        ))}
      </div>
    </main>

    <EventLogScript events={["change", "submit", "reset"]} sources="app-range-picker, form" />
  </Layout>
);
