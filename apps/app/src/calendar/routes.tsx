/** Calendar module: the showcase page. */

import { HttpRouter, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import { documentHtml } from "../layout.js";
import { CalendarPage } from "./page.js";

export const CalendarRoutes = HttpRouter.add(
  "GET",
  "/calendar",
  HttpServerResponse.html(documentHtml(toHtml(<CalendarPage />))),
);
