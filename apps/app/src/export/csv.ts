/**
 * The orders as a CSV stream: read from the database a page at a time and sent as each page
 * arrives. Interrupting the stream (the client went away) stops the query in flight.
 */

import { Effect, Stream } from "effect";
import { countOrders, fetchOrders, type Order } from "./db.js";

export const fileName = "orders.csv";

/** rows per query */
const pageSize = 2;

/** a field in quotes when it holds a comma, quote or line break (RFC 4180) */
const csvField = (value: string | number) => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const csvLine = (fields: ReadonlyArray<string | number>) => `${fields.map(csvField).join(",")}\r\n`;

const orderLine = (o: Order) =>
  csvLine([o.id, o.customer, o.product, o.quantity, o.total.toFixed(2), o.date]);

/**
 * counts the orders first, so a database that is down fails before the response starts (a real
 * error status); after that, the header line and one chunk per page
 */
export const ordersCsv = Effect.gen(function* () {
  const total = yield* countOrders;
  const pages = Stream.range(0, Math.ceil(total / pageSize) - 1).pipe(
    Stream.mapEffect((page) => fetchOrders(page * pageSize, pageSize)),
    Stream.map((rows) => rows.map(orderLine).join("")),
  );
  return Stream.concat(
    Stream.make(csvLine(["Order", "Customer", "Product", "Quantity", "Total", "Date"])),
    pages,
  ).pipe(Stream.encodeText);
});
