/**
 * <ds-calendar-multi>: a calendar for picking several dates; each pick toggles a day; value "YYYY-MM-DD YYYY-MM-DD …".
 *
 *   <ds-calendar-multi value="2026-10-01 2026-10-03" locale="de">
 *     <ds-calendar-month></ds-calendar-month>
 *   </ds-calendar-multi>
 *
 * Inputs, events and parts: see CalendarBase.
 */

import { define } from "../shared.js";
import { CalendarBase } from "./calendar-base.js";
import { MultiSelection } from "./selection.js";

namespace Module {
  export const tagName = "ds-calendar-multi" as const;

  export class CalendarMulti extends CalendarBase {
    protected createSelection() {
      return new MultiSelection();
    }
  }
}

define(Module.tagName, Module.CalendarMulti);

globalThis.DsCalendarMulti = Module.CalendarMulti;

/** instance type of <ds-calendar-multi>: `import type { DsCalendarMulti } from "@combo/design-system/bundle/index.js"` */
export type DsCalendarMulti = Module.CalendarMulti;

declare global {
  export import DsCalendarMulti = Module.CalendarMulti;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendarMulti;
  }
}
