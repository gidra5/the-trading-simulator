import { type MarketState, type OrderSide } from "../market/index";

import type { RestingOrder } from "./types";
import type { Accessor } from "solid-js";
import { oppositeSide } from "../market/order";
import { type SimulationTimeState } from "./time";
import { createResampler } from "../sampling";
import { binarySearchIndex } from "../utils";

// const recentPriceHistory = createMemo<PricePoint[]>((recentHistory) => {
//   const history = priceHistory();
//   const latest = history[history.length - 1];
//   const now = time();
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
  market: MarketState;
  time: SimulationTimeState;
  candidatesCount: Accessor<number>;
  onCancel: (order: RestingOrder) => boolean;

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

type RestingOrders = { buy: RestingOrder[]; sell: RestingOrder[] };
export const createCancellationState = (options: CancellationOptions) => {
  const market = options.market;
  const timeState = options.time;
  let restingOrders: RestingOrders = { buy: [], sell: [] };

  const orderFeatures = (order: RestingOrder) => {
    const spread = market.marketPriceSpread();
    const volumePriceMin = order.side === "buy" ? order.price : spread.sell;
    const volumePriceMax = order.side === "buy" ? spread.buy : order.price;
    const localVolumeValue = market.querySideVolumeInPriceRange(order.side, volumePriceMin, volumePriceMax);
    // const localVolumeWeight = 1 - Math.exp(-localVolumeValue / options.localVolume.ramp());
    const localVolumeWeight = localVolumeValue;

    const age = timeState.time() - order.createdAt;
    const opposite = oppositeSide(order.side);

    const priceMovementValue = (() => {
      const history = market.priceHistory();
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

  const orderWeight = (order: RestingOrder): number => {
    const features = orderFeatures(order);
    const { ageWeight, priceMovement, localVolume, farOrder } = options;

    let weight = 1;
    weight += features.age * ageWeight();
    weight += features.priceMovementWeight * priceMovement.weight();
    weight += features.localVolumeWeight * localVolume.weight();
    weight += features.farWeight * farOrder.weight();
    return weight;
  };

  const proposalSampler = (side: OrderSide) => {
    const items = restingOrders[side];
    if (items.length === 0) return null;
    const index = Math.floor(Math.random() * items.length);
    return { item: items[index], weight: 1 / items.length };
  };

  const ordersSampler = {
    buy: createResampler<RestingOrder>({
      candidateCount: options.candidatesCount,
      proposalSample: () => proposalSampler("buy"),
      weight: orderWeight,
    }),
    sell: createResampler<RestingOrder>({
      candidateCount: options.candidatesCount,
      proposalSample: () => proposalSampler("sell"),
      weight: orderWeight,
    }),
  };

  const randomRestingOrder = (side: OrderSide): RestingOrder | null => {
    return ordersSampler[side].sample();
  };

  const removeRestingOrder = (side: OrderSide, order: { id: number; price: number }): boolean => {
    const orders = restingOrders[side];
    let idx = binarySearchIndex(orders, (candidate) => candidate.price - order.price);
    if (idx >= orders.length) return false;

    while (idx < orders.length && orders[idx]!.id !== order.id) idx += 1;
    if (idx >= orders.length) return false;

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

    market.subscribeToOrder(order.id, (change) => {
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
