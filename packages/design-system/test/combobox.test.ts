import { describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, mount, nextFrame } from "./helpers.js";

const options = (items: string[], selected = "") =>
  `<ul id="fruits" role="listbox" popover="manual">${
    items.length
      ? items
          .map((item) => `<li id="o-${item}" role="option"${item === selected ? ` aria-selected="true"` : ""}>${item}</li>`)
          .join("")
      : `<li id="o-empty" role="option" aria-disabled="true">No results</li>`
  }</ul>`;

const combobox = () => `
  <ds-combobox>
    <input type="search" role="combobox" aria-label="Fruit" aria-controls="fruits" aria-expanded="false">
    ${options(["Apple", "Banana", "Cherry"])}
  </ds-combobox>`;

const input = () => $<HTMLInputElement>("input");
const listbox = () => $("#fruits");

describe("ds-combobox", () => {
  it("opens on focus and moves the highlight with the keyboard", async () => {
    await mount(combobox());
    input().focus();
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(listbox().matches(":popover-open")).toBe(true);

    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(input().getAttribute("aria-activedescendant")).toBe("o-Banana");
    await userEvent.keyboard("{Enter}");
    expect(input().value).toBe("Banana");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });

  it("resyncs when the server swaps the listbox (no htmx needed)", async () => {
    await mount(combobox());
    input().focus();
    listbox().outerHTML = options(["Cherry"], "Cherry");
    await nextFrame();
    expect(listbox().matches(":popover-open")).toBe(true);
    expect(input().getAttribute("aria-activedescendant")).toBe("o-Cherry");
  });

  it("skips the empty state and closes on Escape", async () => {
    await mount(combobox());
    input().focus();
    listbox().outerHTML = options([]);
    await nextFrame();
    await userEvent.keyboard("{ArrowDown}");
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    await userEvent.keyboard("{Escape}");
    expect(input().getAttribute("aria-expanded")).toBe("false");
  });
});
