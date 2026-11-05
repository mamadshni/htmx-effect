/**
 * A stand-in for the orders database: the table, and queries that take as long as real ones over
 * the network. Only the latency is faked; the queries are interruptible like a driver's that
 * takes an AbortSignal, so cancelling an export stops the query in flight.
 */

import { Effect } from "effect";

export interface Order {
  readonly id: string;
  readonly customer: string;
  readonly product: string;
  readonly quantity: number;
  readonly total: number;
  readonly date: string;
}

const customers = ["Anna Weber", "Ben Fischer", "Clara Schulz", "David Wagner", "Emma Becker"];
const products = ["Keyboard", "Monitor", "Mouse", "Headset", "Webcam", "Laptop stand", "USB hub"];

export const orders: ReadonlyArray<Order> = Array.from({ length: 20 }, (_, i) => {
  const quantity = (i % 4) + 1;
  return {
    id: `ORD-${String(1001 + i)}`,
    customer: customers[i % customers.length]!,
    product: products[(i * 3) % products.length]!,
    quantity,
    total: quantity * (19.9 + ((i * 7) % 12) * 10),
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
  };
});

/** SELECT count(*) FROM orders */
export const countOrders = Effect.sleep("1 second").pipe(Effect.as(orders.length));

/** SELECT * FROM orders ORDER BY id LIMIT <limit> OFFSET <offset>: a slow query (~1 s a page) */
export const fetchOrders = (offset: number, limit: number) =>
  Effect.sleep("900 millis").pipe(Effect.as(orders.slice(offset, offset + limit)));
