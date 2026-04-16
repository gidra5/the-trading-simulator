type Order = {
  price: number;
  size: number;
};
type RegisteredOrder = Order & { id: number };
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
  open: number;
  high: number;
  low: number;
  close: number;
};
export type OrderSide = "buy" | "sell";

const orderBook: {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
} = {
  buy: [{ id: -1, price: 0.99, size: 1e2 }],
  sell: [{ id: -2, price: 1.01, size: 1e2 }],
};

const priceHistory: PriceHistoryEntry[] = [
  {
    timestamp: Date.now(),
    spread: {
      buy: 1.01,
      sell: 0.99,
    },
  },
];

const recordPriceHistory = () => {
  priceHistory.push({
    timestamp: Date.now(),
    spread: marketPriceSpread(),
  });
};

const candleHistoryEntries = (
  start: number,
  end: number,
): PriceHistoryEntry[] => {
  const open = (() => {
    for (let i = priceHistory.length - 1; i >= 0; i -= 1) {
      const entry = priceHistory[i];
      if (entry.timestamp <= start) {
        return entry;
      }
    }

    return priceHistory[0];
  })();
  const entries = priceHistory.filter(
    (entry) => entry.timestamp > start && entry.timestamp <= end,
  );
  return [open, ...entries];
};

export const priceHistoryCandle = (
  start: number,
  end: number,
  side: OrderSide,
): PriceCandle => {
  const entries = candleHistoryEntries(start, end);
  const open = entries[0].spread[side];
  const close = entries[entries.length - 1].spread[side];
  const prices = entries.map((entry) => entry.spread[side]);
  const high = prices.reduce((current, price) => Math.max(current, price));
  const low = prices.reduce((current, price) => Math.min(current, price));

  return { open, high, low, close };
};

// // for each order id, tradeHistory.filter(id).sum() == order.size
// const tradeHistory: TradeHistoryEntry[] = [];

let nextOrderId = 0;
export const makeOrder = (side: OrderSide, order: Order): number => {
  const id = nextOrderId++;
  const orderWithId = { ...order, id };
  const result = takeOrder(side, order.size, order.price);
  if (result.fulfilled === order.size) {
    return id;
  }

  orderWithId.size = order.size - result.fulfilled;

  orderBook[side].push(orderWithId);
  orderBook[side].sort((a, b) =>
    side === "sell" ? b.price - a.price : a.price - b.price,
  );

  recordPriceHistory();

  return id;
};

export const takeOrder = (
  side: OrderSide,
  size: number,
  price?: number,
): { id: number; fulfilled: number } => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const orders = orderBook[oppositeSide(side)];

  while (fulfilled < size) {
    const order = orders.pop();
    if (!order) {
      if (fulfilled > 0) recordPriceHistory();
      return { id, fulfilled };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      orders.push(order);
      if (fulfilled > 0) recordPriceHistory();
      return { id, fulfilled };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      orders.push(order);
      if (fulfilled > 0) recordPriceHistory();
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
      recordPriceHistory();

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

  recordPriceHistory();
  return { id, fulfilled };
};

export const marketPriceSpread = (): PriceSpread => {
  const lastSpread = priceHistory[priceHistory.length - 1]?.spread;

  return {
    buy:
      orderBook.sell[orderBook.sell.length - 1]?.price ?? lastSpread.buy ?? 0,
    sell:
      orderBook.buy[orderBook.buy.length - 1]?.price ?? lastSpread.sell ?? 0,
  };
};

export const oppositeSide = (side: OrderSide): OrderSide =>
  side === "buy" ? "sell" : "buy";
