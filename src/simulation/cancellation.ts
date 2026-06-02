import type { Accessor } from "solid-js";
import { type OrderSide } from "../market/index";
import { clamp } from "../utils";
import type { RestingOrder } from "./types";

type OwnedOrders = { buy: RestingOrder[]; sell: RestingOrder[] };

export type CancellationOptions = {
  ownedOrders: Accessor<OwnedOrders>;
  removeOrder: (order: RestingOrder) => void;
  onCancel: (order: RestingOrder) => boolean;

  candidatesCount: Accessor<number>;
  sampleOrderIndex: (orderCount: number) => number;
};

export const createCancellationState = (options: CancellationOptions) => {
  const randomRestingOrder = (side: OrderSide): RestingOrder | null => {
    const orders = options.ownedOrders()[side];
    if (orders.length === 0) return null;

    const index = Math.floor(clamp(options.sampleOrderIndex(orders.length), 0, orders.length - 1));
    return orders[index] ?? null;
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(side);
    if (!order) return false;

    options.removeOrder(order);
    return options.onCancel(order);
  };

  return { simulate };
};
