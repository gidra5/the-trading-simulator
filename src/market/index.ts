import { createRoot, createSignal } from "solid-js";
import {
  cloneOrder,
  oppositeSide,
  type MakeOrderResult,
  type Order,
  type OrderSide,
  type RegisteredOrder,
} from "./order";
import {
  applyChangeset,
  cloneOrderBookFrom,
  createOrderBook,
  type OrderBookChange,
  type OrderBookHeatmapEntry,
  type OrderBookHeatmapRegion,
  type OrderBookHistogramEntry,
  type OrderBookHistogramRegion,
  type OrderBookHistogramSeries,
  type OrderBookMapEntry,
  type PriceHistoryEntry,
} from "./orderBook";

export type { MakeOrderResult, OrderSide } from "./order";
export type {
  OrderBookHeatmapEntry,
  OrderBookHeatmapRegion,
  OrderBookHistogramEntry,
  OrderBookHistogramRegion,
  OrderBookHistogramSeries,
} from "./orderBook";

export type PriceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

const {
  snapshotInterval,
  deltaSnapshotInterval,
  setDeltaSnapshotInterval,
  fanout,
  setFanout,
  levels,
  setLevels,
  orderBookMap,
  orderBookHistory,
  revision,
  orderBook,
  appendChange,
  reconstructRegionStream,
  reconstruct,

  priceHistory,
  marketPriceSpread,
  midPrice,
} = createRoot(() => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [fanout, setFanout] = createSignal(5);
  const [levels, setLevels] = createSignal(5);

  const orderBook = createOrderBook({ deltaSnapshotInterval, fanout, levels });

  orderBook.appendChange(Date.now(), [
    { kind: "add", side: "buy", order: { id: -2, price: 0.999, size: 1e4 } },
    { kind: "add", side: "sell", order: { id: -3, price: 1.001, size: 1e4 } },
  ]);

  return { ...orderBook, deltaSnapshotInterval, setDeltaSnapshotInterval, fanout, setFanout, levels, setLevels };
});

export {
  orderBookHistory,
  reconstruct,
  deltaSnapshotInterval,
  setDeltaSnapshotInterval,
  fanout,
  setFanout,
  levels,
  setLevels,
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

      if (entry.level === 0) {
        deltas += 1;
        changes += Array.isArray(entry.changes) ? entry.changes.length : 1;
      }
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
    revision: revision(),
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

  reconstructRegionStream(region.timestamp, (orderBook, timestamp) => {
    const x = Math.floor((timestamp - region.timestamp[0]) / cellSize[0]);

    const h = (order: RegisteredOrder) => {
      if (order.price < region.price[0] || order.price > region.price[1]) return;

      const y = Math.floor((order.price - region.price[0]) / cellSize[1]);
      if (y < 0 || y >= resolution[1]) return;

      const key = y * resolution[0] + x;
      const cell = heatmap.get(key);
      if (cell) cell.size += order.size;
      else heatmap.set(key, { x, y, size: order.size });
    };

    for (const order of orderBook.buy) h(order);
    for (const order of orderBook.sell) h(order);
  });

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

const recordMarketState = (changes: OrderBookChange[]) => {
  const timestamp = Date.now();

  if (Array.isArray(changes) && changes.length === 0) {
    return;
  }

  appendChange(timestamp, changes);
};

export const priceHistoryCandle = (start: number, end: number, side: OrderSide): PriceCandle => {
  const history = priceHistory();
  const firstIndex = upperBoundPriceHistory(history, start);
  const endIndex = upperBoundPriceHistory(history, end);
  const openEntry = history[Math.max(0, firstIndex - 1)];
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
    return { id, fulfilled: result.fulfilled, cost: result.cost, restingSize };
  }

  orderWithId.size = restingSize;

  recordMarketState([{ kind: "add", side, order: orderWithId }]);

  return { id, fulfilled: result.fulfilled, cost: result.cost, restingSize };
};

export const takeOrder = (
  side: OrderSide,
  size: number,
  price?: number,
): { id: number; fulfilled: number; cost: number } => {
  let fulfilled = 0;
  let cost = 0;
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
      return { id, fulfilled, cost };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled, cost };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled, cost };
    }

    if (fulfilled + order.size > size) {
      const sizeToFulfill = size - fulfilled;
      const nextSize = order.size - sizeToFulfill;
      fulfilled += sizeToFulfill;
      cost += order.price * sizeToFulfill;
      changes.push({
        kind: "partial-fill",
        side: bookSide,
        order: { ...order, size: nextSize },
      });
      recordMarketState(changes);

      return { id, fulfilled, cost };
    }

    fulfilled += order.size;
    cost += order.price * order.size;
    changes.push({ kind: "remove", side: bookSide, order: cloneOrder(order) });
    orderIndex -= 1;
  }

  recordMarketState(changes);
  return { id, fulfilled, cost };
};

export const cancelOrder = (id: number, side?: OrderSide): RegisteredOrder | null => {
  const location = findOrderLocation(id, side);

  if (!location) return null;

  const order = orderBook()[location.side][location.index];

  if (!order) return null;

  recordMarketState([{ kind: "remove", side: location.side, order: cloneOrder(order) }]);
  return order;
};
// todo: move histogram, price history, stats, heatmap related variables and functions to separate files.
export { marketPriceSpread, midPrice, orderBook };
