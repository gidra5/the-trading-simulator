import type { Accessor } from "solid-js";
import { type MarketState, type OrderSide } from "../market/index";
import { type OrderBookChange } from "../market/orderBook";
import { binarySearchIndex, clamp, createCleanupScope } from "../utils";
import type { RestingOrder } from "./types";

export type CancellationOptions = {
  market?: Pick<MarketState, "subscribeToOrder">;
  onCancel: (order: RestingOrder) => boolean;

  candidatesCount: Accessor<number>;
  sampleOrderIndex: (orderCount: number) => number;
};

type RestingOrders = { buy: RestingOrder[]; sell: RestingOrder[] };
type SubscribeToOrder = (id: number, callback: (change: OrderBookChange) => void) => VoidFunction | void;

export type CancellationSnapshot = {
  restingOrders: RestingOrders;
};

const cloneRestingOrder = (order: RestingOrder): RestingOrder => ({ ...order });
const cloneRestingOrders = (orders: RestingOrders): RestingOrders => ({
  buy: orders.buy.map(cloneRestingOrder),
  sell: orders.sell.map(cloneRestingOrder),
});

export const createCancellationState = (options: CancellationOptions) => {
  const restingOrders: RestingOrders = { buy: [], sell: [] };
  const subscriptionScope = createCleanupScope();
  const subscribedOrderIds = new Set<number>();

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
    subscribedOrderIds.delete(order.id);
    return true;
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(side);
    if (!order) return false;

    removeRestingOrder(order.side, order);
    return options.onCancel(order);
  };

  const addOrder = (
    order: RestingOrder,
    subscribeToOrder: SubscribeToOrder | undefined = options.market?.subscribeToOrder,
  ): void => {
    const _orders = restingOrders[order.side];
    const idx = binarySearchIndex(_orders, (candidate) => candidate.price - order.price);
    _orders.splice(idx, 0, cloneRestingOrder(order));

    if (!subscribeToOrder || subscribedOrderIds.has(order.id)) return;

    subscribedOrderIds.add(order.id);
    subscriptionScope.run(() =>
      subscribeToOrder(order.id, (change) => {
        if (change.kind !== "remove") return;
        removeRestingOrder(change.side, change.order);
      }),
    );
  };

  const getRestingOrders = (side: OrderSide): RestingOrder[] => [...restingOrders[side]];

  const snapshot = (): CancellationSnapshot => ({
    restingOrders: cloneRestingOrders(restingOrders),
  });

  const restore = (snapshot: CancellationSnapshot): void => {
    subscriptionScope.reset();
    subscribedOrderIds.clear();
    restingOrders.buy = [];
    restingOrders.sell = [];

    for (const order of snapshot.restingOrders.buy) addOrder(order);
    for (const order of snapshot.restingOrders.sell) addOrder(order);
  };

  return {
    simulate,
    addOrder,
    getRestingOrders,
    restore,
    snapshot,
  };
};
