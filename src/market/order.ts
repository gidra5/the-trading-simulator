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

export type OrderSide = "buy" | "sell";
type OrderUpdateCallback = (change: OrderBookChange) => void;
type OrderUpdateSource = Accessor<OrderBookHistoryEntry>;
type OrderSubscriber = {
  callback: OrderUpdateCallback;
  revision: number;
};

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
  const orderSubscriptions = new Map<number, Set<OrderSubscriber>>();

  createEffect(() => {
    const latest = latestOrderBookChange();

    untrack(() => {
      const notifiedSubscribers = new Set<OrderSubscriber>();

      for (const change of latest.changes) {
        const subscribers = orderSubscriptions.get(change.order.id);
        if (!subscribers) continue;

        for (const subscriber of subscribers) {
          if (latest.revision <= subscriber.revision) continue;
          subscriber.callback(change);
          notifiedSubscribers.add(subscriber);
        }
      }

      for (const subscriber of notifiedSubscribers) subscriber.revision = latest.revision;
    });
  });

  const subscribeToOrder = (id: number, cb: OrderUpdateCallback) => {
    if (!orderSubscriptions.has(id)) {
      orderSubscriptions.set(id, new Set());
    }
    const subscribers = orderSubscriptions.get(id)!;
    const subscriber: OrderSubscriber = {
      revision: latestOrderBookChange().revision,
      callback: (change: OrderBookChange) => {
        cb(change);
        if (change.kind === "remove") subscribers.delete(subscriber);
        if (subscribers.size === 0) orderSubscriptions.delete(id);
      },
    };
    subscribers.add(subscriber);

    return () => {
      subscribers.delete(subscriber);
      if (subscribers.size === 0) orderSubscriptions.delete(id);
    };
  };

  const clearOrderSubscriptions = (): void => {
    orderSubscriptions.clear();
  };

  return { clearOrderSubscriptions, subscribeToOrder };
};
