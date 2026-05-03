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
  timeWeightingProbability: Accessor<number>;
  priceMovement: {
    probability: Accessor<number>;
    recencyDecay: Accessor<number>;
  };
  localVolume: {
    probability: Accessor<number>;
    window: Accessor<number>;
  };
  farOrder: {
    probability: Accessor<number>;
    minAge: Accessor<number>;
    window: Accessor<number>;
    ramp: Accessor<number>;
  };
};

export const createCancellationState = (options: Options) => {
  const { timeWeightingProbability, priceMovement, localVolume, farOrder } = options;

  // todo: remove linear dependence on amount of orders
  const [restingOrders, setRestingOrders] = createSignal<RestingOrder[]>([]);

  createEffect(() => {
    const latest = latestOrderBookChange();
    const removed = latest.changes.filter((change) => change.kind === "remove");
    const partialFilled = latest.changes.filter((change) => change.kind === "partial-fill");
    setRestingOrders((orders) => {
      let didChange = false;
      const updated = orders
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

      return didChange ? updated : orders;
    });
  });

  type VolumeIndexState = {
    index: Map<number, number>;
    window: number;
  };
  const volumeIndexState = createMemo<VolumeIndexState>(
    (state) => {
      // todo: rebuild index using full orderbook
      if (state.window !== localVolume.window()) {
        const window = localVolume.window();
        const index = new Map<number, number>();
        const book = orderBook();
        const orders = restingOrders();

        for (let i = 0; i < orders.length; i += 1) {
          const candidate = orders[i]!;
          const sign = candidate.side === "buy" ? 1 : -1;
          const minPrice = sign < 0 ? candidate.price : candidate.price * (1 - window);
          const maxPrice = sign < 0 ? candidate.price * (1 + window) : candidate.price;
          let volume = 0;

          const startIdx = book[candidate.side].findIndex((order) => order.price >= minPrice);
          const endIdx = book[candidate.side].findIndex((order) => order.price <= maxPrice);

          for (let i = startIdx; i < endIdx; i += 1) {
            volume += book[candidate.side][i].size;
          }
          index.set(candidate.id, volume);
        }
        return { index, window };
      }
      const { index, window } = state;

      const orders = restingOrders();
      const latest = latestOrderBookChange();

      for (const change of latest.changes) {
        if (orders.some((order) => order.id === change.order.id)) {
          if (change.kind === "add") {
            index.set(change.order.id, change.order.size);
          } else if (change.kind === "remove") {
            index.delete(change.order.id);
          } else if (change.kind === "partial-fill") {
            const delta = change.prevSize - change.order.size;
            const next = index.get(change.order.id)! - delta;
            index.set(change.order.id, next);
          }
        }
        const sign = change.side === "buy" ? 1 : -1;
        const minPrice = sign > 0 ? change.order.price : change.order.price * (1 - window);
        const maxPrice = sign > 0 ? change.order.price * (1 + window) : change.order.price;
        const startIdx = orders.findIndex((order) => order.price >= minPrice);
        if (startIdx === -1) continue;
        const endIdx = orders.findLastIndex((order) => order.price <= maxPrice);
        const delta = (() => {
          if (change.kind === "add") {
            return change.order.size;
          } else if (change.kind === "remove") {
            return -change.order.size;
          } else if (change.kind === "partial-fill") {
            return change.order.size - change.prevSize;
          }
          return 0;
        })();
        for (let i = startIdx; i < (endIdx === -1 ? orders.length : endIdx); i += 1) {
          const order = orders[i];
          const size = index.get(order.id)!;
          index.set(order.id, size + delta);
        }
      }
      return { index, window: localVolume.window() };
    },
    { index: new Map<number, number>(), window: localVolume.window() },
    { equals: false },
  );

  const orderWeights = (order: RestingOrder) => {
    // todo: debug why it can get negative
    // const volumeWeight = volumeIndexState().index.get(order.id)!;
    const volumeWeight = Math.abs(volumeIndexState().index.get(order.id)!);

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

    return { ageWeight: age, volumeWeight, movementWeight, farWeight };
  };

  const randomRestingOrder = (
    side: OrderSide,
    weightByAge = false,
    weightByPriceMovement = false,
    weightByLocalVolume = false,
    weightByFarOrder = false,
  ): RestingOrder | null => {
    const orders = restingOrders().filter((order) => order.side === side);
    const weights = orders.map((order) => {
      const weights = orderWeights(order);
      // console.log(weights);

      let weight = 1;
      if (weightByAge) weight += weights.ageWeight;
      if (weightByPriceMovement) weight += weights.movementWeight;
      if (weightByLocalVolume) weight += weights.volumeWeight;
      if (weightByFarOrder) weight += weights.farWeight;
      return weight;
    });

    let totalWeight = weights.reduce((total, weight) => total + weight, 0);

    let targetWeight = sampleUniform(0, totalWeight);

    for (let i = 0; i < weights.length; i += 1) {
      targetWeight -= weights[i];

      if (targetWeight <= 0) return orders[i];
    }

    return null;
  };

  const removeRestingOrder = (id: number) => {
    setRestingOrders((orders) => orders.filter((order) => order.id !== id));
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(
      side,
      sampleBernoulli(timeWeightingProbability()),
      sampleBernoulli(priceMovement.probability()),
      sampleBernoulli(localVolume.probability()),
      sampleBernoulli(farOrder.probability()),
    );
    if (!order) return false;

    removeRestingOrder(order.id);
    return cancelOrder(order.id, order.side) !== null;
  };

  const addOrder = (order: RestingOrder): void => {
    // todo: binary search insert?
    setRestingOrders((orders) => [...orders, order].sort((left, right) => left.price - right.price));
  };

  return {
    simulate,
    addOrder,
  };
};
