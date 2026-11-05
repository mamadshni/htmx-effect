/** The page shell shared by all modules: head (styles, htmx, design system) and navigation. */

import { HttpRouter, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";

export type PageName = "home" | "calendar" | "compare" | "range-picker" | "filters" | "export";

const links: ReadonlyArray<{ page: PageName; href: string; label: string }> = [
  { page: "home", href: "/", label: "Home" },
  { page: "calendar", href: "/calendar", label: "Calendar" },
  { page: "compare", href: "/compare", label: "cally vs ours" },
  { page: "range-picker", href: "/range-picker", label: "Range presets" },
  { page: "filters", href: "/filters", label: "Filters" },
  { page: "export", href: "/export", label: "Export" },
];

export const Layout = ({
  title,
  current,
  head,
  children,
}: {
  title: string;
  current: PageName;
  /** extra scripts and styles for this page */
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
          {links.map(({ page, href, label }) => (
            <a href={href} aria-current={page === current ? "page" : undefined}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      {children}
    </body>
  </html>
);

/** a GET route that answers with a page as a full HTML document (rendered once, at startup) */
export const pageRoute = (path: `/${string}`, page: Parameters<typeof toHtml>[0]) =>
  HttpRouter.add("GET", path, HttpServerResponse.html(`<!doctype html>${toHtml(page)}`));
