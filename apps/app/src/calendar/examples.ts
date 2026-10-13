/** Live examples: each is rendered from exactly the HTML shown under "Show code". */

import type { Example } from "../showcase/example.js";

export const calendarExamples: ReadonlyArray<Example> = [
  {
    id: "single",
    title: "Single date",
    description: "<ds-calendar> with one month. Click a day or use the arrow keys.",
    html: `<ds-calendar value="2026-10-14">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "outside-days",
    title: "Neighbouring days",
    description: "show-outside-days fills the empty cells; they can be picked too.",
    html: `<ds-calendar show-outside-days>
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "selects",
    title: "Month and year selects",
    description: "Selects placed directly inside move into the header, between ‹ and ›.",
    html: `<ds-calendar show-outside-days>
  <ds-calendar-select-month></ds-calendar-select-month>
  <ds-calendar-select-year max-years="30"></ds-calendar-select-year>
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "min-max",
    title: "Min and max",
    description: "Days outside are disabled; focus and paging stop at the limits.",
    html: `<ds-calendar min="2026-10-05" max="2026-11-20">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "range",
    wide: true,
    title: "Range over two months",
    description: "<ds-calendar-range>: first click starts, second click ends (either order).",
    html: `<ds-calendar-range months="2" value="2026-10-20/2026-10-24">
  <ds-calendar-month></ds-calendar-month>
  <ds-calendar-month offset="1"></ds-calendar-month>
</ds-calendar-range>`,
  },
  {
    id: "range-auto",
    wide: true,
    title: "Months created for you",
    description: "No <ds-calendar-month> inside: the container adds `months` of them.",
    html: `<ds-calendar-range months="3"></ds-calendar-range>`,
  },
  {
    id: "multi",
    title: "Several dates",
    description: "<ds-calendar-multi>: every click toggles a day.",
    html: `<ds-calendar-multi value="2026-10-07 2026-10-14 2026-10-21">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar-multi>`,
  },
  {
    id: "disallowed",
    title: "Unavailable days",
    description: "Dates, weekdays and a rule (property). Struck through; focusable, not pickable.",
    html: `<ds-calendar id="booking" disallowed="2026-10-15 2026-10-16" disallowed-weekdays="0 6">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>
<script>
  // every 10th of a month, by rule (date is a Temporal.PlainDate)
  document.getElementById("booking").isDateDisallowed = (date) => date.day === 10;
</script>`,
  },
  {
    id: "german",
    wide: true,
    title: "German, week from Monday",
    description: "locale picks names, text and the first day of the week (lang on an ancestor works too).",
    html: `<ds-calendar-range locale="de" months="2">
  <ds-calendar-select-month></ds-calendar-select-month>
  <ds-calendar-select-year></ds-calendar-select-year>
  <ds-calendar-month></ds-calendar-month>
  <ds-calendar-month offset="1"></ds-calendar-month>
</ds-calendar-range>`,
  },
  {
    id: "first-day",
    title: "Custom first day and today",
    description: "first-day-of-week=\"1\" starts on Monday; today is overridden.",
    html: `<ds-calendar first-day-of-week="1" today="2026-12-24">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "styled",
    title: "Your own layout",
    description: "Light DOM: style the container and its months with plain CSS.",
    html: `<style>
  #stacked { flex-direction: column; align-items: center; }
  #stacked .ds-calendar-month__title { color: var(--ds-accent); }
</style>
<ds-calendar-multi id="stacked" months="2">
  <ds-calendar-month></ds-calendar-month>
  <ds-calendar-month offset="1"></ds-calendar-month>
</ds-calendar-multi>`,
  },
];

export const pickerExamples: ReadonlyArray<Example> = [
  {
    id: "picker",
    title: "Date picker in a form",
    description: "Submit to see the FormData; required, min and max are validated.",
    html: `<form>
  <label for="due">Due date</label>
  <ds-date-picker id="due" name="due" required min="2026-01-01" max="2026-12-31"></ds-date-picker>
  <button type="submit">Submit</button>
</form>`,
  },
  {
    id: "picker-range",
    title: "Range picker",
    description: "Two months, weekends unavailable. Value is submitted as start/end.",
    html: `<form>
  <label for="stay">Stay</label>
  <ds-date-picker id="stay" name="stay" range months="2" disallowed-weekdays="0 6"></ds-date-picker>
  <button type="submit">Submit</button>
</form>`,
  },
  {
    id: "picker-german",
    title: "German picker with a default",
    description: "value is the default (reset brings it back); text and validation in German.",
    html: `<form lang="de">
  <label for="termin">Termin</label>
  <ds-date-picker id="termin" name="termin" value="2026-10-14" required></ds-date-picker>
  <button type="submit">Senden</button>
  <button type="reset">Zurücksetzen</button>
</form>`,
  },
];
