/**
 * <ds-calendar-range>: a calendar for picking a range in two steps; value "start/end" (ISO 8601 interval).
 *
 *   <ds-calendar-range months="2">
 *     <ds-calendar-month></ds-calendar-month>
 *     <ds-calendar-month offset="1"></ds-calendar-month>
 *   </ds-calendar-range>
 *
 * Inputs, events and parts: see CalendarBase.
 */

import { define } from "../shared.js";
import { CalendarBase } from "./calendar-base.js";
import { RangeSelection } from "./selection.js";

namespace Module {
  export const tagName = "ds-calendar-range" as const;

  export class CalendarRange extends CalendarBase {
    protected createSelection() {
      return new RangeSelection();
    }
  }
}

define(Module.tagName, Module.CalendarRange);

globalThis.DsCalendarRange = Module.CalendarRange;

/** instance type of <ds-calendar-range>: `import type { DsCalendarRange } from "@combo/design-system/bundle/index.js"` */
export type DsCalendarRange = Module.CalendarRange;

declare global {
  export import DsCalendarRange = Module.CalendarRange;

  interface HTMLElementTagNameMap {
    [Module.tagName]: DsCalendarRange;
  }
}
