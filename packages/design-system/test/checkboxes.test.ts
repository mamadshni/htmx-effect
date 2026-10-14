import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, mount } from "./helpers.js";

const focusedValue = () => (document.activeElement as HTMLInputElement | null)?.value;

const panel = () => `
  <form>
    <button type="button" id="open" popovertarget="filters">Filters</button>
    <fieldset id="filters" popover>
      <legend>Show tasks that are</legend>
      <label><input type="checkbox" name="filter" value="open"> Open</label>
      <label><input type="checkbox" name="filter" value="mine"> Assigned to me</label>
      <label><input type="checkbox" name="filter" value="disabled" disabled> Archived</label>
      <label><input type="checkbox" name="filter" value="bug"> Bugs</label>
      <button type="submit">Apply</button>
    </fieldset>
    <input type="checkbox" id="outside" value="outside">
  </form>`;

afterEach(() => document.querySelector<HTMLElement>(":popover-open")?.hidePopover());

describe("checkboxes in a popover panel", () => {
  it("opens with ArrowDown on the button, on the first checkbox; ArrowUp: the last", async () => {
    await mount(panel());
    $("#open").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect($("#filters").matches(":popover-open")).toBe(true);
    expect(focusedValue()).toBe("open");
    $("#filters").hidePopover();
    $("#open").focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(focusedValue()).toBe("bug");
  });

  it("moves with the arrows (wrapping, skipping disabled), Home, End and a letter; Space stays native", async () => {
    await mount(panel());
    $("#open").focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(focusedValue()).toBe("mine");
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedValue()).toBe("bug");
    await userEvent.keyboard("{ArrowDown}");
    expect(focusedValue()).toBe("open");
    await userEvent.keyboard("{End}");
    expect(focusedValue()).toBe("bug");
    await userEvent.keyboard("{Home}a");
    expect(focusedValue()).toBe("mine");
    await userEvent.keyboard(" ");
    expect($<HTMLInputElement>('input[value="mine"]').checked).toBe(true);
  });

  it("leaves checkboxes outside popovers and Tab alone", async () => {
    await mount(panel());
    $("#outside").focus();
    await userEvent.keyboard("{ArrowUp}");
    expect(document.activeElement?.id).toBe("outside");

    $("#open").focus();
    await userEvent.keyboard("{ArrowDown}{Tab}");
    expect(focusedValue()).toBe("mine");
  });
});
