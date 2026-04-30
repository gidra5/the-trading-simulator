export type Order = {
  price: number;
  size: number;
};

export type RegisteredOrder = Order & { id: number };

export type MakeOrderResult = {
  id: number;
  fulfilled: number;
  restingSize: number;
};

export type OrderSide = "buy" | "sell";

export const compareOrders = (candidate: RegisteredOrder, side: OrderSide, target: RegisteredOrder): number => {
  if (candidate.price !== target.price) {
    if (side === "sell") return target.price - candidate.price;
    return candidate.price - target.price;
  }

  return candidate.id - target.id;
};

export const cloneOrder = (order: RegisteredOrder): RegisteredOrder => ({ ...order });

export const oppositeSide = (side: OrderSide): OrderSide => (side === "buy" ? "sell" : "buy");
