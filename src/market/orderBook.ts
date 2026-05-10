import { Accessor, createMemo, createSignal } from "solid-js";
import { assert } from "../utils";
import { cloneOrder, compareOrders, type OrderSide, type RestingOrder } from "./order";
import { time } from "../simulation/time";

export type OrderBook = {
  // sorted by price and then id
  // since id is unique and sequential, it is also a queue order
  buy: RestingOrder[];
  sell: RestingOrder[];
};

export type OrderBookAddChange = {
  kind: "add";
  side: OrderSide;
  order: RestingOrder;
};

export type OrderBookRemoveChange = {
  kind: "remove";
  side: OrderSide;
  order: RestingOrder;
};

export type OrderBookPartialFillChange = {
  kind: "partial-fill";
  side: OrderSide;
  prevSize: number;
  order: RestingOrder;
};

export type OrderBookChange = OrderBookAddChange | OrderBookRemoveChange | OrderBookPartialFillChange;
export type OrderBookChangeset = OrderBookChange[];
type OrderBookChangesetMap = Map<number, OrderBookChange>;

export type OrderBookSnapshotEntry = {
  kind: "snapshot";
  revision: number;
  timestamp: number;
  orderBook: OrderBook;
  changes: OrderBookChangeset;
};

export type OrderBookDeltaEntry = {
  kind: "delta";
  revision: number;
  timestamp: number;
  changes: OrderBookChangeset;
};

export type OrderBookDeltaSnapshotEntry = {
  kind: "delta-snapshot";
  level: number;
  revision: number;
  timestamp: number;
  changes: OrderBookChangeset;
  compactedChanges: OrderBookChangesetMap;
};

// todo: only deltas, move snapshots into acc structure
export type OrderBookHistoryEntry = OrderBookSnapshotEntry | OrderBookDeltaEntry;
export type OrderBookMapEntry = OrderBookSnapshotEntry | OrderBookDeltaSnapshotEntry;
type OrderBookHistory = OrderBookHistoryEntry[];
type OrderBookMap = OrderBookMapEntry[];

type AcceleratedOrderBookMapState = {
  entries: OrderBookMap;
  pendingChangesByLevel: Array<OrderBookChangesetMap>;
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

const findOrderIndex = (orders: RestingOrder[], side: OrderSide, order: RestingOrder): number => {
  let low = 0;
  let high = orders.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (compareOrders(orders[mid]!, side, order) < 0) low = mid + 1;
    else high = mid;
  }

  return low;
};

const findRevisionIndex = (orderMap: OrderBookMapEntry[], revision: number): number => {
  let low = 0;
  let high = orderMap.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (orderMap[mid]!.revision < revision) low = mid + 1;
    else high = mid;
  }

  return low;
};

const applyChange = (target: OrderBook, change: OrderBookChange): void => {
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

export const applyChangeset = (target: OrderBook, changes: OrderBookChangeset): void => {
  for (const change of changes) applyChange(target, change);
};

const applyChangesetMap = (target: OrderBook, changes: OrderBookChangesetMap): void => {
  for (const change of changes.values()) applyChange(target, change);
};

const cloneOrderBookChange = (change: OrderBookChange): OrderBookChange => {
  return { ...change, order: cloneOrder(change.order) };
};

const mergeIntoChangesetMap = (prev: OrderBookChangesetMap, nextChanges: OrderBookChangeset): OrderBookChangesetMap => {
  for (const change of nextChanges) {
    const key = change.order.id;
    const prevChange = prev.get(key);

    if (!prevChange) prev.set(key, cloneOrderBookChange(change));
    else if (prevChange.kind !== "add") prev.set(key, change);
    else if (change.kind === "partial-fill") prevChange.order.size = change.order.size;
    else prev.delete(key);
  }

  return prev;
};

type OrderBookOptions = {
  deltaSnapshotInterval: Accessor<number>;
  fanout: Accessor<number>;
  levels: Accessor<number>;
};

export const createOrderBook = ({ deltaSnapshotInterval, fanout, levels }: OrderBookOptions) => {
  const snapshotInterval = () => deltaSnapshotInterval() * fanout() ** levels();

  const initialOrderBook: OrderBook = { buy: [], sell: [] };
  const [orderBookHistory, setOrderBookHistory] = createSignal<OrderBookHistory>(
    [
      {
        kind: "snapshot",
        revision: 0,
        timestamp: time(),
        orderBook: initialOrderBook,
        changes: [],
      },
    ],
    { equals: false },
  );
  const latestOrderBookChange = () => orderBookHistory()[orderBookHistory().length - 1];
  const revision = () => orderBookHistory()[orderBookHistory().length - 1].revision;
  const createOrderBookSnapshot = (timestamp: number, orderBook: OrderBook, changes: OrderBookChangeset) =>
    setOrderBookHistory((entries) => {
      entries.push({ kind: "snapshot", revision: revision() + 1, timestamp, orderBook, changes });
      return entries;
    });
  const createOrderBookDelta = (timestamp: number, changes: OrderBookChangeset) =>
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
      applyChangeset(nextOrderBook, latest.changes);
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
        previousHistory.push({ revision: revision(), timestamp: latestOrderBookChange().timestamp, spread });
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

  // todo: incremental
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

  // todo: optimize for powers of two fanout and use the same trick as for candles
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
        const prevChanged = nextState.pendingChangesByLevel[deltaSnapshotLevel - 1] ?? new Map();

        nextState.entries.push({
          kind: "delta-snapshot",
          level: deltaSnapshotLevel,
          revision: entry.revision,
          timestamp: entry.timestamp,
          changes: entry.changes,
          compactedChanges: deltaSnapshotLevel > 0 ? mergeIntoChangesetMap(prevChanged, entry.changes) : new Map(),
        });

        for (let level = 1; level <= levelCount; level += 1) {
          if (level <= deltaSnapshotLevel) {
            nextState.pendingChangesByLevel[level - 1] = new Map();
          } else {
            const pendingChanges = nextState.pendingChangesByLevel[level - 1] ?? new Map();
            nextState.pendingChangesByLevel[level - 1] = mergeIntoChangesetMap(pendingChanges, entry.changes);
          }
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

  const appendChange = (changes: OrderBookChangeset): void => {
    if (changes.length === 0) return;

    const orderBookRevision = revision() + 1;

    if (orderBookRevision % snapshotInterval() === 0) {
      const nextOrderBook = cloneOrderBookFrom(orderBook());
      applyChangeset(nextOrderBook, changes);
      createOrderBookSnapshot(time(), nextOrderBook, changes);
      return;
    }

    createOrderBookDelta(time(), changes);
  };

  const reconstructAt = (targetIndex: number): OrderBook | null => {
    const entries = orderBookMap();
    const pendingChanges: Array<number> = [];
    let coveredUntilCheckpointLevel = 0;

    for (let index = targetIndex; index >= 0; index -= 1) {
      const entry = entries[index];

      if (!entry) continue;

      if (entry.kind === "snapshot") {
        const reconstructedOrderBook = cloneOrderBookFrom(entry.orderBook);

        for (let pendingIndex = pendingChanges.length - 1; pendingIndex >= 0; pendingIndex -= 1) {
          const changeset = entries[pendingChanges[pendingIndex]!];
          assert(changeset.kind !== "snapshot");

          if (changeset.level > 0) {
            applyChangesetMap(reconstructedOrderBook, changeset.compactedChanges);
          } else applyChangeset(reconstructedOrderBook, changeset.changes);
        }

        return reconstructedOrderBook;
      }

      if (coveredUntilCheckpointLevel > 0) {
        if (entry.kind === "delta-snapshot" && entry.level >= coveredUntilCheckpointLevel) {
          pendingChanges.push(index);
          coveredUntilCheckpointLevel = entry.level;
        }
      } else if (entry.kind === "delta-snapshot" && entry.level === 0) {
        pendingChanges.push(index);
      } else {
        pendingChanges.push(index);
        coveredUntilCheckpointLevel = entry.level;
      }
    }

    return null;
  };

  const reconstruct = (revision: number): OrderBook | null => {
    const entries = orderBookMap();
    const targetIndex = findRevisionIndex(entries, revision);

    if (targetIndex === -1) return null;
    return reconstructAt(targetIndex);
  };

  const findOrderBookIndex = (orderBookMap: OrderBookHistory, timestamp: number): number => {
    let low = 0;
    let high = orderBookMap.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if (orderBookMap[mid]!.timestamp < timestamp) low = mid + 1;
      else high = mid;
    }

    return Math.max(low - 1, 0);
  };

  // todo: maybe use generator instead?
  // todo: pass down price range as well? So we don't compute anything outside it.
  const reconstructRegionStream = (
    interval: [start: number, end: number],
    stream: (slice: OrderBook, timestamp: number) => void,
  ): void => {
    assert(interval[0] < interval[1]);
    const orderBookIndex = findOrderBookIndex(orderBookHistory(), interval[0]);
    let orderBook = reconstructAt(orderBookIndex);
    if (!orderBook) return;
    stream(orderBook, orderBookHistory()[orderBookIndex]!.timestamp);

    for (let index = orderBookIndex + 1; index < orderBookHistory().length; index += 1) {
      const entry = orderBookHistory()[index]!;

      if (entry.kind === "snapshot") orderBook = cloneOrderBookFrom(entry.orderBook);
      else applyChangeset(orderBook, entry.changes);
      stream(orderBook, entry.timestamp);

      if (entry.timestamp > interval[1]) return;
    }
  };

  return {
    snapshotInterval,
    orderBookMap,
    revision,

    orderBookHistory,
    latestOrderBookChange,
    orderBook,
    appendChange,
    reconstruct,
    reconstructAt,
    reconstructRegionStream,

    priceHistory,
    marketPriceSpread,
    midPrice,
  };
};
