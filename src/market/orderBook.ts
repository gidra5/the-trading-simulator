import { createMemo, createSignal } from "solid-js";
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

export type PriceSpread = {
  buy: number;
  sell: number;
};
export type PriceHistoryEntry = {
  revision: number;
  timestamp: number;
  spread: PriceSpread;
};

type OrderBookOptions = {
  deltaSnapshotInterval: number;
  fanout: number;
  levels: number;
};

export const createOrderBook = (options: OrderBookOptions) => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(options.deltaSnapshotInterval);
  const [fanout, setFanout] = createSignal(options.fanout);
  const [levels, setLevels] = createSignal(options.levels);
  const snapshotInterval = () => deltaSnapshotInterval() * fanout() ** levels();

  const initialOrderBook = { buy: [], sell: [] };
  const [orderBookMap, setOrderBookMap] = createSignal<OrderBookMapEntry[]>(
    [
      {
        kind: "snapshot",
        revision: 0,
        timestamp: Date.now(),
        orderBook: initialOrderBook,
      },
    ],
    { equals: false },
  );

  const revision = () => orderBookMap()[orderBookMap().length - 1].revision;

  const orderBook = createMemo<OrderBook>(
    (previousOrderBook) => {
      const entries = orderBookMap();
      const latest = entries[entries.length - 1];

      if (latest.kind === "snapshot") {
        return cloneOrderBookFrom(latest.orderBook);
      }

      const nextOrderBook = previousOrderBook;
      applyOrderBookEntryChanges(nextOrderBook, latest.changes);
      return nextOrderBook;
    },
    cloneOrderBookFrom(initialOrderBook),
    { equals: false },
  );
  // TODO: when interval, fanout or levels change, it should rebuild the order book map
  const deltaLevels = createMemo<OrderBookChange[][]>(
    (previousChangesByLevel) => {
      const entries = orderBookMap();
      const latest = entries[entries.length - 1];

      if (latest.kind === "snapshot") {
        return [];
      }

      if (latest.level > 0) {
        const nextChangesByLevel = previousChangesByLevel.map((changes, index) =>
          index + 1 <= latest.level ? [] : compactOrderBookChanges(changes, latest.changes),
        );

        for (let level = previousChangesByLevel.length + 1; level <= latest.level; level += 1) {
          nextChangesByLevel[level - 1] = [];
        }

        return nextChangesByLevel;
      }

      const levelCount = levels();
      const nextChangesByLevel = previousChangesByLevel.slice();
      for (let level = 1; level <= levelCount; level += 1) {
        nextChangesByLevel[level - 1] = compactOrderBookChanges(nextChangesByLevel[level - 1] ?? [], latest.changes);
      }

      return nextChangesByLevel;
    },
    [],
    { equals: false },
  );

  const priceHistory = createMemo<PriceHistoryEntry[]>(
    (previousHistory) => {
      const spread = ((): PriceSpread => {
        // to decide spread we look at the opposite side offers
        const source = orderBook();
        return {
          buy: source.sell[source.sell.length - 1]?.price ?? Infinity,
          sell: source.buy[source.buy.length - 1]?.price ?? 0,
        };
      })();

      const next = () => {
        previousHistory.push({ revision: revision(), timestamp: Date.now(), spread });
        return previousHistory;
      };

      if (previousHistory.length === 0) return next();

      const latest = previousHistory[previousHistory.length - 1];
      if (latest.spread.buy === spread.buy && latest.spread.sell === spread.sell) return previousHistory;

      return next();
    },
    [],
    { equals: false },
  );

  const marketPriceSpread = () => {
    const history = priceHistory();
    const entry = history[history.length - 1];
    return entry.spread;
  };

  const midPrice = () => {
    const spread = marketPriceSpread();
    return (spread.buy + spread.sell) / 2;
  };

  const revisionDeltaLevel = (revision: number): number => {
    const interval = deltaSnapshotInterval();

    if (revision % interval !== 0) return 0;

    let ratio = (revision % snapshotInterval()) / interval;
    if (ratio === 0) return levels();

    let level = 1;
    while (level < levels() && ratio % fanout() === 0) {
      ratio /= fanout();
      level += 1;
    }

    return level;
  };

  const appendChange = (timestamp: number, changes: OrderBookChange | OrderBookChange[]): void => {
    if (Array.isArray(changes) && changes.length === 0) return;
    changes = Array.isArray(changes) && changes.length === 1 ? changes[0]! : changes;

    const orderBookRevision = revision() + 1;
    const nextOrderBook = cloneOrderBookFrom(orderBook());
    applyOrderBookEntryChanges(nextOrderBook, changes);

    if (orderBookRevision % snapshotInterval() === 0) {
      setOrderBookMap((entries) => {
        entries.push({
          kind: "snapshot",
          revision: orderBookRevision,
          timestamp,
          orderBook: nextOrderBook,
        });
        return entries;
      });
      return;
    }

    const deltaSnapshotLevel = revisionDeltaLevel(orderBookRevision);
    if (deltaSnapshotLevel > 0) {
      setOrderBookMap((entries) => {
        const deltaSnapshotChanges = compactOrderBookChanges(deltaLevels()[deltaSnapshotLevel - 1] ?? [], changes);

        entries.push({
          kind: "delta-snapshot",
          level: deltaSnapshotLevel,
          revision: orderBookRevision,
          timestamp,
          changes,
          compactedChanges: deltaSnapshotChanges,
        });
        return entries;
      });
      return;
    }

    setOrderBookMap((entries) => {
      entries.push({
        kind: "delta-snapshot",
        level: 0,
        revision: orderBookRevision,
        timestamp,
        changes,
        compactedChanges: [],
      });
      return entries;
    });
  };

  const reconstructAt = (targetIndex: number): OrderBook | null => {
    const entries = orderBookMap();
    const pendingChanges: Array<OrderBookChange | OrderBookChange[]> = [];
    let coveredUntilCheckpointLevel = 0;

    for (let index = targetIndex; index >= 0; index -= 1) {
      const entry = entries[index];

      if (!entry) continue;

      if (entry.kind === "snapshot") {
        const reconstructedOrderBook = cloneOrderBookFrom(entry.orderBook);

        for (let pendingIndex = pendingChanges.length - 1; pendingIndex >= 0; pendingIndex -= 1) {
          applyOrderBookEntryChanges(reconstructedOrderBook, pendingChanges[pendingIndex]!);
        }

        return reconstructedOrderBook;
      }

      if (coveredUntilCheckpointLevel > 0) {
        if (entry.kind === "delta-snapshot" && entry.level >= coveredUntilCheckpointLevel) {
          pendingChanges.push(entry.compactedChanges);
          coveredUntilCheckpointLevel = entry.level;
        }

        continue;
      }

      if (entry.level === 0) {
        pendingChanges.push(entry.changes);
      } else {
        pendingChanges.push(entry.compactedChanges);
        coveredUntilCheckpointLevel = entry.level;
      }
    }

    return null;
  };

  const reconstruct = (revision: number): OrderBook | null => {
    const entries = orderBookMap();
    const targetIndex = entries.findIndex((entry) => entry.revision === revision);

    if (targetIndex === -1) return null;
    return reconstructAt(targetIndex);
  };

  return {
    snapshotInterval,
    deltaSnapshotInterval,
    setDeltaSnapshotInterval,
    fanout,
    setFanout,
    levels,
    setLevels,
    orderBookMap,
    revision,

    orderBook,
    appendChange,
    reconstruct,
    reconstructAt,

    priceHistory,
    marketPriceSpread,
    midPrice,
  };
};
