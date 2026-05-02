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
  timestamp: number;
  orderBook: OrderBook;
};

export type OrderBookDeltaEntry = {
  kind: "delta";
  revision: number;
  timestamp: number;
  changes: OrderBookChange | OrderBookChange[];
};

export type OrderBookDeltaSnapshotEntry = {
  kind: "delta-snapshot";
  level: number;
  revision: number;
  timestamp: number;
  changes: OrderBookChange | OrderBookChange[];
  compactedChanges: OrderBookChange[];
};

type OrderBookHistoryEntry = OrderBookSnapshotEntry | OrderBookDeltaEntry;
export type OrderBookMapEntry = OrderBookSnapshotEntry | OrderBookDeltaSnapshotEntry;

type AcceleratedOrderBookMapState = {
  entries: OrderBookMapEntry[];
  pendingChangesByLevel: Array<Array<OrderBookChange | OrderBookChange[]>>;
  processedEntries: number;
  deltaSnapshotInterval: number;
  fanout: number;
  levels: number;
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

const compactOrderBookChangeBatches = (
  previousChanges: Array<OrderBookChange | OrderBookChange[]>,
  nextChanges: OrderBookChange | OrderBookChange[],
): OrderBookChange[] => {
  let compactedChanges: OrderBookChange[] = [];

  for (const changes of previousChanges) {
    compactedChanges = compactOrderBookChanges(compactedChanges, changes);
  }

  return compactOrderBookChanges(compactedChanges, nextChanges);
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
  const [orderBookHistory, setOrderBookHistory] = createSignal<OrderBookHistoryEntry[]>(
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
  const revision = () => orderBookHistory()[orderBookHistory().length - 1].revision;
  const createOrderBookSnapshot = (timestamp: number, orderBook: OrderBook) =>
    setOrderBookHistory((entries) => {
      entries.push({ kind: "snapshot", revision: revision() + 1, timestamp, orderBook });
      return entries;
    });
  const createOrderBookDelta = (timestamp: number, changes: OrderBookChange | OrderBookChange[]) =>
    setOrderBookHistory((entries) => {
      entries.push({ kind: "delta", revision: revision() + 1, timestamp, changes });
      return entries;
    });

  const orderBook = createMemo<OrderBook>(
    (previousOrderBook) => {
      const entries = orderBookHistory();
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

  const acceleratedOrderBookMapState = createMemo<AcceleratedOrderBookMapState>(
    (previousState) => {
      const sourceEntries = orderBookHistory();
      const interval = deltaSnapshotInterval();
      const fanoutValue = fanout();
      const levelCount = levels();

      const canAppend =
        previousState.deltaSnapshotInterval === interval &&
        previousState.fanout === fanoutValue &&
        previousState.levels === levelCount &&
        previousState.processedEntries <= sourceEntries.length; // todo: compare revisions instead

      const nextState: AcceleratedOrderBookMapState = canAppend
        ? previousState
        : {
            entries: [],
            pendingChangesByLevel: [],
            processedEntries: 0,
            deltaSnapshotInterval: interval,
            fanout: fanoutValue,
            levels: levelCount,
          };

      for (let index = nextState.processedEntries; index < sourceEntries.length; index += 1) {
        const entry = sourceEntries[index]!;

        if (entry.kind === "snapshot") {
          nextState.entries.push(entry);
          nextState.pendingChangesByLevel = [];
          continue;
        }

        const deltaSnapshotLevel = revisionDeltaLevel(entry.revision);
        if (deltaSnapshotLevel > 0) {
          nextState.entries.push({
            kind: "delta-snapshot",
            level: deltaSnapshotLevel,
            revision: entry.revision,
            timestamp: entry.timestamp,
            changes: entry.changes,
            compactedChanges: compactOrderBookChangeBatches(
              nextState.pendingChangesByLevel[deltaSnapshotLevel - 1] ?? [],
              entry.changes,
            ),
          });

          for (let level = 1; level <= levelCount; level += 1) {
            if (level <= deltaSnapshotLevel) {
              nextState.pendingChangesByLevel[level - 1] = [];
            } else {
              const pendingChanges = nextState.pendingChangesByLevel[level - 1] ?? [];
              pendingChanges.push(entry.changes);
              nextState.pendingChangesByLevel[level - 1] = pendingChanges;
            }
          }

          continue;
        }

        nextState.entries.push({
          kind: "delta-snapshot",
          level: 0,
          revision: entry.revision,
          timestamp: entry.timestamp,
          changes: entry.changes,
          compactedChanges: [],
        });
        for (let level = 1; level <= levelCount; level += 1) {
          const pendingChanges = nextState.pendingChangesByLevel[level - 1] ?? [];
          pendingChanges.push(entry.changes);
          nextState.pendingChangesByLevel[level - 1] = pendingChanges;
        }
      }

      nextState.processedEntries = sourceEntries.length;
      return nextState;
    },
    {
      entries: [],
      pendingChangesByLevel: [],
      processedEntries: 0,
      deltaSnapshotInterval: Number.NaN,
      fanout: Number.NaN,
      levels: Number.NaN,
    },
    { equals: false },
  );

  const orderBookMap = () => acceleratedOrderBookMapState().entries;

  const appendChange = (timestamp: number, changes: OrderBookChange | OrderBookChange[]): void => {
    if (Array.isArray(changes) && changes.length === 0) return;
    changes = Array.isArray(changes) && changes.length === 1 ? changes[0]! : changes;

    const orderBookRevision = revision() + 1;

    if (orderBookRevision % snapshotInterval() === 0) {
      const nextOrderBook = cloneOrderBookFrom(orderBook());
      applyOrderBookEntryChanges(nextOrderBook, changes);
      createOrderBookSnapshot(timestamp, nextOrderBook);
      return;
    }

    createOrderBookDelta(timestamp, changes);
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

      if (entry.kind === "delta-snapshot" && entry.level === 0) {
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
