import { afterEach, describe, expect, it, vi } from "vitest";
import { $, mount } from "./helpers.js";

describe("inputs: properties and attributes stay in sync and are checked", () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  afterEach(() => warn.mockClear());

  it("reflects calendar properties to attributes", async () => {
    await mount(`<ds-calendar today="2026-10-12"></ds-calendar>`);
    const calendar = $("ds-calendar");
    calendar.months = 2;
    calendar.locale = "de";
    calendar.firstDayOfWeek = 0;
    calendar.disallowedWeekdays = "0 6";
    calendar.showOutsideDays = true;
    expect(calendar.getAttribute("months")).toBe("2");
    expect(calendar.getAttribute("locale")).toBe("de");
    expect(calendar.getAttribute("first-day-of-week")).toBe("0");
    expect(calendar.getAttribute("disallowed-weekdays")).toBe("0 6");
    expect(calendar.hasAttribute("show-outside-days")).toBe(true);
    expect($(".ds-calendar__heading").textContent).toBe("Oktober–November 2026");
  });

  it("reads calendar attributes into properties, and back to defaults when removed", async () => {
    await mount(`<ds-calendar-range months="2" min="2026-10-05" first-day-of-week="1" show-outside-days></ds-calendar-range>`);
    const calendar = $("ds-calendar-range");
    expect([calendar.months, calendar.min, calendar.firstDayOfWeek, calendar.showOutsideDays]).toEqual([
      2,
      "2026-10-05",
      1,
      true,
    ]);
    calendar.removeAttribute("months");
    calendar.removeAttribute("first-day-of-week");
    calendar.removeAttribute("show-outside-days");
    expect([calendar.months, calendar.firstDayOfWeek, calendar.showOutsideDays]).toEqual([1, null, false]);
  });

  it("keeps the previous value when an input is invalid, and restores its attribute", async () => {
    await mount(`<ds-calendar months="2" min="2026-10-05"></ds-calendar>`);
    const calendar = $("ds-calendar");

    calendar.months = 0;
    expect(calendar.months).toBe(2);
    calendar.setAttribute("min", "not a date");
    expect(calendar.min).toBe("2026-10-05");
    expect(calendar.getAttribute("min")).toBe("2026-10-05");
    calendar.disallowed = "2026-10-05 tomorrow";
    expect(calendar.disallowed).toBe("");

    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0]?.[0])).toContain("ds-calendar.months: expected an integer from 1 to 12, got 0");
  });

  it("checks the parts' inputs too", async () => {
    await mount(`
      <ds-calendar>
        <ds-calendar-month offset="1"></ds-calendar-month>
        <ds-calendar-select-year max-years="5"></ds-calendar-select-year>
      </ds-calendar>`);
    const month = $("ds-calendar-month");
    const year = $("ds-calendar-select-year");
    expect([month.offset, year.maxYears]).toEqual([1, 5]);

    month.offset = -1;
    year.setAttribute("max-years", "lots");
    expect([month.offset, year.maxYears]).toEqual([1, 5]);
    expect(year.getAttribute("max-years")).toBe("5");
    month.removeAttribute("offset");
    expect(month.offset).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("treats the picker's value attribute as defaultValue, like <input>", async () => {
    await mount(`<form><ds-date-picker name="due" value="2026-10-05"></ds-date-picker></form>`);
    const picker = $("ds-date-picker");
    expect([picker.defaultValue, picker.value]).toEqual(["2026-10-05", "2026-10-05"]);

    picker.value = "2026-10-09";
    expect(picker.getAttribute("value")).toBe("2026-10-05"); // the current value is not reflected
    picker.defaultValue = "2026-10-20";
    expect(picker.value).toBe("2026-10-09"); // edited: the default no longer applies
    $<HTMLFormElement>("form").reset();
    expect(picker.value).toBe("2026-10-20");
  });

  it("reflects picker booleans, checks their type and switches the calendar for `range`", async () => {
    await mount(`<ds-date-picker></ds-date-picker>`);
    const picker = $("ds-date-picker");
    picker.required = true;
    picker.range = true;
    expect(picker.hasAttribute("required")).toBe(true);
    expect(picker.hasAttribute("range")).toBe(true);
    expect(document.querySelector("ds-calendar-range")).not.toBeNull();

    picker.required = "yes" as never;
    expect(picker.required).toBe(true);
    expect(String(warn.mock.calls[0]?.[0])).toContain("ds-date-picker.required: expected a boolean");

    picker.removeAttribute("range");
    expect(picker.range).toBe(false);
    expect(document.querySelector("ds-calendar")).not.toBeNull();
  });

  it("passes its inputs on to the inner calendar", async () => {
    await mount(`<ds-date-picker min="2026-10-05" months="2" locale="de" disallowed="2026-10-20"></ds-date-picker>`);
    const calendar = $("ds-calendar");
    expect([calendar.min, calendar.months, calendar.locale, calendar.disallowed, calendar.showOutsideDays]).toEqual([
      "2026-10-05",
      2,
      "de",
      "2026-10-20",
      false,
    ]);
  });
});
