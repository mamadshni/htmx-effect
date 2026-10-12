import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, focusedDate, mount, record } from "./helpers.js";

const calendar = (attributes = "") =>
  `<ds-calendar locale="en-US" first-day-of-week="1" today="2026-10-12" ${attributes}></ds-calendar>`;

const day = (date: string) => $<HTMLButtonElement>(`button[data-date="${date}"]`);
const heading = () => $(".ds-calendar__heading").textContent;

describe("ds-calendar", () => {
  it("renders 6 weeks of day buttons with labels, today and the selected day", async () => {
    await mount(calendar(`value="2026-10-20"`));
    expect(document.querySelectorAll("tbody button[data-date]").length).toBe(42);
    expect(heading()).toBe("October 2026");
    expect(day("2026-10-12").getAttribute("aria-current")).toBe("date");
    expect(day("2026-10-20").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-10-21").getAttribute("aria-pressed")).toBe("false");
    expect(day("2026-10-20").getAttribute("aria-label")).toBe("Tuesday, October 20, 2026");
    // neighbouring days are shown dimmed; Monday is the first column
    expect(day("2026-09-28").hasAttribute("data-outside")).toBe(true);
    expect($("th").getAttribute("abbr")).toBe("Monday");
  });

  it("moves focus with the keyboard and reports focusday / pagechange", async () => {
    const root = await mount(calendar(`value="2026-10-30"`));
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
    expect(events.find((e) => e.type === "pagechange")?.detail).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
    });
  });

  it("disables days outside min/max, clamps focus and marks prev/next", async () => {
    await mount(calendar(`value="2026-10-02" min="2026-10-01" max="2026-10-31"`));
    expect(day("2026-09-30").disabled).toBe(true);
    expect($(".ds-calendar__previous").getAttribute("aria-disabled")).toBe("true");
    expect($(".ds-calendar__next").getAttribute("aria-disabled")).toBe("true");

    $("ds-calendar").focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedDate()).toBe("2026-10-01");
    await userEvent.keyboard("{PageUp}");
    expect(focusedDate()).toBe("2026-10-01");
    expect(heading()).toBe("October 2026");
  });

  it("picks a single day", async () => {
    const root = await mount(calendar());
    const events = record(root, "change");
    await userEvent.click(day("2026-10-15"));
    expect($("ds-calendar").value).toBe("2026-10-15");
    expect(day("2026-10-15").getAttribute("aria-pressed")).toBe("true");
    expect(events.length).toBe(1);
  });

  it("picks a range in two steps, in either order, with a preview", async () => {
    const root = await mount(calendar(`selection="range"`));
    const events = record(root, "rangestart", "change");
    const status = () => $(".ds-calendar__status").textContent;
    expect(status()).toBe("Select start date");

    await userEvent.click(day("2026-10-20"));
    expect(events.map((e) => e.type)).toEqual(["rangestart"]);
    expect(status()).toBe("Select end date");
    await userEvent.hover(day("2026-10-16"));
    expect(day("2026-10-18").hasAttribute("data-preview")).toBe(true);

    await userEvent.click(day("2026-10-16"));
    expect($("ds-calendar").value).toBe("2026-10-16/2026-10-20");
    expect(events.map((e) => e.type)).toEqual(["rangestart", "change"]);
    expect(day("2026-10-18").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-10-16").hasAttribute("data-range-start")).toBe(true);
    expect(day("2026-10-20").hasAttribute("data-range-end")).toBe(true);
  });

  it("toggles days in multiple mode", async () => {
    await mount(calendar(`selection="multiple" value="2026-10-05"`));
    await userEvent.click(day("2026-10-03"));
    await userEvent.click(day("2026-10-07"));
    await userEvent.click(day("2026-10-05"));
    expect($("ds-calendar").value).toBe("2026-10-03 2026-10-07");
  });

  it("does not pick unavailable days (attributes and property)", async () => {
    const root = await mount(calendar(`disallowed="2026-10-15" disallowed-weekdays="0 6"`));
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

  it("has every day available when nothing is disallowed", async () => {
    await mount(calendar());
    expect(document.querySelectorAll('button[aria-disabled="true"]').length).toBe(0);
  });

  it("shows several months side by side", async () => {
    const root = await mount(calendar(`months="2" value="2026-10-30"`));
    const events = record(root, "pagechange");
    expect(document.querySelectorAll(".ds-calendar__table").length).toBe(2);
    expect(heading()).toBe("October – November 2026");
    // neighbouring days are left out (they would repeat days of the other month)
    expect(document.querySelector("button[data-outside]")).toBeNull();

    $("ds-calendar").focus();
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(focusedDate()).toBe("2026-11-01");
    expect(events.length).toBe(0);
    await userEvent.keyboard("{PageDown}");
    expect(heading()).toBe("November – December 2026");
    expect(events.at(-1)?.detail).toEqual({ start: "2026-11-01", end: "2026-12-31" });
  });

  it("zooms out to months and years and back in", async () => {
    await mount(calendar(`value="2026-10-12"`));
    await userEvent.click($(".ds-calendar__heading"));
    expect(heading()).toBe("2026");
    await userEvent.click($(".ds-calendar__heading"));
    expect(heading()).toBe("2016 – 2027");
    await userEvent.click(day("2025-01-01"));
    expect(heading()).toBe("2025");
    await userEvent.click(day("2025-03-01"));
    expect(heading()).toBe("March 2025");
    expect(focusedDate()).toBe("2025-03-12");
  });

  it("follows the reading direction with the arrow keys", async () => {
    await mount(`<div dir="rtl">${calendar(`value="2026-10-12"`)}</div>`);
    $("ds-calendar").focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focusedDate()).toBe("2026-10-11");
  });
});
