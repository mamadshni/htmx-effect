/**
 * A form inside a popover is a draft, e.g. a filter's editor in a dialog under its chip:
 *
 *   <button popovertarget="status">Status: Open</button>
 *   <dialog id="status" popover>
 *     <form method="post">… <button>Apply</button>
 *       <button type="button" popovertarget="status" popovertargetaction="hide">Cancel</button>
 *     </form>
 *   </dialog>
 *
 * Closing the popover (Escape, a click outside, Cancel) discards the edits: its forms are
 * reset, so it shows the saved values when it opens again. A popover inside a form (a panel
 * of controls that save as they change) is left alone. Saving replaces or closes the
 * popover however the page likes; the reset after it is harmless.
 */

const onToggle = (event: Event) => {
  const popover = event.target;
  if (!(popover instanceof HTMLElement) || (event as ToggleEvent).newState !== "closed") return;
  if (!popover.matches("[popover]")) return;
  const forms = popover instanceof HTMLFormElement ? [popover] : popover.querySelectorAll("form");
  for (const form of forms) form.reset();
};

// once per page, even if the bundle is loaded twice
const installed = Symbol.for("@combo/design-system/popover-draft");
const page = globalThis as typeof globalThis & { [installed]?: true };

if (!page[installed]) {
  page[installed] = true;
  // toggle does not bubble
  document.addEventListener("toggle", onToggle, true);
}
