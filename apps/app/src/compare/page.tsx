/** cally and our calendar side by side: one card per scenario, each side with its code and events. */

import { Layout } from "../layout.js";
import { EventLogScript, ExampleBody } from "../showcase/example.js";
import { scenarios, type Scenario } from "./scenarios.js";

/** the facts that do not show in a demo */
const differences: ReadonlyArray<readonly [string, string, string]> = [
  ["Package", "cally 0.9 (Atomico), ~9 KB min+gzip", "@combo/design-system, Temporal polyfill bundled"],
  ["DOM", "Shadow DOM; style with ::part and custom properties", "Light DOM; style with plain CSS and --ds-* tokens"],
  ["Dates in JS", "Date (UTC midnight) in events and isDateDisallowed", "Temporal.PlainDate in events, isDateDisallowed, start/end"],
  ["Inputs", "Attributes and properties (Atomico props)", "Attributes ↔ properties, checked; invalid values are rejected with a warning"],
  ["Unavailable days", "isDateDisallowed (property)", "disallowed, disallowed-weekdays (attributes) and isDateDisallowed"],
  ["Text", "Names from Intl; button text and labels in English (slot your own)", "Names from Intl; all text in English or German"],
  ["Form field", "None: wire up an input and a popover yourself", "<ds-date-picker>: form-associated, validation, native picker on touch"],
  ["Events", "change, focusday, rangestart, rangeend: do not bubble (listen on the element)", "change, focusday, rangestart, pagechange: bubble"],
  ["Week numbers", "show-week-numbers", "—"],
];

export const ComparePage = () => (
  <Layout title="cally vs ours" current="compare" head={<script type="module" src="/assets/cally.js"></script>}>
    <main class="page page--wide">
      <header class="intro">
        <h1>cally vs ours</h1>
        <p>
          The same calendars built with <a href="https://github.com/WickyNilliams/cally">cally</a> (left) and our
          design system (right). cally's look comes from its own styles plus a small theme on its CSS parts in
          app.css, so the two are easy to compare.
        </p>
      </header>

      <section class="card" aria-labelledby="differences-title">
        <h2 id="differences-title" class="card__title">
          At a glance
        </h2>
        <div class="table-scroll">
          <table class="api-table api-table--wrap">
            <thead>
              <tr>
                <th scope="col"></th>
                <th scope="col">cally</th>
                <th scope="col">Ours</th>
              </tr>
            </thead>
            <tbody>
              {differences.map(([topic, cally, ours]) => (
                <tr>
                  <th scope="row">{topic}</th>
                  <td>{cally}</td>
                  <td>{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {scenarios.map((scenario) => (
        <ScenarioCard scenario={scenario} />
      ))}
    </main>

    <EventLogScript
      events={["change", "rangestart", "rangeend", "focusday", "pagechange", "submit", "reset"]}
      sources="calendar-date, calendar-range, calendar-multi, ds-date-picker, ds-calendar, ds-calendar-range, ds-calendar-multi, form"
    />
  </Layout>
);

const ScenarioCard = ({ scenario }: { scenario: Scenario }) => (
  <section class="card compare" id={scenario.id} aria-labelledby={`${scenario.id}-title`}>
    <h2 id={`${scenario.id}-title`} class="card__title">
      {scenario.title}
    </h2>
    <p class="example__description">{scenario.note}</p>
    <div class="compare__sides">
      <Side id={`${scenario.id}-cally`} label="cally" html={scenario.cally} />
      <Side id={`${scenario.id}-ours`} label="Ours" html={scenario.ours} />
    </div>
  </section>
);

const Side = ({ id, label, html }: { id: string; label: string; html: string | null }) => (
  <div class="compare__side example" id={id} data-example>
    <h3 class="compare__label">{label}</h3>
    {html === null ? <p class="compare__missing">Not available.</p> : <ExampleBody html={html} />}
  </div>
);
