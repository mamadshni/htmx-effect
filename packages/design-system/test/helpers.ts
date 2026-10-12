import "../src/index.js";
import "../src/index.css";

/** render markup into a fresh container */
export const mount = async (html: string) => {
  document.body.innerHTML = `<div id="root">${html}</div>`;
  await Promise.resolve();
  return document.getElementById("root")!;
};

/** querySelector that fails loudly; typed by tag name like querySelector */
export function $<K extends keyof HTMLElementTagNameMap>(selector: K): HTMLElementTagNameMap[K];
export function $<T extends HTMLElement = HTMLElement>(selector: string): T;
export function $(selector: string) {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`no element for ${selector}`);
  return element;
}

/** the events of the given types fired on (or bubbling to) a target */
export const record = (target: EventTarget, ...types: string[]) => {
  const events: { type: string; detail: unknown }[] = [];
  for (const type of types) {
    target.addEventListener(type, (event) => events.push({ type, detail: (event as CustomEvent).detail }));
  }
  return events;
};

/** the date of the focused calendar button */
export const focusedDate = () => (document.activeElement as HTMLElement | null)?.dataset.date;

export const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
