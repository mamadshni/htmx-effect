import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, focusedDate, mount, record } from "./helpers.js";

const form = (attributes = "") => `
  <form>
    <label for="due">Due</label>
    <ds-date-picker id="due" name="due" locale="en-US" today="2026-10-12" ${attributes}></ds-date-picker>
  </form>`;

const picker = () => $("ds-date-picker");
const input = () => $<HTMLInputElement>(".ds-date-picker__input");
const isOpen = () => $(".ds-date-picker__dialog").matches(":popover-open");
const day = (date: string) => $<HTMLButtonElement>(`button[data-date="${date}"]`);

describe("ds-date-picker", () => {
  it("is a labelled form control", async () => {
    await mount(form(`value="2026-10-05"`));
    expect(input().getAttribute("aria-labelledby")).toBe($("label").id);
    expect(new FormData($("form")).get("due")).toBe("2026-10-05");
    expect(input().value).toBe("2026-10-05");
  });

  it("opens the calendar, picks a day and reports one change", async () => {
    const root = await mount(form());
    const changes = record(root, "change");
    input().focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(isOpen()).toBe(true);
    expect(focusedDate()).toBe("2026-10-12");

    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(picker().value).toBe("2026-10-13");
    expect(input().value).toBe("2026-10-13");
    expect(document.activeElement).toBe(input());
    expect(isOpen()).toBe(false);
    // the calendar's own change stays inside; the picker reports one, from its input
    expect(changes.length).toBe(1);
  });

  it("closes on Escape and keeps the value", async () => {
    await mount(form(`value="2026-10-05"`));
    input().focus();
    await userEvent.keyboard("{ArrowDown}{ArrowRight}{Escape}");
    expect(picker().value).toBe("2026-10-05");
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(input());
  });

  it("validates required, min/max, unavailable days and typed text", async () => {
    await mount(form(`required min="2026-01-01" max="2026-12-31" disallowed-weekdays="0 6"`));
    expect(picker().validity.valueMissing).toBe(true);

    const typeValue = async (text: string) => {
      await userEvent.clear(input());
      await userEvent.type(input(), text);
      input().blur();
    };
    await typeValue("2026-13-01");
    expect(picker().validity.badInput).toBe(true);
    expect(input().value).toBe("2026-13-01"); // kept for correcting
    await typeValue("2027-01-04");
    expect(picker().validity.rangeOverflow).toBe(true);
    await typeValue("2026-10-17"); // a Saturday
    expect(picker().validity.customError).toBe(true);
    expect(picker().validationMessage).toBe("This date is not available.");
    await typeValue("2026-10-16");
    expect(picker().validity.valid).toBe(true);
    expect(input().getAttribute("aria-invalid")).toBe("false");
  });

  it("picks a range across two months", async () => {
    await mount(form(`range months="2"`));
    $<HTMLButtonElement>(".ds-date-picker__toggle").click();
    expect(document.querySelectorAll(".ds-calendar__table").length).toBe(2);
    await userEvent.click(day("2026-11-03"));
    await userEvent.click(day("2026-10-28"));
    expect(picker().value).toBe("2026-10-28/2026-11-03");
    expect([picker().start, picker().end]).toEqual(["2026-10-28", "2026-11-03"]);
    expect(input().value).toBe("2026-10-28 – 2026-11-03");
    expect(new FormData($("form")).get("due")).toBe("2026-10-28/2026-11-03");
  });

  it("resets with the form", async () => {
    await mount(form(`value="2026-10-05"`));
    picker().value = "2026-10-09";
    $<HTMLFormElement>("form").reset();
    expect(picker().value).toBe("2026-10-05");
  });
});
