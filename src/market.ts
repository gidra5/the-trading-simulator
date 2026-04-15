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
type OrderSide = "buy" | "sell";

const orderBook: {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
} = {
  buy: [{ id: -1, price: 0.99, size: 1e2 }],
  sell: [{ id: -2, price: 1.01, size: 1e2 }],
};

// for each order id, tradeHistory.filter(id).sum() == order.size
const tradeHistory: TradeHistoryEntry[] = [];

let nextOrderId = 0;
export const makeOrder = (side: OrderSide, order: Order) => {
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

  return id;
};

export const takeOrder = (side: OrderSide, size: number, price?: number) => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const orders = orderBook[oppositeSide(side)];

  while (fulfilled < size) {
    const order = orders.pop();
    if (!order) return { id, fulfilled };

    if (side === "buy" && order.price > price!) {
      orders.push(order);
      return { id, fulfilled };
    }
    if (side === "sell" && order.price < price!) {
      orders.push(order);
      return { id, fulfilled };
    }

    if (fulfilled + order.size > size) {
      const remainingSize = size - fulfilled;
      fulfilled += remainingSize;
      tradeHistory.push({
        buyOrderId: side === "buy" ? id : order.id,
        sellOrderId: side === "sell" ? id : order.id,
        price: order.price,
        size: remainingSize,
      });
      orders.push({
        id: order.id,
        price: order.price,
        size: order.size - remainingSize,
      });

      return { id, fulfilled };
    }

    fulfilled += order.size;
    tradeHistory.push({
      buyOrderId: side === "buy" ? id : order.id,
      sellOrderId: side === "sell" ? id : order.id,
      price: order.price,
      size: order.size,
    });
  }

  return { id, fulfilled };
};

export const marketPrice = (side: OrderSide) => {
  const orders = orderBook[oppositeSide(side)];

  if (orders.length === 0) return 0;
  return orders[orders.length - 1].price;
};

export const oppositeSide = (side: OrderSide): OrderSide =>
  side === "buy" ? "sell" : "buy";
