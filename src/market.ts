import { createMemo, createSignal } from "solid-js";

type Order = {
  price: number;
  size: number;
};
type RegisteredOrder = Order & { id: number };
export type MakeOrderResult = {
  id: number;
  fulfilled: number;
  restingSize: number;
};
type TradeHistoryEntry = {
  buyOrderId: number;
  sellOrderId: number;
  price: number;
  size: number;
};
type PriceSpread = {
  buy: number;
  sell: number;
};
type PriceHistoryEntry = {
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
export type OrderSide = "buy" | "sell";
type OrderBookSnapshotEntry = {
  kind: "snapshot";
  revision: number;
  orderBook: OrderBook;
  timestamp: number;
};
type OrderBookAddChange = {
  kind: "add";
  side: OrderSide;
  order: RegisteredOrder;
};
type OrderBookRemoveChange = {
  kind: "remove";
  side: OrderSide;
  order: RegisteredOrder;
};
type OrderBookPartialFillChange = {
  kind: "partial-fill";
  side: OrderSide;
  id: number;
  previousSize: number;
  nextSize: number;
  filledSize: number;
};
type OrderBookChange =
  | OrderBookAddChange
  | OrderBookRemoveChange
  | OrderBookPartialFillChange;
type OrderBookDeltaEntry = {
  kind: "delta";
  revision: number;
  timestamp: number;
  changes: OrderBookChange[];
};
type OrderBookMapEntry = OrderBookSnapshotEntry | OrderBookDeltaEntry;
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

type OrderBook = {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
};

const initialOrderBook: OrderBook = {
  buy: [{ id: -1, price: 0.99, size: 1e2 }],
  sell: [{ id: -2, price: 1.01, size: 1e2 }],
};

const cloneOrder = (order: RegisteredOrder): RegisteredOrder => ({ ...order });

const cloneOrderBookFrom = (source: OrderBook): OrderBook => {
  return {
    buy: source.buy.map(cloneOrder),
    sell: source.sell.map(cloneOrder),
  };
};

const applyOrderBookChange = (target: OrderBook, change: OrderBookChange): void => {
  const orders = target[change.side];

  switch (change.kind) {
    case "add":
      orders.push(cloneOrder(change.order));
      orders.sort((a, b) => (change.side === "sell" ? b.price - a.price : a.price - b.price));
      break;
    case "remove": {
      const index = orders.findIndex((order) => order.id === change.order.id);

      if (index !== -1) {
        orders.splice(index, 1);
      }
      break;
    }
    case "partial-fill": {
      const order = orders.find((candidate) => candidate.id === change.id);

      if (order) {
        order.size = change.nextSize;
      }
      break;
    }
  }
};

const applyOrderBookChanges = (target: OrderBook, changes: OrderBookChange[]): void => {
  for (const change of changes) {
    applyOrderBookChange(target, change);
  }
};

const initialTimestamp = Date.now();
const [orderBookSnapshotInterval, setOrderBookSnapshotIntervalValue] = createSignal(100);
let orderBookRevision = 0;

const initialOrderBookMapEntry: OrderBookMapEntry = {
  kind: "snapshot",
  revision: orderBookRevision,
  timestamp: initialTimestamp,
  orderBook: initialOrderBook,
};
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
    applyOrderBookChanges(nextOrderBook, latest.changes);
    return nextOrderBook;
  },
  cloneOrderBookFrom(initialOrderBook),
  { equals: false },
);

const appendOrderBookMapEntry = (timestamp: number, changes: OrderBookChange[]): void => {
  if (changes.length === 0) return;

  orderBookRevision += 1;

  if (orderBookRevision % orderBookSnapshotInterval() !== 0) {
    setOrderBookMap((entries) => {
      entries.push({
        kind: "delta",
        revision: orderBookRevision,
        timestamp,
        changes,
      });
      return entries;
    });
    return;
  }

  const nextOrderBook = cloneOrderBookFrom(orderBook());
  applyOrderBookChanges(nextOrderBook, changes);

  setOrderBookMap((entries) => {
    entries.push({
      kind: "snapshot",
      revision: orderBookRevision,
      timestamp,
      orderBook: nextOrderBook,
    });
    return entries;
  });
};

export const setOrderBookSnapshotInterval = (interval: number): void => {
  if (!Number.isFinite(interval) || interval <= 0) return;

  setOrderBookSnapshotIntervalValue(Math.floor(interval));
};

export const getOrderBookHistoryStats = (): {
  entries: number;
  snapshots: number;
  deltas: number;
  changes: number;
  revision: number;
  snapshotInterval: number;
} => {
  let snapshots = 0;
  let deltas = 0;
  let changes = 0;

  const entries = orderBookMap();

  for (const entry of entries) {
    if (entry.kind === "snapshot") {
      snapshots += 1;
    } else {
      deltas += 1;
      changes += entry.changes.length;
    }
  }

  return {
    entries: entries.length,
    snapshots,
    deltas,
    changes,
    revision: orderBookRevision,
    snapshotInterval: orderBookSnapshotInterval(),
  };
};

export const getOrderBookRegion = (region: OrderBookHeatmapRegion): OrderBookHeatmapEntry[] => {
  const cellSize: [time: number, price: number] = [
    Math.max(region.timestamp[1] - region.timestamp[0], 1) / region.resolution[0],
    Math.max(region.price[1] - region.price[0], Number.EPSILON) / region.resolution[1],
  ];
  const heatmapKey = (time: number, price: number) => JSON.stringify([time, price]);
  const heatmap: Map<string, OrderBookHeatmapEntry> = new Map();
  let reconstructedOrderBook: OrderBook | null = null;

  for (const entry of orderBookMap()) {
    if (entry.kind === "snapshot") {
      reconstructedOrderBook = cloneOrderBookFrom(entry.orderBook);
    } else if (reconstructedOrderBook) {
      applyOrderBookChanges(reconstructedOrderBook, entry.changes);
    }

    if (!reconstructedOrderBook || entry.timestamp < region.timestamp[0] || entry.timestamp > region.timestamp[1]) {
      continue;
    }

    const x = Math.floor((entry.timestamp - region.timestamp[0]) / cellSize[0]);

    const orders = [...reconstructedOrderBook.buy, ...reconstructedOrderBook.sell];
    for (const order of orders) {
      if (order.price < region.price[0] || order.price > region.price[1]) {
        continue;
      }

      const y = Math.floor((order.price - region.price[0]) / cellSize[1]);
      const key = heatmapKey(x, y);
      const cell = heatmap.get(key);
      if (cell) {
        cell.size += order.size;
      } else {
        heatmap.set(key, { x, y, size: order.size });
      }
    }
  }

  return new Array(region.resolution[0]).fill(0).flatMap((_, timeIndex) =>
    new Array(region.resolution[1]).fill(0).map((_, priceIndex) => {
      const key = heatmapKey(timeIndex, priceIndex);
      return heatmap.get(key) ?? { x: timeIndex, y: priceIndex, size: 0 };
    }),
  );
};

export const getOrderBookHistogram = (region: OrderBookHistogramRegion): OrderBookHistogramEntry[] => {
  const currentOrderBook = orderBook();
  const cellHeight = Math.max(region.price[1] - region.price[0], Number.EPSILON) / region.resolution;
  const histogram = new Map<string, OrderBookHistogramEntry>();
  const histogramKey = (y: number, kind: OrderSide): string => JSON.stringify([y, kind]);

  for (let y = 0; y < region.resolution; y += 1) {
    histogram.set(histogramKey(y, "buy"), { y, kind: "buy", size: 0 });
    histogram.set(histogramKey(y, "sell"), { y, kind: "sell", size: 0 });
  }

  for (const [kind, orders] of [
    ["buy", currentOrderBook.buy],
    ["sell", currentOrderBook.sell],
  ] as const) {
    for (const order of orders) {
      if (order.price < region.price[0] || order.price > region.price[1]) {
        continue;
      }

      const y = Math.floor((order.price - region.price[0]) / cellHeight);
      const entry = histogram.get(histogramKey(y, kind));
      if (!entry) continue;

      entry.size += order.size;
    }
  }

  return Array.from(histogram.values()).sort((left, right) => left.y - right.y);
};

const priceHistory: PriceHistoryEntry[] = [
  {
    timestamp: initialTimestamp,
    spread: {
      buy: 1.01,
      sell: 0.99,
    },
  },
];

const recordMarketState = (changes: OrderBookChange[]) => {
  const timestamp = Date.now();

  if (changes.length === 0) {
    return;
  }

  appendOrderBookMapEntry(timestamp, changes);

  priceHistory.push({
    timestamp,
    spread: marketPriceSpread(),
  });
};

const candleHistoryEntries = (start: number, end: number): PriceHistoryEntry[] => {
  const open = (() => {
    // TODO: binary search or add some kind of index
    for (let i = priceHistory.length - 1; i >= 0; i -= 1) {
      const entry = priceHistory[i];
      if (entry.timestamp <= start) {
        return entry;
      }
    }

    return priceHistory[0];
  })();
  const entries = priceHistory.filter((entry) => entry.timestamp > start && entry.timestamp <= end);
  return [open, ...entries];
};

export const priceHistoryCandle = (start: number, end: number, side: OrderSide): PriceCandle => {
  const entries = candleHistoryEntries(start, end);
  const open = entries[0].spread[side];
  const close = entries[entries.length - 1].spread[side];
  const prices = entries.map((entry) => entry.spread[side]);
  const high = prices.reduce((current, price) => Math.max(current, price));
  const low = prices.reduce((current, price) => Math.min(current, price));

  return { time: start, open, high, low, close };
};

// // for each order id, tradeHistory.filter(id).sum() == order.size
// const tradeHistory: TradeHistoryEntry[] = [];

let nextOrderId = 0;
const findOrderLocation = (
  id: number,
  side?: OrderSide,
): { side: OrderSide; index: number } | null => {
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

  recordMarketState([{ kind: "add", side, order: cloneOrder(orderWithId) }]);

  return { id, fulfilled: result.fulfilled, restingSize };
};

export const takeOrder = (side: OrderSide, size: number, price?: number): { id: number; fulfilled: number } => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const bookSide = oppositeSide(side);
  const orders = [...orderBook()[bookSide]];
  const changes: OrderBookChange[] = [];

  while (fulfilled < size) {
    const order = orders.pop();
    if (!order) {
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      orders.push(order);
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      orders.push(order);
      if (fulfilled > 0) {
        recordMarketState(changes);
      }
      return { id, fulfilled };
    }

    if (fulfilled + order.size > size) {
      const remainingSize = size - fulfilled;
      const nextSize = order.size - remainingSize;
      fulfilled += remainingSize;
      // tradeHistory.push({
      //   buyOrderId: side === "buy" ? id : order.id,
      //   sellOrderId: side === "sell" ? id : order.id,
      //   price: order.price,
      //   size: remainingSize,
      // });
      orders.push({
        id: order.id,
        price: order.price,
        size: nextSize,
      });
      changes.push({
        kind: "partial-fill",
        side: bookSide,
        id: order.id,
        previousSize: order.size,
        nextSize,
        filledSize: remainingSize,
      });
      recordMarketState(changes);

      return { id, fulfilled };
    }

    fulfilled += order.size;
    changes.push({ kind: "remove", side: bookSide, order: cloneOrder(order) });
    // tradeHistory.push({
    //   buyOrderId: side === "buy" ? id : order.id,
    //   sellOrderId: side === "sell" ? id : order.id,
    //   price: order.price,
    //   size: order.size,
    // });
  }

  recordMarketState(changes);
  return { id, fulfilled };
};

export const cancelOrder = (id: number, side?: OrderSide): RegisteredOrder | null => {
  const location = findOrderLocation(id, side);

  if (!location) return null;

  const order = orderBook()[location.side][location.index];

  if (!order) return null;

  recordMarketState([{ kind: "remove", side: location.side, order: cloneOrder(order) }]);
  return order;
};

export const marketPriceSpread = createMemo((): PriceSpread => {
  const currentOrderBook = orderBook();
  const lastSpread = priceHistory[priceHistory.length - 1]?.spread;

  return {
    buy: currentOrderBook.sell[currentOrderBook.sell.length - 1]?.price ?? lastSpread.buy ?? 0,
    sell: currentOrderBook.buy[currentOrderBook.buy.length - 1]?.price ?? lastSpread.sell ?? 0,
  };
});

export const oppositeSide = (side: OrderSide): OrderSide =>
  side === "buy" ? "sell" : "buy";

export const midPrice = createMemo((): number => {
  const spread = marketPriceSpread();
  return (spread.buy + spread.sell) / 2;
});
