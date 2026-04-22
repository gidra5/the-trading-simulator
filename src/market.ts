import { createSignal } from "solid-js";

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
type OrderBookMapEntry = {
  orderBook: OrderBook;
  timestamp: number;
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

type OrderBook = {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
};

const [orderBook, setOrderBook] = createSignal<OrderBook>({
  buy: [{ id: -1, price: 0.99, size: 1e2 }],
  sell: [{ id: -2, price: 1.01, size: 1e2 }],
});

const setOrderBookSide = (side: OrderSide, orders: RegisteredOrder[]): void => {
  setOrderBook((currentOrderBook) => ({ ...currentOrderBook, [side]: orders }));
};

const cloneOrderBook = (): OrderBook => {
  const currentOrderBook = orderBook();

  return {
    buy: currentOrderBook.buy.map((order) => ({ ...order })),
    sell: currentOrderBook.sell.map((order) => ({ ...order })),
  };
};

const initialTimestamp = Date.now();

const orderBookMap: OrderBookMapEntry[] = [
  {
    timestamp: initialTimestamp,
    orderBook: cloneOrderBook(),
  },
];

export const getOrderBookRegion = (region: OrderBookHeatmapRegion): OrderBookHeatmapEntry[] => {
  const cellSize: [time: number, price: number] = [
    Math.max(region.timestamp[1] - region.timestamp[0], 1) / region.resolution[0],
    Math.max(region.price[1] - region.price[0], Number.EPSILON) / region.resolution[1],
  ];
  const heatmapKey = (time: number, price: number) => JSON.stringify([time, price]);
  const heatmap: Map<string, OrderBookHeatmapEntry> = new Map();

  for (const snapshot of orderBookMap) {
    if (snapshot.timestamp < region.timestamp[0] || snapshot.timestamp > region.timestamp[1]) {
      continue;
    }

    const x = Math.floor((snapshot.timestamp - region.timestamp[0]) / cellSize[0]);

    const orders = [...snapshot.orderBook.buy, ...snapshot.orderBook.sell];
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

const recordMarketState = () => {
  const timestamp = Date.now();

  priceHistory.push({
    timestamp,
    spread: marketPriceSpread(),
  });
  orderBookMap.push({
    timestamp,
    orderBook: cloneOrderBook(),
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

  // setOrderBook((orderBook) => {

  // orderBook[side].push(orderWithId);
  // orderBook[side].sort((a, b) =>
  //   side === "sell" ? b.price - a.price : a.price - b.price,
  // );
  //   return { ...orderBook };
  // })

  const nextOrders = [...orderBook()[side], orderWithId].sort((a, b) =>
    side === "sell" ? b.price - a.price : a.price - b.price,
  );
  setOrderBookSide(side, nextOrders);

  recordMarketState();

  return { id, fulfilled: result.fulfilled, restingSize };
};

export const takeOrder = (side: OrderSide, size: number, price?: number): { id: number; fulfilled: number } => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const bookSide = oppositeSide(side);
  const orders = [...orderBook()[bookSide]];

  const commitOrderBook = () => {
    setOrderBookSide(bookSide, orders);
  };

  while (fulfilled < size) {
    const order = orders.pop();
    if (!order) {
      if (fulfilled > 0) {
        commitOrderBook();
        recordMarketState();
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      orders.push(order);
      if (fulfilled > 0) {
        commitOrderBook();
        recordMarketState();
      }
      return { id, fulfilled };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      orders.push(order);
      if (fulfilled > 0) {
        commitOrderBook();
        recordMarketState();
      }
      return { id, fulfilled };
    }

    if (fulfilled + order.size > size) {
      const remainingSize = size - fulfilled;
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
        size: order.size - remainingSize,
      });
      commitOrderBook();
      recordMarketState();

      return { id, fulfilled };
    }

    fulfilled += order.size;
    // tradeHistory.push({
    //   buyOrderId: side === "buy" ? id : order.id,
    //   sellOrderId: side === "sell" ? id : order.id,
    //   price: order.price,
    //   size: order.size,
    // });
  }

  commitOrderBook();
  recordMarketState();
  return { id, fulfilled };
};

export const cancelOrder = (id: number, side?: OrderSide): RegisteredOrder | null => {
  const location = findOrderLocation(id, side);

  if (!location) return null;

  const nextOrders = [...orderBook()[location.side]];
  const [order] = nextOrders.splice(location.index, 1);

  if (!order) return null;

  setOrderBookSide(location.side, nextOrders);

  recordMarketState();
  return order;
};

export const marketPriceSpread = (): PriceSpread => {
  const currentOrderBook = orderBook();
  const lastSpread = priceHistory[priceHistory.length - 1]?.spread;

  return {
    buy: currentOrderBook.sell[currentOrderBook.sell.length - 1]?.price ?? lastSpread.buy ?? 0,
    sell: currentOrderBook.buy[currentOrderBook.buy.length - 1]?.price ?? lastSpread.sell ?? 0,
  };
};

export const oppositeSide = (side: OrderSide): OrderSide => (side === "buy" ? "sell" : "buy");
