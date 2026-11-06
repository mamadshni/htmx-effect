/** Calendar module: the showcase page and its styles. */

import { Layer } from "effect";
import { pageRoute } from "../layout.js";
import type { AppModule } from "../module.js";
import { assets, CalendarPage, nav } from "./page.js";

export const CalendarModule: AppModule = {
  nav,
  routes: Layer.mergeAll(pageRoute(nav.href, () => <CalendarPage />), assets.routes),
};
