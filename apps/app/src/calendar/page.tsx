/** The calendar showcase: the API as tables, then live examples with their code and events. */

import { Layout } from "../layout.js";
import {
  containerInputs,
  containerMembers,
  containerOutputs,
  partInputs,
  pickerInputs,
  pickerOutputs,
  type Input,
  type Member,
  type Output,
} from "./api.js";
import { EventLogScript, ExampleCard } from "../showcase/example.js";
import { calendarExamples, pickerExamples } from "./examples.js";

const contents = [
  ["inputs", "Inputs"],
  ["outputs", "Outputs"],
  ["calendar-examples", "Calendar examples"],
  ["date-picker", "Date picker"],
] as const;

export const CalendarPage = () => (
  <Layout title="Calendar" current="calendar">
    <main class="page page--wide">
      <header class="intro">
        <h1>Calendar</h1>
        <p>
          Building blocks: a container (<code>&lt;ds-calendar&gt;</code>, <code>&lt;ds-calendar-range&gt;</code> or{" "}
          <code>&lt;ds-calendar-multi&gt;</code>) holds the state; <code>&lt;ds-calendar-month&gt;</code>,{" "}
          <code>&lt;ds-calendar-select-month&gt;</code> and <code>&lt;ds-calendar-select-year&gt;</code> inside it show
          it. Every input is an attribute and a property, kept in sync and checked. Attributes and values are{" "}
          <code>YYYY-MM-DD</code> text; dates handed to your code (event details, <code>isDateDisallowed</code>,{" "}
          <code>start</code>/<code>end</code>) are <code>Temporal.PlainDate</code>.
        </p>
        <nav class="toc" aria-label="On this page">
          {contents.map(([id, label]) => (
            <a href={`#${id}`}>{label}</a>
          ))}
        </nav>
      </header>

      <section class="card" id="inputs" aria-labelledby="inputs-title">
        <h2 id="inputs-title" class="card__title">
          Inputs
        </h2>
        <h3 class="table-title">Containers</h3>
        <InputTable rows={containerInputs} />
        <h3 class="table-title">Parts</h3>
        <InputTable rows={partInputs} withElement />
      </section>

      <section class="card" id="outputs" aria-labelledby="outputs-title">
        <h2 id="outputs-title" class="card__title">
          Outputs
        </h2>
        <h3 class="table-title">Events (bubble from the container)</h3>
        <OutputTable rows={containerOutputs} />
        <h3 class="table-title">Properties and methods</h3>
        <MemberTable rows={containerMembers} />
      </section>

      <section id="calendar-examples" aria-labelledby="calendar-examples-title">
        <h2 id="calendar-examples-title" class="section-title">
          Calendar examples
        </h2>
        <div class="examples">{calendarExamples.map((example) => <ExampleCard example={example} />)}</div>
      </section>

      <section id="date-picker" aria-labelledby="date-picker-title">
        <h2 id="date-picker-title" class="section-title">
          Date picker
        </h2>
        <div class="card">
          <p class="card__lead">
            <code>&lt;ds-date-picker&gt;</code> is a form field around a calendar: native picker on touch devices
            (single dates without unavailable days), the calendar everywhere else.
          </p>
          <h3 class="table-title">Inputs</h3>
          <InputTable rows={pickerInputs} />
          <h3 class="table-title">Outputs</h3>
          <OutputTable rows={pickerOutputs} />
        </div>
        <div class="examples">{pickerExamples.map((example) => <ExampleCard example={example} />)}</div>
      </section>
    </main>

    <EventLogScript
      events={["change", "rangestart", "focusday", "pagechange", "submit", "reset"]}
      sources="ds-date-picker, ds-calendar, ds-calendar-range, ds-calendar-multi, form"
    />
  </Layout>
);

const InputTable = ({ rows, withElement = false }: { rows: ReadonlyArray<Input & { element?: string }>; withElement?: boolean }) => (
  <div class="table-scroll">
    <table class="api-table">
      <thead>
        <tr>
          {withElement ? <th scope="col">Element</th> : null}
          <th scope="col">Attribute</th>
          <th scope="col">Property</th>
          <th scope="col">Type</th>
          <th scope="col">Default</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            {withElement ? (
              <td>
                <code>{row.element ?? ""}</code>
              </td>
            ) : null}
            <td>
              <code>{row.attribute}</code>
            </td>
            <td>
              <code>{row.property}</code>
            </td>
            <td>{row.type}</td>
            <td>{row.defaultValue}</td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const OutputTable = ({ rows }: { rows: ReadonlyArray<Output> }) => (
  <div class="table-scroll">
    <table class="api-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Detail</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            <td>
              <code>{row.name}</code>
            </td>
            <td>
              <code>{row.detail}</code>
            </td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const MemberTable = ({ rows }: { rows: ReadonlyArray<Member> }) => (
  <div class="table-scroll">
    <table class="api-table">
      <thead>
        <tr>
          <th scope="col">Name</th>
          <th scope="col">Type</th>
          <th scope="col">Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr>
            <td>
              <code>{row.name}</code>
            </td>
            <td>{row.type}</td>
            <td>{row.description}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
