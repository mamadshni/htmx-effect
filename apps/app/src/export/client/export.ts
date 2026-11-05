/**
 * "Export CSV" with a toast: fetches the link's CSV instead of following it, shows the pending
 * toast while the server creates the file, and saves it when the response is complete. Cancel
 * aborts the request; the server sees the connection close and stops. Toasts are cloned from the
 * page's <template id="export-toast-…"> elements.
 */

type ToastKind = "pending" | "done" | "cancelled" | "failed";

const region = document.getElementById("toasts")!;

const toastFrom = (kind: ToastKind) => {
  const template = document.getElementById(`export-toast-${kind}`) as HTMLTemplateElement;
  return template.content.firstElementChild!.cloneNode(true) as HTMLElement;
};

/** replaces a toast; focus moves to the new one's button when it was in the old one */
const replace = (old: HTMLElement, next: HTMLElement) => {
  const hadFocus = old.contains(document.activeElement);
  old.replaceWith(next);
  if (hadFocus) next.querySelector("button")?.focus();
};

const save = (url: string, name: string) => {
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
};

const exportFile = async (link: HTMLAnchorElement) => {
  const name = link.getAttribute("download") || "export";
  const toast = toastFrom("pending");
  region.append(toast);
  const controller = new AbortController();
  toast.querySelector("[data-toast-cancel]")!.addEventListener("click", () => controller.abort());

  try {
    const response = await fetch(link.href, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    // the body arrives page by page; blob() resolves once the server has sent the last one
    const url = URL.createObjectURL(await response.blob());
    const done = toastFrom("done");
    done.querySelector<HTMLAnchorElement>("[data-toast-download]")!.href = url;
    // free the file when the toast is dismissed
    done.querySelector("[data-toast-close]")!.addEventListener("click", () => URL.revokeObjectURL(url));
    replace(toast, done);
    save(url, name);
  } catch {
    replace(toast, toastFrom(controller.signal.aborted ? "cancelled" : "failed"));
  }
};

document.addEventListener("click", (event) => {
  const target = event.target as Element;
  const link = target.closest<HTMLAnchorElement>("a[data-export]");
  if (link) {
    event.preventDefault();
    void exportFile(link);
  }
  target.closest("[data-toast-close]")?.closest(".toast")?.remove();
});
