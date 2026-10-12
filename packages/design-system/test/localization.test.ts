import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, mount } from "./helpers.js";

const heading = () => $(".ds-calendar__heading").textContent;
const day = (date: string) => $<HTMLButtonElement>(`button[data-date="${date}"]:not([data-outside])`);

describe("localization", () => {
  it("formats the calendar and its labels in German", async () => {
    await mount(`
      <ds-calendar-range locale="de-DE" today="2026-10-12" value="2026-10-20/2026-10-22">
        <ds-calendar-select-month></ds-calendar-select-month>
        <ds-calendar-select-year></ds-calendar-select-year>
        <ds-calendar-month></ds-calendar-month>
      </ds-calendar-range>`);
    expect(heading()).toBe("Oktober 2026");
    expect($("th").getAttribute("abbr")).toBe("Montag"); // German weeks start on Monday
    expect(day("2026-10-20").getAttribute("aria-label")).toBe("Dienstag, 20. Oktober 2026");
    expect($(".ds-calendar__previous").getAttribute("aria-label")).toBe("Vorheriger Monat");
    expect($(".ds-calendar__status").textContent).toBe("Startdatum wählen");

    await userEvent.click(day("2026-10-14"));
    expect($(".ds-calendar__status").textContent).toBe("Enddatum wählen");
    expect($("ds-calendar-select-month label").textContent).toBe("Monat");
    expect($("ds-calendar-select-year label").textContent).toBe("Jahr");
    expect($<HTMLSelectElement>("ds-calendar-select-month select").selectedOptions[0]?.textContent).toBe("Oktober");
  });

  it("takes the language from the nearest lang when there is no locale", async () => {
    await mount(`<section lang="de"><ds-calendar today="2026-10-12" months="2"></ds-calendar></section>`);
    expect(heading()).toBe("Oktober–November 2026");
  });

  it("writes the date picker's hints and validation messages in German", async () => {
    await mount(`
      <form lang="de">
        <ds-date-picker name="due" today="2026-10-12" max="2026-12-31" required></ds-date-picker>
      </form>`);
    const picker = $("ds-date-picker");
    const input = $<HTMLInputElement>(".ds-date-picker__input");
    expect(input.placeholder).toBe("JJJJ-MM-TT");
    expect($(".ds-date-picker__toggle").getAttribute("aria-label")).toBe("Datum wählen");
    expect(picker.validationMessage).toBe("Bitte ein Datum wählen.");

    picker.value = "2027-01-04";
    expect(picker.validationMessage).toBe("Bitte 31. Dezember 2026 oder früher wählen.");
    await userEvent.type(input, "x");
    input.blur();
    expect(picker.validationMessage).toBe("Bitte ein Datum im Format JJJJ-MM-TT eingeben.");
  });

  it("switches language when the locale changes, and falls back to English", async () => {
    await mount(`<ds-date-picker range locale="de" required></ds-date-picker>`);
    const picker = $("ds-date-picker");
    expect(picker.validationMessage).toBe("Bitte einen Zeitraum wählen.");
    picker.setAttribute("locale", "fr");
    expect(picker.validationMessage).toBe("Please choose dates.");
    expect($<HTMLInputElement>(".ds-date-picker__input").placeholder).toBe("YYYY-MM-DD – YYYY-MM-DD");
  });
});
