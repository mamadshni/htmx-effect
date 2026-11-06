/**
 * What a module is: a folder under src/ with its routes, views, styles and browser code, and
 * one export the app registers in main.tsx. Copying or deleting the folder (and that one line)
 * adds or removes everything it serves, its navigation link included.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/http";
import { build } from "esbuild";

export interface NavLink {
  readonly href: `/${string}`;
  readonly label: string;
}

export interface AppModule {
  /** its link in the site navigation (none: reachable by URL only) */
  readonly nav?: NavLink;
  readonly routes: Layer.Layer<never, never, HttpRouter.HttpRouter>;
}

/** a browser entry point bundled per request, so edits show up on reload (fast enough for a playground) */
const bundle = (entry: URL) =>
  Effect.promise(() =>
    build({ entryPoints: [fileURLToPath(entry)], bundle: true, format: "esm", target: "es2022", write: false }),
  ).pipe(
    Effect.map((result) =>
      HttpServerResponse.text(result.outputFiles[0]?.text ?? "", { contentType: "text/javascript; charset=utf-8" }),
    ),
  );

/** a GET route answering with a file as it is, read per request like the scripts are bundled */
export const fileRoute = (path: `/${string}`, file: URL, contentType: string) =>
  HttpRouter.add(
    "GET",
    path,
    Effect.promise(() => readFile(file, "utf8")).pipe(Effect.map((text) => HttpServerResponse.text(text, { contentType }))),
  );

/**
 * A module's own stylesheet and browser script (both optional, paths relative to the module:
 * `new URL("./x.css", import.meta.url)`). They are served under /assets/<module>/; `head`
 * links them, for the module's pages to pass to <Layout head>, and `routes` serves them.
 */
export const moduleAssets = (module: string, files: { readonly styles?: URL; readonly script?: URL }) => {
  const stylesPath = `/assets/${module}/styles.css` as const;
  const scriptPath = `/assets/${module}/client.js` as const;
  const { styles, script } = files;
  return {
    head: (
      <>
        {styles ? <link rel="stylesheet" href={stylesPath} /> : null}
        {script ? <script type="module" src={scriptPath}></script> : null}
      </>
    ),
    routes: Layer.mergeAll(
      styles ? fileRoute(stylesPath, styles, "text/css; charset=utf-8") : Layer.empty,
      script ? HttpRouter.add("GET", scriptPath, bundle(script)) : Layer.empty,
    ),
  };
};
