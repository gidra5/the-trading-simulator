import { createEffect, untrack, type Accessor } from "solid-js";
import type { OrderBookChange, OrderBookHistoryEntry } from "./orderBook";

export type Order = {
  price: number;
  size: number;
};

export type RestingOrder = Order & { id: number };

export type MakeOrderResult = {
  fulfilled: number;
  cost: number;
  order: RestingOrder;
};

// todo: replace explicit tag with a size sign - negative means sell, positive is buy
export type OrderSide = "buy" | "sell";
type OrderUpdateCallback = (change: OrderBookChange) => void;
type OrderUpdateSource = Accessor<OrderBookHistoryEntry>;

export const compareOrders = (candidate: RestingOrder, side: OrderSide, target: RestingOrder): number => {
  if (candidate.price !== target.price) {
    if (side === "sell") return target.price - candidate.price;
    return candidate.price - target.price;
  }

  return candidate.id - target.id;
};

export const cloneOrder = (order: RestingOrder): RestingOrder => ({ ...order });

export const oppositeSide = (side: OrderSide): OrderSide => (side === "buy" ? "sell" : "buy");

export const createOrderSubscriptionState = (latestOrderBookChange: OrderUpdateSource) => {
  const orderSubscriptions = new Map<number, Set<OrderUpdateCallback>>();

  createEffect(() => {
    const latest = latestOrderBookChange();

    untrack(() => {
      for (const change of latest.changes) {
        const subscribers = orderSubscriptions.get(change.order.id);
        if (!subscribers) continue;

        for (const subscriber of subscribers) {
          subscriber(change);
        }
      }
    });
  });

  const subscribeToOrder = (id: number, cb: OrderUpdateCallback) => {
    if (!orderSubscriptions.has(id)) {
      orderSubscriptions.set(id, new Set());
    }
    const subscribers = orderSubscriptions.get(id)!;
    const callback = (change: OrderBookChange) => {
      cb(change);
      if (change.kind === "remove") subscribers.delete(callback);
      if (subscribers.size === 0) orderSubscriptions.delete(id);
    };
    subscribers.add(callback);

    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) orderSubscriptions.delete(id);
    };
  };

  return { subscribeToOrder };
};
