import type { Accessor } from "solid-js";
import { type MarketState, type OrderSide } from "../market/index";
import { type OrderBookChange } from "../market/orderBook";
import { binarySearchIndex, clamp } from "../utils";
import type { RestingOrder } from "./types";

export type CancellationOptions = {
  market: MarketState;
  onCancel: (order: RestingOrder) => boolean;

  candidatesCount: Accessor<number>;
  sampleOrderIndex: (orderCount: number) => number;
};

type RestingOrders = { buy: RestingOrder[]; sell: RestingOrder[] };

export const createCancellationState = (options: CancellationOptions) => {
  const restingOrders: RestingOrders = { buy: [], sell: [] };

  const randomRestingOrder = (side: OrderSide): RestingOrder | null => {
    const orders = restingOrders[side];
    if (orders.length === 0) return null;

    const index = Math.floor(clamp(options.sampleOrderIndex(orders.length), 0, orders.length - 1));
    return orders[index] ?? null;
  };

  const removeRestingOrder = (side: OrderSide, order: { id: number; price: number }): boolean => {
    const orders = restingOrders[side];
    let idx = binarySearchIndex(orders, (candidate) => candidate.price - order.price);
    if (idx >= orders.length) return false;

    while (idx < orders.length && orders[idx]!.price === order.price && orders[idx]!.id !== order.id) idx += 1;
    if (idx >= orders.length || orders[idx]!.price !== order.price) return false;

    restingOrders[side].splice(idx, 1);
    return true;
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(side);
    if (!order) return false;

    removeRestingOrder(order.side, order);
    return options.onCancel(order);
  };

  const addOrder = (order: RestingOrder): void => {
    const _orders = restingOrders[order.side];
    const idx = binarySearchIndex(_orders, (candidate) => candidate.price - order.price);
    _orders.splice(idx, 0, order);

    options.market.subscribeToOrder(order.id, (change) => {
      if (change.kind !== "remove") return;
      removeRestingOrder(change.side, change.order);
    });
  };

  const getRestingOrders = (side: OrderSide): RestingOrder[] => [...restingOrders[side]];

  return {
    simulate,
    addOrder,
    getRestingOrders,
  };
};
