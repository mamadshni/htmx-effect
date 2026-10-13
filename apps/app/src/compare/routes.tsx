/** Compare module: cally next to our calendar. */

import { HttpRouter, HttpServerResponse } from "effect/http";
import { toHtml } from "tsx-to-html";
import { documentHtml } from "../layout.js";
import { ComparePage } from "./page.js";

export const CompareRoutes = HttpRouter.add(
  "GET",
  "/compare",
  HttpServerResponse.html(documentHtml(toHtml(<ComparePage />))),
);
