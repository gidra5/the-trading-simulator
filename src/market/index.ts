import { createSignal, type Accessor } from "solid-js";
import { createHistogramState } from "./histogram";
import {
  cloneOrder,
  createOrderSubscriptionState,
  oppositeSide,
  type MakeOrderResult,
  type Order,
  type OrderSide,
  type RestingOrder,
} from "./order";
import {
  createOrderBook,
  type OrderBookChange,
  type OrderBookHeatmapEntry,
  type OrderBookHeatmapRegion,
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

type MarketStateOptions = {
  time: Accessor<number>;
};

export const createMarketState = (options: MarketStateOptions) => {
  const time = options.time;
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [fanout, setFanout] = createSignal(5);
  const [levels, setLevels] = createSignal(5);
  let nextOrderId = 0;

  const orderBookState = createOrderBook({ deltaSnapshotInterval, fanout, levels, time });

  orderBookState.appendChange([
    { kind: "add", side: "buy", order: { id: -2, price: 0.999, size: 1e4 } },
    { kind: "add", side: "sell", order: { id: -3, price: 1.001, size: 1e4 } },
  ]);

  const { subscribeToOrder } = createOrderSubscriptionState(orderBookState.latestOrderBookChange);
  const { getOrderBookHistogram, getOrderBookHistogramSeries, querySideVolumeInPriceRange } = createHistogramState({
    orderBookChangeset: () => orderBookState.latestOrderBookChange().changes,
    priceReference: () => 1,
    fanout: () => 2,
  });

  const getOrderBookHistoryStats = (): {
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

    const entries = orderBookState.orderBookMap();

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
      revision: orderBookState.revision(),
      snapshotInterval: orderBookState.snapshotInterval(),
      deltaSnapshotInterval: deltaSnapshotInterval(),
      deltaSnapshotFanout: fanout(),
      deltaSnapshotLevelCount: levels(),
    };
  };

  const getOrderBookRegion = (region: OrderBookHeatmapRegion): OrderBookHeatmapEntry[] => {
    const resolution = region.resolution;

    const cellSize: [time: number, price: number] = [
      Math.max(region.timestamp[1] - region.timestamp[0], 1) / resolution[0],
      Math.max(region.price[1] - region.price[0], Number.EPSILON) / resolution[1],
    ];
    const heatmap: Map<number, OrderBookHeatmapEntry> = new Map();

    orderBookState.reconstructRegionStream(region.timestamp, (orderBook, timestamp) => {
      const x = Math.floor((timestamp - region.timestamp[0]) / cellSize[0]);

      const h = (order: RestingOrder) => {
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

  // todo: candle acceleration structure
  // create a hierarchy of candles in powers of two
  // each level is a list of candles
  // to compute a candle of arbitrary interval, look at the binary of the integer
  // and combine the candles at the corresponding levels
  const priceHistoryCandle = (start: number, end: number, side: OrderSide): PriceCandle => {
    const history = orderBookState.priceHistory();
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

  const findOrderLocation = (id: number, side?: OrderSide): { side: OrderSide; index: number } | null => {
    const sides = side ? [side] : (["buy", "sell"] as const);

    // todo: binary search, ids are sorted
    for (const candidateSide of sides) {
      const index = orderBookState.orderBook()[candidateSide].findIndex((order) => order.id === id);
      if (index !== -1) {
        return { side: candidateSide, index };
      }
    }

    return null;
  };

  const hasOrder = (id: number, side?: OrderSide): boolean => findOrderLocation(id, side) !== null;

  // todo: seeding rng
  // todo: economic simulation
  const makeOrder = (side: OrderSide, order: Order): MakeOrderResult => {
    const id = nextOrderId++;
    const result = takeOrder(side, order.size, order.price);
    const resting: RestingOrder = { ...order, id, size: order.size - result.fulfilled };

    if (resting.size === 0) {
      return { fulfilled: result.fulfilled, cost: result.cost, order: resting };
    }

    orderBookState.appendChange([{ kind: "add", side, order: resting }]);

    return { fulfilled: result.fulfilled, cost: result.cost, order: resting };
  };

  const takeOrder = (
    side: OrderSide,
    size: number,
    price?: number,
  ): { id: number; fulfilled: number; cost: number } => {
    let fulfilled = 0;
    let cost = 0;
    const id = nextOrderId++;
    const bookSide = oppositeSide(side);
    const orders = orderBookState.orderBook()[bookSide];
    let orderIndex = orders.length - 1;
    const changes: OrderBookChange[] = [];

    while (fulfilled < size) {
      const order = orders[orderIndex];
      if (!order) {
        if (fulfilled > 0) {
          orderBookState.appendChange(changes);
        }
        return { id, fulfilled, cost };
      }

      if (price !== undefined && side === "buy" && order.price > price) {
        if (fulfilled > 0) {
          orderBookState.appendChange(changes);
        }
        return { id, fulfilled, cost };
      }

      if (price !== undefined && side === "sell" && order.price < price) {
        if (fulfilled > 0) {
          orderBookState.appendChange(changes);
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
          prevSize: order.size,
          order: { ...order, size: nextSize },
        });
        orderBookState.appendChange(changes);

        return { id, fulfilled, cost };
      }

      fulfilled += order.size;
      cost += order.price * order.size;
      changes.push({ kind: "remove", side: bookSide, order: cloneOrder(order) });
      orderIndex -= 1;
    }

    orderBookState.appendChange(changes);
    return { id, fulfilled, cost };
  };

  const cancelOrder = (id: number, side?: OrderSide): RestingOrder | null => {
    const location = findOrderLocation(id, side);

    if (!location) return null;

    const order = orderBookState.orderBook()[location.side][location.index];

    if (!order) return null;

    orderBookState.appendChange([{ kind: "remove", side: location.side, order: cloneOrder(order) }]);
    return order;
  };

  return {
    ...orderBookState,
    cancelOrder,
    deltaSnapshotInterval,
    fanout,
    getOrderBookHistogram,
    getOrderBookHistogramSeries,
    getOrderBookHistoryStats,
    getOrderBookRegion,
    hasOrder,
    levels,
    makeOrder,
    priceHistoryCandle,
    querySideVolumeInPriceRange,
    setDeltaSnapshotInterval,
    setFanout,
    setLevels,
    subscribeToOrder,
    takeOrder,
  };
};

export type MarketState = ReturnType<typeof createMarketState>;

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
