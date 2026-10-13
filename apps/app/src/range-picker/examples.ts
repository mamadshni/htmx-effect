/** Live examples of <app-range-picker>: each is rendered from exactly the HTML shown under "Show code". */

import type { Example } from "../showcase/example.js";

export const examples: ReadonlyArray<Example> = [
  {
    id: "german",
    title: "German, last week preselected",
    description: "preset is relative: it is recomputed each time the popover opens.",
    html: `<label for="zeitraum">Zeitraum</label>
<app-range-picker id="zeitraum" name="zeitraum" locale="de" preset="last-week"></app-range-picker>`,
  },
  {
    id: "english",
    title: "English, nothing chosen",
    description: "Week starts follow the locale (en-US: Sunday). Pick a preset or two days, then Apply.",
    html: `<label for="period">Period</label>
<app-range-picker id="period" name="period" locale="en-US"></app-range-picker>`,
  },
  {
    id: "form",
    title: "In a form",
    description: "Form-associated: the value (start/end, or empty for all time) is submitted; reset brings the default back.",
    html: `<form>
  <label for="report">Report period</label>
  <app-range-picker id="report" name="period" locale="de" value="2026-09-01/2026-09-30"></app-range-picker>
  <button type="submit">Submit</button>
  <button type="reset">Reset</button>
</form>`,
  },
];
