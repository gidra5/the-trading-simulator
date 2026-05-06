import {
  cancelOrder,
  latestOrderBookChange,
  marketPriceSpread,
  priceHistory,
  querySideVolumeInPriceRange,
  type OrderSide,
} from "../market/index";

import type { RestingOrder } from "./types";
import { createEffect, createSignal, type Accessor } from "solid-js";
import { oppositeSide } from "../market/order";
import type { PriceHistoryEntry, PriceSpread } from "../market/orderBook";
import { sampleWeightedList } from "../sampling";

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

export type CancellationOptions = {
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

export type CancellationWeightEnvironment = {
  now: Accessor<number>;
  marketPriceSpread: Accessor<PriceSpread>;
  priceHistory: Accessor<PriceHistoryEntry[]>;
  querySideVolumeInPriceRange: (side: OrderSide, minPrice: number, maxPrice: number, includeMax?: boolean) => number;
};

export type CancellationOrderFeatures = {
  age: number;
  distanceFromMid: number;
  localVolume: number;
  localVolumeWeight: number;
  priceMovement: number;
  priceMovementWeight: number;
  cancellationPriceDistance: number;
  farWeight: number;
  isFar: boolean;
};

export type WeightedCancellationOrder = {
  order: RestingOrder;
  index: number;
  weight: number;
  features: CancellationOrderFeatures;
};

type RestingOrders = { buy: RestingOrder[]; sell: RestingOrder[] };

const defaultCancellationWeightEnvironment: CancellationWeightEnvironment = {
  now: () => Date.now(),
  marketPriceSpread,
  priceHistory,
  querySideVolumeInPriceRange,
};

const getCancellationOrderWeightFromFeatures = (
  features: CancellationOrderFeatures,
  options: CancellationOptions,
): number => {
  const { ageWeight, priceMovement, localVolume, farOrder } = options;

  let weight = 1;
  weight += features.age * ageWeight();
  weight += features.priceMovementWeight * priceMovement.weight();
  weight += features.localVolumeWeight * localVolume.weight();
  weight += features.farWeight * farOrder.weight();
  return weight;
};

export const getCancellationOrderFeatures = (
  order: RestingOrder,
  options: CancellationOptions,
  environment = defaultCancellationWeightEnvironment,
): CancellationOrderFeatures => {
  const spread = environment.marketPriceSpread();
  const volumePriceMin = order.side === "buy" ? order.price : spread.sell;
  const volumePriceMax = order.side === "buy" ? spread.buy : order.price;
  const localVolumeValue = environment.querySideVolumeInPriceRange(order.side, volumePriceMin, volumePriceMax);
  const localVolumeWeight = 1 - Math.exp(-localVolumeValue / options.localVolume.ramp());

  const age = environment.now() - order.createdAt;
  const opposite = oppositeSide(order.side);

  const priceMovementValue = (() => {
    const history = environment.priceHistory();
    const latest = history[history.length - 1];
    const prev = history[history.length - 2];
    if (!prev || !latest) return 0;
    const prevPrice = prev.spread[opposite];
    const latestPrice = latest.spread[opposite];
    const sign = order.side === "buy" ? 1 : -1;
    return Math.max(0, sign * (latestPrice - prevPrice));
  })();

  const priceMovementWeight = priceMovementValue * Math.exp(-age / options.priceMovement.recencyDecay());

  const cancellationReferencePrice = spread[opposite];
  const cancellationPriceDistance = Math.abs(order.price - cancellationReferencePrice) / cancellationReferencePrice;

  const farWeight = (() => {
    if (age < options.farOrder.minAge()) return 0;

    const excessDistance = cancellationPriceDistance - options.farOrder.window();
    if (excessDistance <= 0) return 0;

    return 1 - Math.exp(-excessDistance / options.farOrder.ramp());
  })();

  const midPrice = (spread.buy + spread.sell) / 2;
  const distanceFromMid = Math.abs(order.price - midPrice) / midPrice;

  return {
    age,
    distanceFromMid,
    localVolume: localVolumeValue,
    localVolumeWeight,
    priceMovement: priceMovementValue,
    priceMovementWeight,
    cancellationPriceDistance,
    farWeight,
    isFar: farWeight > 0,
  };
};

export const getWeightedCancellationOrders = (
  orders: RestingOrder[],
  options: CancellationOptions,
  environment = defaultCancellationWeightEnvironment,
): WeightedCancellationOrder[] =>
  orders.map((order, index) => {
    const features = getCancellationOrderFeatures(order, options, environment);

    return {
      order,
      index,
      features,
      weight: getCancellationOrderWeightFromFeatures(features, options),
    };
  });

export const createCancellationState = (options: CancellationOptions) => {
  // todo: remove linear dependence on amount of orders
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

  const randomRestingOrder = (side: OrderSide): RestingOrder | null => {
    // todo: make it constant time? or log time at least
    // for that remove conditional weighting and replace with weighted sum
    // then move that into a memo (or some other way precompute it)
    // and then binary search through it
    // or binning to create a hashmap
    return sampleWeightedList(getWeightedCancellationOrders(restingOrders()[side], options))?.order ?? null;
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

  const getRestingOrders = (side: OrderSide): RestingOrder[] => [...restingOrders()[side]];
  const getAllRestingOrders = (): RestingOrders => ({
    buy: getRestingOrders("buy"),
    sell: getRestingOrders("sell"),
  });
  const getWeightedRestingOrders = (side: OrderSide): WeightedCancellationOrder[] =>
    getWeightedCancellationOrders(restingOrders()[side], options);

  return {
    simulate,
    addOrder,
    getAllRestingOrders,
    getRestingOrders,
    getWeightedRestingOrders,
  };
};
