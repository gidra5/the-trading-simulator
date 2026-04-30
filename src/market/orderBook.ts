import { assert, unreachable } from "../utils";
import { cloneOrder, compareOrders, type OrderSide, type RegisteredOrder } from "./order";

export type OrderBook = {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
};

export type OrderBookAddChange = {
  kind: "add";
  side: OrderSide;
  order: RegisteredOrder;
};

export type OrderBookRemoveChange = {
  kind: "remove";
  side: OrderSide;
  order: RegisteredOrder;
};

export type OrderBookPartialFillChange = {
  kind: "partial-fill";
  side: OrderSide;
  order: RegisteredOrder;
};

export type OrderBookChange = OrderBookAddChange | OrderBookRemoveChange | OrderBookPartialFillChange;

export type OrderBookSnapshotEntry = {
  kind: "snapshot";
  revision: number;
  orderBook: OrderBook;
  timestamp: number;
};

export type OrderBookDeltaSnapshotEntry = {
  kind: "delta-snapshot";
  level: number;
  revision: number;
  timestamp: number;
  changes: OrderBookChange | OrderBookChange[];
  compactedChanges: OrderBookChange[];
};

export type OrderBookMapEntry = OrderBookSnapshotEntry | OrderBookDeltaSnapshotEntry;

export type OrderBookHeatmapEntry = {
  x: number;
  y: number;
  size: number;
};

export type OrderBookHistogramEntry = {
  kind: OrderSide;
  y: number;
  size: number;
};

export type OrderBookHeatmapRegion = {
  timestamp: [start: number, end: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};

export type OrderBookHistogramRegion = {
  price: [min: number, max: number];
  resolution: number;
};

export type OrderBookHistogramSeries = {
  cellHeight: number;
  sizes: number[];
};

export const initialOrderBook: OrderBook = {
  buy: [{ id: -2, price: 0.99, size: 1e2 }],
  sell: [{ id: -3, price: 1.01, size: 1e2 }],
};

export const cloneOrderBookFrom = (source: OrderBook): OrderBook => {
  return {
    buy: source.buy.map(cloneOrder),
    sell: source.sell.map(cloneOrder),
  };
};

const findOrderIndex = (orders: RegisteredOrder[], side: OrderSide, order: RegisteredOrder): number => {
  let low = 0;
  let high = orders.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (compareOrders(orders[mid]!, side, order) < 0) low = mid + 1;
    else high = mid;
  }

  return low;
};

export const applyOrderBookChange = (target: OrderBook, change: OrderBookChange): void => {
  const orders = target[change.side];
  const index = findOrderIndex(orders, change.side, change.order);
  if (change.kind === "add") orders.splice(index, 0, change.order);

  assert(
    orders[index]?.id === change.order.id,
    `expected order to match: ${change.kind} ${change.side}#${change.order.id} at ${index}, found ${
      orders[index]?.id ?? "none"
    }`,
  );
  if (change.kind === "remove") orders.splice(index, 1);
  if (change.kind === "partial-fill") orders[index] = change.order;
};

export const applyOrderBookEntryChanges = (target: OrderBook, changes: OrderBookChange | OrderBookChange[]): void => {
  if (Array.isArray(changes)) {
    for (const change of changes) applyOrderBookChange(target, change);
    return;
  }

  applyOrderBookChange(target, changes);
};

const changeListFrom = (changes: OrderBookChange | OrderBookChange[]): OrderBookChange[] =>
  Array.isArray(changes) ? changes : [changes];

const compactedChangeKey = (side: OrderSide, id: number): string => `${side}:${id}`;

const cloneOrderBookChange = (change: OrderBookChange): OrderBookChange => {
  return { ...change, order: cloneOrder(change.order) };
};

export const compactOrderBookChanges = (
  previousChanges: OrderBookChange[],
  nextChanges: OrderBookChange | OrderBookChange[],
): OrderBookChange[] => {
  const changes = new Map<string, OrderBookChange>();

  for (const change of previousChanges) {
    changes.set(compactedChangeKey(change.side, change.order.id), change);
  }

  for (const change of changeListFrom(nextChanges)) {
    const key = compactedChangeKey(change.side, change.order.id);
    const previousChange = changes.get(key);

    if (!previousChange) {
      changes.set(key, cloneOrderBookChange(change));
      continue;
    }

    if (change.kind === "add") unreachable("Expected order id to be unique");
    assert(previousChange.kind !== "remove", "Expected removed order not to be filled");

    if (previousChange.kind !== "add") {
      changes.set(key, change);
      continue;
    }

    if (change.kind === "partial-fill") previousChange.order.size = change.order.size;
    else changes.delete(key);
  }

  return Array.from(changes.values());
};
