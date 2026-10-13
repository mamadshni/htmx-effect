/**
 * Runs in the browser (inlined into a showcase page by <EventLogScript>): shows what each
 * example emits in its log, so the outputs can be tried out. Self-contained, no imports.
 */
export interface EventLogOptions {
  /** event types to log */
  readonly events: ReadonlyArray<string>;
  /** selector for the elements an event is reported from (the closest one to its target) */
  readonly sources: string;
}

export function eventLog({ events: EVENTS, sources: SOURCES }: EventLogOptions) {
  for (const example of document.querySelectorAll<HTMLElement>("[data-example]")) {
    const demo = example.querySelector<HTMLElement>("[data-demo]");
    const log = example.querySelector<HTMLElement>("[data-log]");
    if (!demo || !log) continue;
    const lines: string[] = [];
    const write = (line: string) => {
      lines.unshift(line);
      lines.length = Math.min(lines.length, 6);
      log.textContent = lines.join("\n");
    };

    const describe = (event: Event, source: HTMLElement & { value?: string }) => {
      if (event.type === "submit" && source instanceof HTMLFormElement) {
        event.preventDefault();
        const valid = source.checkValidity();
        const data = [...new FormData(source)].map(([name, value]) => `${name}=${String(value)}`);
        return `form submit → ${valid ? data.join("&") || "(empty)" : "invalid, not sent"}`;
      }
      if (event.type === "reset") return "form reset";
      const detail = (event as CustomEvent).detail;
      const shown = detail === undefined || detail === null ? `value = ${JSON.stringify(source.value ?? "")}` : JSON.stringify(detail);
      return `${source.localName} ${event.type} → ${shown}`;
    };

    // a blocked submit fires `invalid` (which does not bubble) instead of `submit`
    demo.addEventListener(
      "invalid",
      (event) => {
        const field = event.target as HTMLElement & { validationMessage?: string };
        write(`${field.localName} invalid → ${field.validationMessage ?? ""}`);
      },
      true,
    );

    // listen on each source itself: some components' events do not bubble (cally's);
    // an event that bubbles through several sources is logged once, by the innermost
    const logged = new WeakSet<Event>();
    for (const source of demo.querySelectorAll<HTMLElement>(SOURCES)) {
      for (const type of EVENTS) {
        source.addEventListener(type, (event) => {
          if (logged.has(event)) return;
          logged.add(event);
          write(describe(event, source));
        });
      }
    }
  }
}
