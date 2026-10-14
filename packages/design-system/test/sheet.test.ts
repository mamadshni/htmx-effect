import { afterEach, describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { $, mount, nextFrame, record } from "./helpers.js";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const handle = () => $<HTMLButtonElement>(".ds-sheet__handle");

/** a mouse pointer event at the handle's middle, moved to clientY */
const pointer = (type: string, clientY: number) => {
  const box = handle().getBoundingClientRect();
  return new PointerEvent(type, { bubbles: true, pointerId: 1, button: 0, clientX: box.left + box.width / 2, clientY });
};

/** drag the handle by dy px (negative: up); slow (no flick) unless `flick` */
const drag = async (dy: number, { flick = false } = {}) => {
  const box = handle().getBoundingClientRect();
  const y = box.top + box.height / 2;
  handle().dispatchEvent(pointer("pointerdown", y));
  const steps = 5;
  for (let i = 1; i <= steps; i++) {
    dispatchEvent(pointer("pointermove", y + (dy * i) / steps));
    await wait(flick ? 4 : 20);
  }
  if (!flick) await wait(150);
  dispatchEvent(pointer("pointerup", y + dy));
  handle().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await nextFrame();
};

const bottomSheet = (attributes = `snap-points="25 50 90"`) => `
  <button popovertarget="places">Places</button>
  <ds-bottom-sheet ${attributes}>
    <div id="places" popover="manual"><header><h2>Places</h2></header><p>List</p></div>
  </ds-bottom-sheet>`;

const modalSheet = () => `
  <button commandfor="filters" command="show-modal">Filters</button>
  <ds-modal-sheet>
    <dialog id="filters" aria-label="Filters"><p>Options</p><form method="dialog"><button>Done</button></form></dialog>
  </ds-modal-sheet>`;

describe("ds-bottom-sheet", () => {
  afterEach(() => document.querySelector<HTMLElement>(":popover-open")?.hidePopover());

  it("opens at its size with a handle and snaps to the nearest size after a drag", async () => {
    await mount(bottomSheet());
    const sheet = $("ds-bottom-sheet");
    const events = record(sheet, "snapchange");
    await userEvent.click($("button[popovertarget]"));
    expect(sheet.open).toBe(true);
    expect($("#places").style.blockSize).toBe("25dvh");
    expect(handle().getAttribute("aria-label")).toBe("Resize sheet, size 1 of 3");

    // up by 30% of the viewport: 55% is nearest to 50%
    await drag(-0.3 * innerHeight);
    expect(sheet.snap).toBe(1);
    expect(sheet.getAttribute("snap")).toBe("1");
    expect($("#places").style.blockSize).toBe("50dvh");
    expect(events).toEqual([{ type: "snapchange", detail: { snap: 1 } }]);
  });

  it("goes one size further on a flick, and closes when dragged below the smallest size", async () => {
    await mount(bottomSheet(`snap-points="25 50 90" snap="1"`));
    const sheet = $("ds-bottom-sheet");
    sheet.show();
    await drag(-20, { flick: true });
    expect(sheet.snap).toBe(2);

    await drag(0.8 * innerHeight);
    expect(sheet.open).toBe(false);
  });

  it("steps through the sizes with the handle button and the arrow keys", async () => {
    await mount(bottomSheet());
    const sheet = $("ds-bottom-sheet");
    sheet.show();
    handle().focus();
    await userEvent.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
    expect(sheet.snap).toBe(2);
    await userEvent.keyboard("{ArrowDown}");
    expect(sheet.snap).toBe(1);
    await userEvent.click(handle());
    expect(sheet.snap).toBe(2);
    await userEvent.click(handle());
    expect(sheet.snap).toBe(0);
  });

  it("checks its inputs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await mount(bottomSheet());
    const sheet = $("ds-bottom-sheet");
    sheet.setAttribute("snap-points", "50 120");
    expect(sheet.snapPoints).toBe("25 50 90");
    expect(sheet.getAttribute("snap-points")).toBe("25 50 90");
    expect(String(warn.mock.calls[0]?.[0])).toContain("ds-bottom-sheet.snapPoints: expected numbers from 1 to 100");
    warn.mockRestore();
  });
});

describe("ds-modal-sheet", () => {
  it("opens modally from a command button, fits its content, and closes when dragged down", async () => {
    await mount(modalSheet());
    const dialog = $<HTMLDialogElement>("#filters");
    await userEvent.click($("button[command]"));
    expect(dialog.matches(":modal")).toBe(true);
    expect(dialog.getAttribute("closedby")).toBe("any");
    expect(dialog.style.blockSize).toBe(""); // fits its content
    // one size: the handle is only for dragging
    expect(handle().tabIndex).toBe(-1);

    const closed = record(dialog, "close");
    await drag(dialog.getBoundingClientRect().height * 0.8);
    expect(dialog.open).toBe(false);
    await wait(0);
    expect(closed.length).toBe(1);
  });

  it("snaps back when dragged a little, and closes with Escape", async () => {
    await mount(modalSheet());
    const dialog = $<HTMLDialogElement>("#filters");
    $("ds-modal-sheet").show();
    await drag(10);
    expect(dialog.open).toBe(true);
    expect(dialog.style.blockSize).toBe("");
    await userEvent.keyboard("{Escape}");
    expect(dialog.open).toBe(false);
  });

  it("puts the handle back when the content is replaced", async () => {
    await mount(modalSheet());
    $("#filters").innerHTML = "<p>New</p>";
    await nextFrame();
    expect($("#filters").firstElementChild?.className).toBe("ds-sheet__handle");
  });
});

describe("ds-modal-sheet parsed from the page's HTML", () => {
  it("sets up its dialog when it arrives after the element connected (as the parser does)", async () => {
    document.body.innerHTML = "";
    const sheet = document.createElement("ds-modal-sheet");
    document.body.append(sheet);
    const dialog = document.createElement("dialog");
    dialog.innerHTML = "<p>Hi</p>";
    sheet.append(dialog);
    await nextFrame();
    expect(dialog.getAttribute("closedby")).toBe("any");
    expect(dialog.firstElementChild?.className).toBe("ds-sheet__handle");
  });
});

describe("ds-bottom-sheet handle after a drag", () => {
  it("still steps on the next click when the drag ended off the handle", async () => {
    await mount(bottomSheet());
    const sheet = $("ds-bottom-sheet");
    sheet.show();
    const y = handle().getBoundingClientRect().top;
    handle().dispatchEvent(pointer("pointerdown", y));
    dispatchEvent(pointer("pointermove", y - 10));
    await wait(150);
    dispatchEvent(pointer("pointerup", y - 10)); // no click on the handle follows
    await wait(0);
    await userEvent.click(handle());
    expect(sheet.snap).toBe(1);
    sheet.close();
  });
});
