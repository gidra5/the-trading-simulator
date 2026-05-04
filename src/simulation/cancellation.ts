import {
  cancelOrder,
  latestOrderBookChange,
  marketPriceSpread,
  orderBook,
  priceHistory,
  type OrderSide,
} from "../market/index";
import { sampleBernoulli, sampleUniform } from "../distributions";

import type { RestingOrder } from "./types";
import { Accessor, createEffect, createMemo, createSignal } from "solid-js";
import { oppositeSide } from "../market/order";

// const recentPriceHistory = createMemo<PricePoint[]>((recentHistory) => {
//   const history = priceHistory();
//   const latest = history[history.length - 1];
//   const now = Date.now();
//   const expiredIndex = (() => {
//     for (let i = 0; i < recentHistory.length; i += 1) {
//       const entry = recentHistory[i];
//       if (entry.time + priceMemory() >= now) return i;
//     }
//   })();

//   recentHistory.splice(0, expiredIndex);
//   recentHistory.push({ time: latest.timestamp, ...latest.spread });
//   return recentHistory;
// }, [], { equals: false });

// type PriceAnchors = {
//   minSell: number;
//   maxSell: number;
//   minBuy: number;
//   maxBuy: number;
// };
// const priceAnchors = createMemo<number>(() => {

type Options = {
  ageWeight: Accessor<number>;
  priceMovement: {
    weight: Accessor<number>;
    recencyDecay: Accessor<number>;
  };
  localVolume: {
    weight: Accessor<number>;
    ramp: Accessor<number>;
  };
  farOrder: {
    weight: Accessor<number>;
    minAge: Accessor<number>;
    window: Accessor<number>;
    ramp: Accessor<number>;
  };
};

export const createCancellationState = (options: Options) => {
  const { ageWeight, priceMovement, localVolume, farOrder } = options;
  const totalWeight = () => ageWeight() + priceMovement.weight() + localVolume.weight() + farOrder.weight();

  // todo: remove linear dependence on amount of orders
  type RestingOrders = { buy: RestingOrder[]; sell: RestingOrder[] };
  const [restingOrders, setRestingOrders] = createSignal<RestingOrders>({ buy: [], sell: [] });

  createEffect(() => {
    const latest = latestOrderBookChange();
    const removed = latest.changes.filter((change) => change.kind === "remove");
    const partialFilled = latest.changes.filter((change) => change.kind === "partial-fill");

    setRestingOrders((orders) => {
      let didChange = false;
      const updatedOrders = (orders: RestingOrder[]) => {
        return orders
          .filter((order) => {
            const willRemove = !removed.some((change) => change.order.id === order.id);
            didChange = didChange || willRemove;
            return willRemove;
          })
          .map((order) => {
            const change = partialFilled.find((change) => change.order.id === order.id);
            const changed = !!change;
            didChange = didChange || changed;
            return changed ? { ...order, size: change.order.size } : order;
          });
      };
      const updated = {
        buy: updatedOrders(orders.buy),
        sell: updatedOrders(orders.sell),
      };
      return didChange ? updated : orders;
    });
  });

  type VolumeIndexState = {
    index: Map<number, number>;
    window: number;
  };

  const orderWeights = (order: RestingOrder) => {
    // todo: use histogram data
    // const volume = volumeIndexState().index.get(order.id)!;
    // assert(volume >= 0, "expected volume weight to be positive");
    // const volumeWeight = 1-Math.exp(-Math.abs(volume) / localVolume.ramp());
    // const volumeWeight = 1-Math.exp(-volume / localVolume.ramp());
    const volumeWeight = 1;

    const age = Date.now() - order.createdAt;
    const opposite = oppositeSide(order.side);

    const movement = (() => {
      const history = priceHistory();
      const latest = history[history.length - 1];
      const prev = history[history.length - 2];
      if (!prev || !latest) return 0;
      const prevPrice = prev.spread[opposite];
      const latestPrice = latest.spread[opposite];
      const sign = order.side === "buy" ? 1 : -1;
      return Math.max(0, sign * (latestPrice - prevPrice));
    })();

    const recency = Math.exp(-age / priceMovement.recencyDecay());
    const movementWeight = movement * recency;

    const farWeight = (() => {
      if (age < farOrder.minAge()) return 0;

      const current = marketPriceSpread()[opposite];
      const distance = Math.abs(order.price - current) / current;
      const excessDistance = distance - farOrder.window();
      if (excessDistance <= 0) return 0;

      return 1 - Math.exp(-excessDistance / farOrder.ramp());
    })();

    let weight = 1;
    weight += age * ageWeight();
    weight += movementWeight * priceMovement.weight();
    weight += volumeWeight * localVolume.weight();
    weight += farWeight * farOrder.weight();
    return weight;
  };

  const randomRestingOrder = (side: OrderSide): RestingOrder | null => {
    // todo: make it constant time? or log time at least
    // for that remove conditional weighting and replace with weighted sum
    // then move that into a memo (or some other way precompute it)
    // and then binary search through it
    // or binning to create a hashmap
    const orders = restingOrders()[side];
    const weights = orders.map(orderWeights);

    let totalWeight = weights.reduce((total, weight) => total + weight, 0);

    let targetWeight = sampleUniform(0, totalWeight);

    for (let i = 0; i < weights.length; i += 1) {
      targetWeight -= weights[i];

      if (targetWeight <= 0) return orders[i];
    }

    return null;
  };

  const removeRestingOrder = (id: number) => {
    setRestingOrders((orders) => ({
      buy: orders.buy.filter((order) => order.id !== id),
      sell: orders.sell.filter((order) => order.id !== id),
    }));
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(side);
    if (!order) return false;

    removeRestingOrder(order.id);
    return cancelOrder(order.id, order.side) !== null;
  };

  const addOrder = (order: RestingOrder): void => {
    // todo: binary search insert?
    setRestingOrders((orders) =>
      order.side === "buy"
        ? {
            buy: [...orders.buy, order].sort((left, right) => left.price - right.price),
            sell: orders.sell,
          }
        : {
            buy: orders.buy,
            sell: [...orders.sell, order].sort((left, right) => left.price - right.price),
          },
    );
  };

  return {
    simulate,
    addOrder,
  };
};
