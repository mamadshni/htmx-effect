import { describe, expect, it, vi } from "vitest";
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

const local = (filter = "") => `
  <ds-combobox-local${filter ? ` filter="${filter}"` : ""}>
    <input type="search" role="combobox" aria-label="Fruit" aria-controls="fruits" aria-expanded="false">
    ${options(["Apple", "Banana", "Cherry", "Äpfel"])}
  </ds-combobox-local>`;

const shown = () =>
  Array.from(document.querySelectorAll<HTMLElement>('#fruits [role="option"]:not([hidden])'), (o) => o.textContent);

describe("ds-combobox ArrowUp", () => {
  it("opens a closed list on the last option, like a menu button", async () => {
    await mount(combobox());
    input().focus();
    await userEvent.keyboard("{Escape}{ArrowUp}");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBe("o-Cherry");
  });
});

describe("ds-combobox Escape", () => {
  it("closes the list, then clears the field without opening it again", async () => {
    await mount(combobox());
    input().focus();
    await userEvent.keyboard("Ban");
    expect(input().getAttribute("aria-expanded")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("{Escape}");
    expect(input().value).toBe("");
    expect(input().getAttribute("aria-expanded")).toBe("false");
    await userEvent.keyboard("C");
    expect(input().getAttribute("aria-expanded")).toBe("true");
  });
});

describe("ds-combobox-local", () => {
  it("filters its own options as you type, ignoring case and accents", async () => {
    await mount(local());
    input().focus();
    expect(shown()).toEqual(["Apple", "Banana", "Cherry", "Äpfel"]);

    await userEvent.keyboard("AP");
    expect(shown()).toEqual(["Apple", "Äpfel"]);
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(input().value).toBe("Äpfel");
  });

  it("matches only the start with filter=starts-with, and highlights an exact match", async () => {
    await mount(local("starts-with"));
    input().focus();
    await userEvent.keyboard("an");
    expect(shown()).toEqual(["No results"]);
    await userEvent.keyboard("{Backspace}{Backspace}banana");
    expect(shown()).toEqual(["Banana"]);
    expect(input().getAttribute("aria-activedescendant")).toBe("o-Banana");
  });

  it("shows a translated empty state that cannot be picked", async () => {
    await mount(`<div lang="de">${local()}</div>`);
    input().focus();
    await userEvent.keyboard("xyz");
    expect(shown()).toEqual(["Keine Treffer"]);
    await userEvent.keyboard("{ArrowDown}");
    expect(input().hasAttribute("aria-activedescendant")).toBe(false);
    await userEvent.keyboard("{Backspace}{Backspace}{Backspace}");
    expect(shown()).toEqual(["Apple", "Banana", "Cherry", "Äpfel"]);
  });

  it("checks and reflects the filter input", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(local());
    const combobox = $("ds-combobox-local");
    combobox.filter = "starts-with";
    expect(combobox.getAttribute("filter")).toBe("starts-with");
    combobox.setAttribute("filter", "fuzzy");
    expect(combobox.filter).toBe("starts-with");
    expect(combobox.getAttribute("filter")).toBe("starts-with");
    expect(String(warn.mock.calls[0]?.[0])).toContain("ds-combobox-local.filter: expected contains | starts-with");
    warn.mockRestore();
  });
});
