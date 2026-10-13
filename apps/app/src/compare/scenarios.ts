/**
 * The same calendar, twice: with cally (https://github.com/WickyNilliams/cally) and with our
 * design system. Each side is rendered from exactly the HTML shown under "Show code".
 * cally is an ES module, so its snippets' scripts are modules too: they run after it is defined.
 */

export interface Scenario {
  readonly id: string;
  readonly title: string;
  /** what differs between the two */
  readonly note: string;
  /** null: cally has no such feature */
  readonly cally: string | null;
  /** null: we have no such feature */
  readonly ours: string | null;
}

export const scenarios: ReadonlyArray<Scenario> = [
  {
    id: "single",
    title: "Single date",
    note: "Same markup shape. cally renders into shadow DOM (style it with ::part); ours renders light DOM (plain CSS).",
    cally: `<calendar-date value="2026-10-14">
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: `<ds-calendar value="2026-10-14">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "outside-days",
    title: "Neighbouring days",
    note: "Both have show-outside-days.",
    cally: `<calendar-date show-outside-days>
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: `<ds-calendar show-outside-days>
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "selects",
    title: "Month and year selects",
    note: "cally: put the selects in slot=\"heading\". Ours: put them directly inside; they move into the header.",
    cally: `<calendar-date>
  <div slot="heading">
    <calendar-select-month></calendar-select-month>
    <calendar-select-year></calendar-select-year>
  </div>
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: `<ds-calendar>
  <ds-calendar-select-month></ds-calendar-select-month>
  <ds-calendar-select-year></ds-calendar-select-year>
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "min-max",
    title: "Min and max",
    note: "Both disable days outside and stop paging at the limits.",
    cally: `<calendar-date min="2026-10-05" max="2026-11-20">
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: `<ds-calendar min="2026-10-05" max="2026-11-20">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "range",
    title: "Range over two months",
    note: "cally: lay the months out yourself (here a flex div); fires rangestart and rangeend (detail: Date). Ours lays them out and fires rangestart (detail: { date: PlainDate }) and change.",
    cally: `<calendar-range months="2" value="2026-10-20/2026-10-24">
  <div style="display: flex; gap: 1.5rem">
    <calendar-month></calendar-month>
    <calendar-month offset="1"></calendar-month>
  </div>
</calendar-range>`,
    ours: `<ds-calendar-range months="2" value="2026-10-20/2026-10-24">
  <ds-calendar-month></ds-calendar-month>
  <ds-calendar-month offset="1"></ds-calendar-month>
</ds-calendar-range>`,
  },
  {
    id: "multi",
    title: "Several dates",
    note: "Same value format: dates separated by spaces.",
    cally: `<calendar-multi value="2026-10-07 2026-10-14 2026-10-21">
  <calendar-month></calendar-month>
</calendar-multi>`,
    ours: `<ds-calendar-multi value="2026-10-07 2026-10-14 2026-10-21">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar-multi>`,
  },
  {
    id: "disallowed",
    title: "Unavailable days",
    note: "cally: a rule only (gets a Date). Ours: dates and weekdays as attributes, plus a rule (gets a Temporal.PlainDate).",
    cally: `<calendar-date id="cally-booking">
  <calendar-month></calendar-month>
</calendar-date>
<script type="module">
  // weekends, 15 and 16 October, every 10th
  document.getElementById("cally-booking").isDateDisallowed = (date) =>
    [0, 6].includes(date.getUTCDay()) ||
    ["2026-10-15", "2026-10-16"].includes(date.toISOString().slice(0, 10)) ||
    date.getUTCDate() === 10;
</script>`,
    ours: `<ds-calendar id="ours-booking" disallowed="2026-10-15 2026-10-16" disallowed-weekdays="0 6">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>
<script>
  // every 10th
  document.getElementById("ours-booking").isDateDisallowed = (date) => date.day === 10;
</script>`,
  },
  {
    id: "german",
    title: "German, week from Monday",
    note: "cally takes locale for names; the buttons and labels stay English unless you slot your own. Ours translates all text (en/de) and takes the first day of the week from the locale.",
    cally: `<calendar-date locale="de" first-day-of-week="1">
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: `<ds-calendar locale="de">
  <ds-calendar-month></ds-calendar-month>
</ds-calendar>`,
  },
  {
    id: "week-numbers",
    title: "Week numbers",
    note: "Only cally has show-week-numbers.",
    cally: `<calendar-date show-week-numbers>
  <calendar-month></calendar-month>
</calendar-date>`,
    ours: null,
  },
  {
    id: "picker",
    title: "Date picker in a form",
    note: "cally has no input: you build the field, popover and wiring yourself (this is the pattern from its docs). Ours is one form-associated element with typing, validation and the native picker on touch devices.",
    cally: `<form>
  <label for="cally-due">Due date</label>
  <input id="cally-due" name="due" required placeholder="YYYY-MM-DD">
  <button type="button" popovertarget="cally-popover">Choose</button>
  <div id="cally-popover" popover>
    <calendar-date id="cally-picker" min="2026-01-01" max="2026-12-31">
      <calendar-month></calendar-month>
    </calendar-date>
  </div>
  <button type="submit">Submit</button>
</form>
<script type="module">
  document.getElementById("cally-picker").addEventListener("change", (event) => {
    document.getElementById("cally-due").value = event.target.value;
    document.getElementById("cally-popover").hidePopover();
  });
</script>`,
    ours: `<form>
  <label for="ours-due">Due date</label>
  <ds-date-picker id="ours-due" name="due" required min="2026-01-01" max="2026-12-31"></ds-date-picker>
  <button type="submit">Submit</button>
</form>`,
  },
];
