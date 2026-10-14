import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import { $, mount, nextFrame } from "./helpers.js";

const focused = () => document.activeElement?.textContent?.trim();
const isOpen = (id: string) => $(`#${id}`).matches(":popover-open");

const menuButton = () => `
  <button id="trigger" popovertarget="actions">Actions</button>
  <div id="actions" popover role="menu" aria-labelledby="trigger">
    <button role="menuitem" id="edit">Edit</button>
    <button role="menuitem" popovertarget="share" aria-haspopup="menu">Share</button>
    <div id="share" popover role="menu" aria-label="Share">
      <button role="menuitem">Email</button>
      <button role="menuitem">Copy link</button>
    </div>
    <button role="menuitem" aria-disabled="true">Archive</button>
    <div role="separator"></div>
    <button role="menuitemcheckbox" aria-checked="false">Show hidden</button>
    <div role="group" aria-label="Sort">
      <button role="menuitemradio" aria-checked="true">Name</button>
      <button role="menuitemradio" aria-checked="false">Date</button>
    </div>
    <button role="menuitem">Delete</button>
  </div>
  <button id="after">After</button>`;

const menubar = () => `
  <div role="menubar" aria-label="Editor">
    <button role="menuitem" popovertarget="file" aria-haspopup="menu">File</button>
    <button role="menuitem" popovertarget="view" aria-haspopup="menu">View</button>
    <button role="menuitem">Help</button>
  </div>
  <div id="file" popover role="menu"><button role="menuitem">New</button><button role="menuitem">Open</button></div>
  <div id="view" popover role="menu"><button role="menuitem">Zoom</button></div>`;

afterEach(() => {
  for (const open of document.querySelectorAll<HTMLElement>(":popover-open")) open.hidePopover();
});

describe("menu button", () => {
  it("opens with ArrowDown on the first item, ArrowUp on the last; a click opens it too", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(isOpen("actions")).toBe(true);
    expect(focused()).toBe("Edit");
    await userEvent.keyboard("{Escape}");
    expect(isOpen("actions")).toBe(false);
    expect(document.activeElement?.id).toBe("trigger");

    await userEvent.keyboard("{ArrowUp}");
    expect(focused()).toBe("Delete");
    await userEvent.keyboard("{Escape}");

    await userEvent.click($("#trigger"));
    await nextFrame();
    expect(focused()).toBe("Edit");
  });

  it("moves with arrows (wrapping, disabled items included), Home, End and a letter", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}{ArrowUp}");
    expect(focused()).toBe("Delete");
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("Edit");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}");
    expect(focused()).toBe("Archive");
    await userEvent.keyboard("{End}");
    expect(focused()).toBe("Delete");
    await userEvent.keyboard("{Home}");
    expect(focused()).toBe("Edit");
    await userEvent.keyboard("d");
    expect(focused()).toBe("Date");
    await userEvent.keyboard("d");
    expect(focused()).toBe("Delete");
  });

  it("clicks an item with Enter, closes and goes back to the button", async () => {
    await mount(menuButton());
    let clicks = 0;
    $("#edit").addEventListener("click", () => clicks++);
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(clicks).toBe(1);
    expect(isOpen("actions")).toBe(false);
    expect(document.activeElement?.id).toBe("trigger");
  });

  it("toggles checkbox and radio items with Space and keeps the menu open", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}s"); // Share
    await userEvent.keyboard("s"); // Show hidden
    await userEvent.keyboard(" ");
    expect($('[role="menuitemcheckbox"]').getAttribute("aria-checked")).toBe("true");
    await userEvent.keyboard("d "); // Date
    const radios = Array.from(document.querySelectorAll('[role="menuitemradio"]'), (r) => r.getAttribute("aria-checked"));
    expect(radios).toEqual(["false", "true"]);
    expect(isOpen("actions")).toBe(true);
  });

  it("does not activate a disabled item", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}a{Enter}");
    expect(focused()).toBe("Archive");
    expect(isOpen("actions")).toBe(true);
  });

  it("opens a submenu with ArrowRight and closes it with ArrowLeft", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowRight}");
    expect(isOpen("share")).toBe(true);
    expect(isOpen("actions")).toBe(true);
    expect(focused()).toBe("Email");
    await userEvent.keyboard("{ArrowLeft}");
    expect(isOpen("share")).toBe(false);
    expect(focused()).toBe("Share");

    // Enter in a submenu closes every menu
    await userEvent.keyboard("{Enter}{ArrowDown}{Enter}");
    expect(isOpen("share")).toBe(false);
    expect(isOpen("actions")).toBe(false);
    expect(document.activeElement?.id).toBe("trigger");
  });

  it("closes on Tab and moves on", async () => {
    await mount(menuButton());
    $("#trigger").focus();
    await userEvent.keyboard("{ArrowDown}{Tab}");
    expect(isOpen("actions")).toBe(false);
    expect(document.activeElement?.id).toBe("after");
  });
});

describe("menubar", () => {
  it("has one tab stop and moves along the bar with ArrowRight/ArrowLeft", async () => {
    await mount(menubar());
    const items = document.querySelectorAll<HTMLElement>('[role="menubar"] > [role="menuitem"]');
    items[0]!.focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(focused()).toBe("View");
    expect(Array.from(items, (i) => i.tabIndex)).toEqual([-1, 0, -1]);
    await userEvent.keyboard("{ArrowRight}{ArrowRight}");
    expect(focused()).toBe("File");
  });

  it("opens a menu with ArrowDown and moves to the next menu with ArrowRight inside it", async () => {
    await mount(menubar());
    $<HTMLElement>('[role="menubar"] [role="menuitem"]').focus();
    await userEvent.keyboard("{ArrowDown}");
    expect(focused()).toBe("New");
    await userEvent.keyboard("{ArrowRight}");
    expect(isOpen("file")).toBe(false);
    expect(isOpen("view")).toBe(true);
    expect(focused()).toBe("Zoom");
    await userEvent.keyboard("{ArrowLeft}");
    expect(focused()).toBe("New");
    await userEvent.keyboard("{Escape}");
    expect(focused()).toBe("File");
  });
});
