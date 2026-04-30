import { createMemo, createRoot, createSignal } from "solid-js";
import { cloneOrder, oppositeSide, type MakeOrderResult, type Order, type OrderSide, type RegisteredOrder } from "./order";
import {
  applyOrderBookChange,
  applyOrderBookEntryChanges,
  cloneOrderBookFrom,
  compactOrderBookChanges,
  initialOrderBook,
  type OrderBook,
  type OrderBookChange,
  type OrderBookHeatmapEntry,
  type OrderBookHeatmapRegion,
  type OrderBookHistogramEntry,
  type OrderBookHistogramRegion,
  type OrderBookHistogramSeries,
  type OrderBookMapEntry,
} from "./orderBook";

export type { MakeOrderResult, OrderSide } from "./order";
export type {
  OrderBookHeatmapEntry,
  OrderBookHeatmapRegion,
  OrderBookHistogramEntry,
  OrderBookHistogramRegion,
  OrderBookHistogramSeries,
} from "./orderBook";
export { applyOrderBookChange, oppositeSide };

type PriceSpread = {
  buy: number;
  sell: number;
};
type PriceHistoryEntry = {
  revision: number;
  timestamp: number;
  spread: PriceSpread;
};
export type PriceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const initialTimestamp = Date.now();
let orderBookRevision = 0;

const initialOrderBookMapEntry: OrderBookMapEntry = {
  kind: "snapshot",
  revision: orderBookRevision,
  timestamp: initialTimestamp,
  orderBook: initialOrderBook,
};
const initialPriceHistory: PriceHistoryEntry[] = [
  {
    revision: orderBookRevision,
    timestamp: initialTimestamp,
    spread: {
      buy: 1.01,
      sell: 0.99,
    },
  },
];

const priceSpreadFromOrderBook = (
  source: OrderBook,
  fallback: PriceSpread = initialPriceHistory[0]!.spread,
): PriceSpread => ({
  buy: source.sell[source.sell.length - 1]?.price ?? fallback.buy,
  sell: source.buy[source.buy.length - 1]?.price ?? fallback.sell,
});

const {
  snapshotInterval,
  deltaSnapshotInterval,
  setDeltaSnapshotInterval,
  fanout,
  setFanout,
  levels,
  setLevels,
  orderBookMap,
  setOrderBookMap,
  orderBook,
  orderBookDeltaLevels,

  priceHistory,
  marketPriceSpread,
  midPrice,
} = createRoot(() => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [fanout, setFanout] = createSignal(5);
  const [levels, setLevels] = createSignal(5);
  const snapshotInterval = () => deltaSnapshotInterval() * fanout() ** levels();

  const [orderBookMap, setOrderBookMap] = createSignal<OrderBookMapEntry[]>([initialOrderBookMapEntry], {
    equals: false,
  });

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

  const orderBookDeltaLevels = createMemo<OrderBookChange[][]>(
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
      const entries = orderBookMap();
      const latest = entries[entries.length - 1];
      const latestHistory = previousHistory[previousHistory.length - 1];

      if (latestHistory?.revision === latest.revision) {
        return previousHistory;
      }

      const spread = priceSpreadFromOrderBook(orderBook(), latestHistory?.spread);

      if (latestHistory?.spread.buy === spread.buy && latestHistory.spread.sell === spread.sell) {
        return previousHistory;
      }

      previousHistory.push({
        revision: latest.revision,
        timestamp: latest.timestamp,
        spread,
      });
      return previousHistory;
    },
    initialPriceHistory,
    { equals: false },
  );

  const marketPriceSpread = createMemo((): PriceSpread => {
    const history = priceHistory();
    const lastSpread = history[history.length - 1]?.spread;

    return priceSpreadFromOrderBook(orderBook(), lastSpread);
  });

  const midPrice = createMemo((): number => {
    const spread = marketPriceSpread();
    return (spread.buy + spread.sell) / 2;
  });

  return {
    snapshotInterval,
    deltaSnapshotInterval,
    setDeltaSnapshotInterval,
    fanout,
    setFanout,
    levels,
    setLevels,
    orderBookMap,
    setOrderBookMap,
    orderBook,
    orderBookDeltaLevels,

    priceHistory,
    marketPriceSpread,
    midPrice,
  };
});

const appendOrderBookMapEntry = (timestamp: number, changes: OrderBookChange | OrderBookChange[]): void => {
  if (Array.isArray(changes) && changes.length === 0) return;
  changes = Array.isArray(changes) && changes.length === 1 ? changes[0]! : changes;

  orderBookRevision += 1;
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

  const deltaSnapshotLevel = getOrderBookDeltaSnapshotLevel(orderBookRevision);
  if (deltaSnapshotLevel > 0) {
    setOrderBookMap((entries) => {
      const deltaSnapshotChanges = compactOrderBookChanges(
        orderBookDeltaLevels()[deltaSnapshotLevel - 1] ?? [],
        changes,
      );

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

const getOrderBookDeltaSnapshotLevel = (revision: number): number => {
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

const reconstructOrderBookAtIndex = (entries: OrderBookMapEntry[], targetIndex: number): OrderBook | null => {
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

export const reconstructOrderBookAtRevision = (revision: number): OrderBook | null => {
  const entries = orderBookMap();
  const targetIndex = entries.findIndex((entry) => entry.revision === revision);

  if (targetIndex === -1) return null;
  return reconstructOrderBookAtIndex(entries, targetIndex);
};

const lowerBoundOrderBookMapByTimestamp = (entries: OrderBookMapEntry[], timestamp: number): number => {
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (entries[mid]!.timestamp < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

export const setOrderBookDeltaSnapshotInterval = (interval: number): void => {
  if (!Number.isFinite(interval) || interval <= 0) return;

  setDeltaSnapshotInterval(Math.floor(interval));
};

export const setOrderBookDeltaSnapshotFanout = (fanout: number): void => {
  if (!Number.isFinite(fanout) || fanout < 2) return;

  setFanout(Math.floor(fanout));
};

export const setOrderBookDeltaSnapshotLevels = (levels: number): void => {
  if (!Number.isFinite(levels) || levels < 1) return;

  setLevels(Math.floor(levels));
};

export const getOrderBookHistoryStats = (): {
  entries: number;
  snapshots: number;
  deltaSnapshots: number;
  deltaSnapshotLevels: number[];
  deltas: number;
  changes: number;
  revision: number;
  snapshotInterval: number;
  deltaSnapshotInterval: number;
  deltaSnapshotFanout: number;
  deltaSnapshotLevelCount: number;
} => {
  let snapshots = 0;
  let deltaSnapshots = 0;
  const deltaSnapshotLevels: number[] = [];
  let deltas = 0;
  let changes = 0;

  const entries = orderBookMap();

  for (const entry of entries) {
    if (entry.kind === "snapshot") {
      snapshots += 1;
    } else if (entry.kind === "delta-snapshot") {
      deltaSnapshots += 1;
      deltaSnapshotLevels[entry.level] = (deltaSnapshotLevels[entry.level] ?? 0) + 1;
      changes += entry.compactedChanges.length;
    }

    if (entry.kind === "delta-snapshot" && entry.level === 0) {
      deltas += 1;
      changes += Array.isArray(entry.changes) ? entry.changes.length : 1;
    }
  }

  for (let level = 0; level <= levels(); level += 1) {
    deltaSnapshotLevels[level] ??= 0;
  }

  return {
    entries: entries.length,
    snapshots,
    deltaSnapshots,
    deltaSnapshotLevels,
    deltas,
    changes,
    revision: orderBookRevision,
    snapshotInterval: snapshotInterval(),
    deltaSnapshotInterval: deltaSnapshotInterval(),
    deltaSnapshotFanout: fanout(),
    deltaSnapshotLevelCount: levels(),
  };
};

export const getOrderBookRegion = (region: OrderBookHeatmapRegion): OrderBookHeatmapEntry[] => {
  const resolution = region.resolution;

  const cellSize: [time: number, price: number] = [
    Math.max(region.timestamp[1] - region.timestamp[0], 1) / resolution[0],
    Math.max(region.price[1] - region.price[0], Number.EPSILON) / resolution[1],
  ];
  const heatmap: Map<number, OrderBookHeatmapEntry> = new Map();
  const entries = orderBookMap();
  const firstRegionEntryIndex = lowerBoundOrderBookMapByTimestamp(entries, region.timestamp[0]);
  let reconstructedOrderBook =
    firstRegionEntryIndex > 0 ? reconstructOrderBookAtIndex(entries, firstRegionEntryIndex - 1) : null;

  for (let entryIndex = firstRegionEntryIndex; entryIndex < entries.length; entryIndex += 1) {
    const entry = entries[entryIndex]!;

    if (entry.timestamp > region.timestamp[1]) {
      break;
    }

    if (entry.kind === "snapshot") {
      reconstructedOrderBook = cloneOrderBookFrom(entry.orderBook);
    } else if (reconstructedOrderBook && entry.kind === "delta-snapshot") {
      applyOrderBookEntryChanges(reconstructedOrderBook, entry.changes);
    }

    if (!reconstructedOrderBook) {
      continue;
    }

    const x = Math.floor((entry.timestamp - region.timestamp[0]) / cellSize[0]);
    if (x < 0 || x >= resolution[0]) {
      continue;
    }

    const orders = [...reconstructedOrderBook.buy, ...reconstructedOrderBook.sell];
    for (const order of orders) {
      if (order.price < region.price[0] || order.price > region.price[1]) {
        continue;
      }

      const y = Math.floor((order.price - region.price[0]) / cellSize[1]);
      if (y < 0 || y >= resolution[1]) {
        continue;
      }

      const key = y * resolution[0] + x;
      const cell = heatmap.get(key);
      if (cell) {
        cell.size += order.size;
      } else {
        heatmap.set(key, { x, y, size: order.size });
      }
    }
  }

  const cells = Array.from(heatmap.values());
  cells.push({ x: resolution[0] - 1, y: resolution[1] - 1, size: 0 });
  return cells;
};

export const getOrderBookHistogram = (region: OrderBookHistogramRegion): OrderBookHistogramEntry[] => {
  const currentOrderBook = orderBook();
  const resolution = Math.max(0, Math.floor(region.resolution));
  const cellHeight = Math.max(region.price[1] - region.price[0], Number.EPSILON) / Math.max(resolution, 1);
  const buySizes = new Array<number>(resolution).fill(0);
  const sellSizes = new Array<number>(resolution).fill(0);
  const histogram: OrderBookHistogramEntry[] = [];

  for (const [orders, sizes] of [
    [currentOrderBook.buy, buySizes],
    [currentOrderBook.sell, sellSizes],
  ] as const) {
    for (const order of orders) {
      if (order.price < region.price[0] || order.price > region.price[1]) {
        continue;
      }

      const y = Math.floor((order.price - region.price[0]) / cellHeight);
      if (y < 0 || y >= resolution) continue;

      sizes[y] += order.size;
    }
  }

  for (let y = 0; y < resolution; y += 1) {
    histogram.push({ y, kind: "buy", size: buySizes[y] ?? 0 });
    histogram.push({ y, kind: "sell", size: sellSizes[y] ?? 0 });
  }

  return histogram;
};

export const getOrderBookHistogramSeries = (
  region: OrderBookHistogramRegion,
  side: OrderSide,
): OrderBookHistogramSeries => {
  const resolution = Math.max(0, Math.floor(region.resolution));
  const cellHeight = Math.max(region.price[1] - region.price[0], Number.EPSILON) / Math.max(resolution, 1);
  const sizes = new Array<number>(resolution).fill(0);

  for (const order of orderBook()[side]) {
    if (order.price < region.price[0] || order.price > region.price[1]) {
      continue;
    }

    const y = Math.floor((order.price - region.price[0]) / cellHeight);
    if (y < 0 || y >= resolution) continue;

    sizes[y] += order.size;
  }

  return { cellHeight, sizes };
};

const recordMarketState = (changes: OrderBookChange | OrderBookChange[]) => {
  const timestamp = Date.now();

  if (Array.isArray(changes) && changes.length === 0) {
    return;
  }

  appendOrderBookMapEntry(timestamp, changes);
};

export const priceHistoryCandle = (start: number, end: number, side: OrderSide): PriceCandle => {
  const history = priceHistory();
  const firstIndex = upperBoundPriceHistory(history, start);
  const endIndex = upperBoundPriceHistory(history, end);
  const openEntry = history[Math.max(0, firstIndex - 1)] ?? initialPriceHistory[0]!;
  const open = openEntry.spread[side];
  let close = open;
  let high = open;
  let low = open;

  for (let index = firstIndex; index < endIndex; index += 1) {
    const price = history[index]?.spread[side];
    if (price === undefined) continue;

    close = price;
    high = Math.max(high, price);
    low = Math.min(low, price);
  }

  return { time: start, open, high, low, close };
};

const upperBoundPriceHistory = (history: PriceHistoryEntry[], timestamp: number): number => {
  let low = 0;
  let high = history.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (history[mid]!.timestamp <= timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

// // for each order id, tradeHistory.filter(id).sum() == order.size
// const tradeHistory: TradeHistoryEntry[] = [];

let nextOrderId = 0;
const findOrderLocation = (id: number, side?: OrderSide): { side: OrderSide; index: number } | null => {
  const sides = side ? [side] : (["buy", "sell"] as const);

  for (const candidateSide of sides) {
    const index = orderBook()[candidateSide].findIndex((order) => order.id === id);
    if (index !== -1) {
      return { side: candidateSide, index };
    }
  }

  return null;
};

export const hasOrder = (id: number, side?: OrderSide): boolean => findOrderLocation(id, side) !== null;

export const makeOrder = (side: OrderSide, order: Order): MakeOrderResult => {
  const id = nextOrderId++;
  const orderWithId = { ...order, id };
  const result = takeOrder(side, order.size, order.price);
  const restingSize = order.size - result.fulfilled;

  if (restingSize === 0) {
    return { id, fulfilled: result.fulfilled, restingSize };
  }

  orderWithId.size = restingSize;

  recordMarketState({ kind: "add", side, order: orderWithId });

  return { id, fulfilled: result.fulfilled, restingSize };
};

export const takeOrder = (side: OrderSide, size: number, price?: number): { id: number; fulfilled: number } => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const bookSide = oppositeSide(side);
  const orders = orderBook()[bookSide];
  let orderIndex = orders.length - 1;
  const changes: OrderBookChange[] = [];

  while (fulfilled < size) {
    const order = orders[orderIndex];
    if (!order) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (fulfilled + order.size > size) {
      const remainingSize = size - fulfilled;
      const nextSize = order.size - remainingSize;
      fulfilled += remainingSize;
      changes.push({
        kind: "partial-fill",
        side: bookSide,
        order: { ...order, size: nextSize },
      });
      recordMarketState(changes);

      return { id, fulfilled };
    }

    fulfilled += order.size;
    changes.push({ kind: "remove", side: bookSide, order: cloneOrder(order) });
    orderIndex -= 1;
  }

  recordMarketState(changes);
  return { id, fulfilled };
};

export const cancelOrder = (id: number, side?: OrderSide): RegisteredOrder | null => {
  const location = findOrderLocation(id, side);

  if (!location) return null;

  const order = orderBook()[location.side][location.index];

  if (!order) return null;

  recordMarketState({ kind: "remove", side: location.side, order: cloneOrder(order) });
  return order;
};

export { marketPriceSpread, midPrice, orderBook };
