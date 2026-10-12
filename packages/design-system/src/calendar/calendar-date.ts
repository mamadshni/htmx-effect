/**
 * <ds-calendar>: a calendar for picking one date; value "YYYY-MM-DD".
 *
 *   <ds-calendar value="2026-10-12" min="2026-01-01">
 *     <ds-calendar-month></ds-calendar-month>
 *   </ds-calendar>
 *
 * Inputs, events and parts: see CalendarBase.
 */

import { define } from "../shared.js";
import { CalendarBase } from "./calendar-base.js";
import { SingleSelection } from "./selection.js";

namespace Module {
  export const tagName = "ds-calendar" as const;

  export class Calendar extends CalendarBase {
    protected createSelection() {
      return new SingleSelection();
    }
  }
}

define(Module.tagName, Module.Calendar);

globalThis.DsCalendar = Module.Calendar;

/** instance type of <ds-calendar>: `import type { DsCalendar } from "@combo/design-system/bundle/index.js"` */
export type DsCalendar = Module.Calendar;

declare global {
  export import DsCalendar = Module.Calendar;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendar;
  }
}
