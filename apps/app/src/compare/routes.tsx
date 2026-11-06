/** Compare module: cally next to our calendar; the page, its styles and cally's script. */

import { Layer } from "effect";
import { pageRoute } from "../layout.js";
import { type AppModule, fileRoute } from "../module.js";
import { assets, callyPath, ComparePage, nav } from "./page.js";

export const CompareModule: AppModule = {
  nav,
  routes: Layer.mergeAll(
    pageRoute(nav.href, () => <ComparePage />),
    assets.routes,
    fileRoute(callyPath, new URL(import.meta.resolve("cally")), "text/javascript; charset=utf-8"),
  ),
};
