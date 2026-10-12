import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, focusedDate, mount, nextFrame, record } from "./helpers.js";

const attributes = `locale="en-US" first-day-of-week="1" today="2026-10-12"`;
const day = (date: string) => $<HTMLButtonElement>(`button[data-date="${date}"]:not([data-outside])`);
const heading = () => $(".ds-calendar__heading").textContent;

describe("calendar containers and parts", () => {
  it("renders a month inside <ds-calendar> with labels, today and the selected day", async () => {
    await mount(`<ds-calendar ${attributes} value="2026-10-20"><ds-calendar-month></ds-calendar-month></ds-calendar>`);
    expect(heading()).toBe("October 2026");
    expect(document.querySelectorAll("ds-calendar-month tbody tr").length).toBe(6);
    expect(day("2026-10-12").getAttribute("aria-current")).toBe("date");
    expect(day("2026-10-20").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-10-20").getAttribute("aria-label")).toBe("Tuesday, October 20, 2026");
    expect($("th").getAttribute("abbr")).toBe("Monday");
    // no neighbouring days unless asked for
    expect(document.querySelector("button[data-outside]")).toBeNull();
    // the container labels itself with its heading
    expect($("ds-calendar").getAttribute("role")).toBe("group");
  });

  it("adds `months` months itself when there is no <ds-calendar-month> inside", async () => {
    await mount(`<ds-calendar-range ${attributes} months="2"></ds-calendar-range>`);
    expect(document.querySelectorAll("ds-calendar-month").length).toBe(2);
    expect(heading()).toBe("October – November 2026");
    $("ds-calendar-range").months = 3;
    expect(document.querySelectorAll("ds-calendar-month").length).toBe(3);
  });

  it("composes months with offsets, and works when parts upgrade after the container", async () => {
    await mount(`
      <ds-calendar-range ${attributes} months="2">
        <ds-calendar-month></ds-calendar-month>
        <ds-calendar-month offset="1"></ds-calendar-month>
      </ds-calendar-range>`);
    const titles = [...document.querySelectorAll(".ds-calendar-month__title")].map((t) => t.textContent);
    expect(titles).toEqual(["October 2026", "November 2026"]);

    // a month added later renders as soon as it connects
    const extra = document.createElement("ds-calendar-month");
    extra.offset = 2;
    $("ds-calendar-range").append(extra);
    expect(extra.querySelector(".ds-calendar-month__title")?.textContent).toBe("December 2026");
  });

  it("moves focus with the keyboard and reports focusday / pagechange", async () => {
    const root = await mount(`<ds-calendar ${attributes} value="2026-10-30"><ds-calendar-month></ds-calendar-month></ds-calendar>`);
    const events = record(root, "focusday", "pagechange");
    $("ds-calendar").focus();
    expect(focusedDate()).toBe("2026-10-30");

    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(focusedDate()).toBe("2026-11-01");
    expect(heading()).toBe("November 2026");
    await userEvent.keyboard("{Home}");
    expect(focusedDate()).toBe("2026-10-26"); // Monday of that week
    await userEvent.keyboard("{PageDown}");
    expect(focusedDate()).toBe("2026-11-26");

    expect(events.filter((e) => e.type === "focusday").length).toBe(4);
    expect(events.find((e) => e.type === "pagechange")?.detail).toEqual({ start: "2026-11-01", end: "2026-11-30" });
  });

  it("keeps focus inside min/max and marks prev/next", async () => {
    await mount(`<ds-calendar ${attributes} show-outside-days value="2026-10-02" min="2026-10-01" max="2026-10-31"></ds-calendar>`);
    expect($<HTMLButtonElement>('button[data-date="2026-09-30"]').disabled).toBe(true);
    expect($(".ds-calendar__previous").getAttribute("aria-disabled")).toBe("true");
    expect($(".ds-calendar__next").getAttribute("aria-disabled")).toBe("true");

    $("ds-calendar").focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedDate()).toBe("2026-10-01");
    await userEvent.keyboard("{PageUp}");
    expect(focusedDate()).toBe("2026-10-01");
  });

  it("turns pages with the header buttons", async () => {
    await mount(`<ds-calendar ${attributes} value="2026-10-12"></ds-calendar>`);
    await userEvent.click($(".ds-calendar__next"));
    expect(heading()).toBe("November 2026");
    await userEvent.click($(".ds-calendar__previous"));
    await userEvent.click($(".ds-calendar__previous"));
    expect(heading()).toBe("September 2026");
  });

  it("picks a single day", async () => {
    const root = await mount(`<ds-calendar ${attributes}></ds-calendar>`);
    const events = record(root, "change");
    await userEvent.click(day("2026-10-15"));
    expect($("ds-calendar").value).toBe("2026-10-15");
    expect($("ds-calendar").getAttribute("value")).toBe("2026-10-15");
    expect(day("2026-10-15").getAttribute("aria-pressed")).toBe("true");
    expect(events.length).toBe(1);
  });

  it("picks a range in two steps, in either order, with a preview", async () => {
    const root = await mount(`<ds-calendar-range ${attributes}></ds-calendar-range>`);
    const events = record(root, "rangestart", "change");
    const status = () => $(".ds-calendar__status").textContent;
    expect(status()).toBe("Select start date");

    await userEvent.click(day("2026-10-20"));
    expect(events.map((e) => e.type)).toEqual(["rangestart"]);
    expect(status()).toBe("Select end date");
    await userEvent.hover(day("2026-10-16"));
    expect(day("2026-10-18").hasAttribute("data-preview")).toBe(true);

    await userEvent.click(day("2026-10-16"));
    expect($("ds-calendar-range").value).toBe("2026-10-16/2026-10-20");
    expect(events.map((e) => e.type)).toEqual(["rangestart", "change"]);
    expect(day("2026-10-18").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-10-16").hasAttribute("data-range-start")).toBe(true);
    expect(day("2026-10-20").hasAttribute("data-range-end")).toBe(true);
  });

  it("toggles days in <ds-calendar-multi>", async () => {
    await mount(`<ds-calendar-multi ${attributes} value="2026-10-05"></ds-calendar-multi>`);
    await userEvent.click(day("2026-10-03"));
    await userEvent.click(day("2026-10-07"));
    await userEvent.click(day("2026-10-05"));
    expect($("ds-calendar-multi").value).toBe("2026-10-03 2026-10-07");
  });

  it("does not pick unavailable days (attributes and property)", async () => {
    const root = await mount(`<ds-calendar ${attributes} disallowed="2026-10-15" disallowed-weekdays="0 6"></ds-calendar>`);
    $("ds-calendar").isDateDisallowed = (date) => date.getUTCDate() === 22;
    const events = record(root, "change");

    for (const date of ["2026-10-15", "2026-10-17", "2026-10-18", "2026-10-22"]) {
      expect(day(date).getAttribute("aria-disabled")).toBe("true");
      // Playwright will not click aria-disabled elements; a real click still fires
      day(date).click();
    }
    expect($("ds-calendar").value).toBe("");
    expect(events.length).toBe(0);
    // still focusable, so keyboard users can move through them
    expect(focusedDate()).toBe("2026-10-22");
  });

  it("jumps to a month and a year with the select parts", async () => {
    await mount(`
      <ds-calendar ${attributes} value="2026-10-12" min="2020-03-01">
        <ds-calendar-select-month></ds-calendar-select-month>
        <ds-calendar-select-year max-years="10"></ds-calendar-select-year>
        <ds-calendar-month></ds-calendar-month>
      </ds-calendar>`);
    // placed directly inside, the selects move into the header, between ‹ and ›
    const header = $(".ds-calendar__header");
    expect([...header.children].map((child) => child.className)).toEqual([
      "ds-calendar__previous",
      "ds-calendar__heading",
      "ds-calendar__selects",
      "ds-calendar__next",
    ]);
    expect($(".ds-calendar__selects").children.length).toBe(2);
    expect($("ds-calendar").hasAttribute("data-selects")).toBe(true);

    const month = $<HTMLSelectElement>("ds-calendar-select-month select");
    const year = $<HTMLSelectElement>("ds-calendar-select-year select");
    expect(month.labels[0]?.textContent).toBe("Month");
    expect(month.selectedOptions[0]?.textContent).toBe("October");
    expect([...year.options].map((o) => o.textContent)).toEqual(
      ["2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029", "2030"],
    );

    const changes = record($("ds-calendar"), "change");
    month.focus();
    await userEvent.selectOptions(month, "2026-03-12");
    expect(heading()).toBe("March 2026");
    expect(document.activeElement).toBe(month); // the select keeps the focus
    await userEvent.selectOptions(year, "2021-03-12");
    expect(heading()).toBe("March 2021");
    expect($("ds-calendar").focusedDate).toBe("2021-03-12");
    // jumping is not picking: the select's own change does not leak out
    expect(changes.length).toBe(0);
    expect($("ds-calendar").value).toBe("2026-10-12");
  });

  it("disables months outside min/max in the month select", async () => {
    await mount(`<ds-calendar ${attributes} value="2026-10-12" min="2026-03-15"><ds-calendar-select-month></ds-calendar-select-month></ds-calendar>`);
    await nextFrame();
    const options = [...$<HTMLSelectElement>("select").options];
    expect(options.filter((o) => o.disabled).map((o) => o.textContent)).toEqual(["January", "February"]);
  });

  it("follows the reading direction with the arrow keys", async () => {
    await mount(`<div dir="rtl"><ds-calendar ${attributes} value="2026-10-12"></ds-calendar></div>`);
    $("ds-calendar").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedDate()).toBe("2026-10-11");
  });
});
