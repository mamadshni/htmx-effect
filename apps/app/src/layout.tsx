/**
 * The page shell shared by all modules: head (shared styles, htmx, design system) and the
 * navigation, built from the registered modules (main.tsx), so no module is named here.
 */

import { Effect } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import type { NavLink } from "./module.js";

let links: ReadonlyArray<NavLink> = [];

/** set once at startup by main.tsx, before any page is rendered */
export const setNavigation = (navigation: ReadonlyArray<NavLink>) => {
  links = navigation;
};

export const Layout = ({
  title,
  current,
  head,
  children,
}: {
  title: string;
  /** the nav link of the module the page belongs to (marked as the current page) */
  current?: NavLink | undefined;
  /** extra scripts and styles for this page, e.g. the module's assets' head */
  head?: JSX.Node;
  children?: JSX.Node;
}) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{title} · combo-htmx</title>
      <link rel="stylesheet" href="/assets/design-system/index.css" />
      <link rel="stylesheet" href="/assets/app/app.css" />
      <script src="/assets/htmx.js"></script>
      <script src="/assets/design-system/index.js"></script>
      {head}
    </head>
    <body>
      <header class="site-header">
        <nav class="site-nav" aria-label="Main">
          <strong class="site-nav__brand">combo-htmx</strong>
          {links.map(({ href, label }) => (
            <a href={href} aria-current={href === current?.href ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      {children}
    </body>
  </html>
);

/** a full HTML document */
export const document = (page: Parameters<typeof toHtml>[0]) => HttpServerResponse.html(`<!doctype html>${toHtml(page)}`);

/**
 * A GET route answering with a page that does not change: rendered on the first request (the
 * navigation is complete by then), then reused.
 */
export const pageRoute = (path: `/${string}`, page: () => Parameters<typeof toHtml>[0]) => {
  let response: HttpServerResponse.HttpServerResponse | undefined;
  return HttpRouter.add("GET", path, Effect.sync(() => (response ??= document(page()))));
};
