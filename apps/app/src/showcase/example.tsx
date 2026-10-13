/** Live examples shared by the showcase modules: demo, event log and "Show code". */

import { fromHtml } from "tsx-to-html";
import { eventLog, type EventLogOptions } from "./event-log.js";

export interface Example {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** rendered as the demo and shown under "Show code" */
  readonly html: string;
  /** several months side by side: the card takes a full row */
  readonly wide?: boolean;
}

/** the demo, rendered from the same HTML that "Show code" shows, with its event log */
export const ExampleBody = ({ html }: { html: string }) => (
  <>
    <div class="example__demo" data-demo>
      {fromHtml(html)}
    </div>
    <div class="example__log-label">Output</div>
    <output class="example__log" data-log aria-live="polite">
      Interact with the example to see its events.
    </output>
    <details class="example__code">
      <summary>Show code</summary>
      <pre>
        <code>{html}</code>
      </pre>
    </details>
  </>
);

/** an example in its own card */
export const ExampleCard = ({ example }: { example: Example }) => (
  <article
    class={{ card: true, example: true, "example--wide": example.wide ?? false }}
    id={example.id}
    data-example
    aria-labelledby={`${example.id}-title`}
  >
    <h3 id={`${example.id}-title`} class="card__title">
      {example.title}
    </h3>
    <p class="example__description">{example.description}</p>
    <ExampleBody html={example.html} />
  </article>
);

/** fills the logs of every [data-example] on the page (compiled TypeScript, inlined: tsx cannot write raw script content) */
export const EventLogScript = (options: EventLogOptions) =>
  fromHtml(
    `<script type="module">const __name = (f) => f; (${eventLog.toString()})(${JSON.stringify(options)});</script>`,
  );
