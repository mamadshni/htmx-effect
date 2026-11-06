/** Range picker module: the page, its styles and its browser code (cally and Temporal bundled in). */

import { Layer } from "effect";
import { pageRoute } from "../layout.js";
import type { AppModule } from "../module.js";
import { assets, nav, RangePickerPage } from "./page.js";

export const RangePickerModule: AppModule = {
  nav,
  routes: Layer.mergeAll(pageRoute(nav.href, () => <RangePickerPage />), assets.routes),
};
