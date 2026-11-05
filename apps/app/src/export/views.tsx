/**
 * Export page: a table of orders and "Export CSV", a link to the CSV (GET /export/orders.csv).
 * Without JavaScript the browser downloads it like any file. With it, client/export.ts fetches
 * the CSV instead and shows a toast from the templates below while the server creates it,
 * Cancel aborts the request, and the finished file is saved. One request does the whole
 * export, so nothing is kept on the server between requests.
 */

import { Layout } from "../layout.js";
import { fileName } from "./csv.js";
import { orders } from "./db.js";

const money = new Intl.NumberFormat("en", { style: "currency", currency: "EUR" });

export const ExportPage = () => (
  <Layout title="Export" current="export" head={<script type="module" src="/assets/export.js"></script>}>
    <main class="page">
      <header class="intro">
        <h1>Export</h1>
        <p>
          Creating the CSV takes 10 seconds. A toast tells you while it is being created, and the file downloads
          by itself when it is ready.
        </p>
      </header>

      <section class="card" aria-labelledby="orders-title">
        <div class="export-header">
          <h2 id="orders-title" class="card__title">
            Orders
          </h2>
          <a class="button" href="/export/orders.csv" download={fileName} data-export>
            Export CSV
          </a>
        </div>
        <div class="table-scroll">
          <table class="api-table">
            <thead>
              <tr>
                <th scope="col">Order</th>
                <th scope="col">Customer</th>
                <th scope="col">Product</th>
                <th scope="col" class="export-number">
                  Qty
                </th>
                <th scope="col" class="export-number">
                  Total
                </th>
                <th scope="col">Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr>
                  <th scope="row">{o.id}</th>
                  <td>{o.customer}</td>
                  <td>{o.product}</td>
                  <td class="export-number">{o.quantity}</td>
                  <td class="export-number">{money.format(o.total)}</td>
                  <td>{o.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>

    {/* polite: a toast is announced when it appears and when it changes to "finished" */}
    <div id="toasts" class="toasts" role="status" aria-live="polite"></div>
    <template id="export-toast-pending">
      <PendingToast />
    </template>
    <template id="export-toast-done">
      <DoneToast />
    </template>
    <template id="export-toast-cancelled">
      <CancelledToast />
    </template>
    <template id="export-toast-failed">
      <FailedToast />
    </template>
  </Layout>
);

const CloseButton = () => (
  <button type="button" class="toast__close" aria-label="Dismiss" data-toast-close>
    ×
  </button>
);

/** while the server creates the file; Cancel aborts the request */
const PendingToast = () => (
  <div class="toast">
    <span class="toast__spinner" aria-hidden="true"></span>
    <p class="toast__text">Creating the CSV file…</p>
    <button type="button" class="toast__action" data-toast-cancel>
      Cancel
    </button>
  </div>
);

/** the file is ready (and is being downloaded); the link is there in case the download was blocked */
const DoneToast = () => (
  <div class="toast toast--done">
    <span class="toast__icon" aria-hidden="true">
      ✓
    </span>
    <p class="toast__text">
      The CSV file is ready.{" "}
      <a href="" download={fileName} data-toast-download>
        Download again
      </a>
    </p>
    <CloseButton />
  </div>
);

const CancelledToast = () => (
  <div class="toast">
    <p class="toast__text">The export was cancelled.</p>
    <CloseButton />
  </div>
);

const FailedToast = () => (
  <div class="toast toast--error">
    <p class="toast__text">Creating the CSV file failed. Please try again.</p>
    <CloseButton />
  </div>
);
