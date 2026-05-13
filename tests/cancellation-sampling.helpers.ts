import { expect, vi } from "vitest";
import { createRoot } from "solid-js";
import type { CancellationOptions, createCancellationState } from "../src/simulation/cancellation";
import type { MarketState, OrderSide } from "../src/market";
import type { OrderBookChange } from "../src/market/orderBook";
import type { MarketBehaviorSettings, RestingOrder, SimulationEventType } from "../src/simulation/types";
import { binarySearchIndex } from "../src/utils";

type CancellationState = ReturnType<typeof createCancellationState>;
type PriceSpread = { buy: number; sell: number };
type PriceHistoryEntry = {
  revision: number;
  timestamp: number;
  spread: PriceSpread;
};
type CancellationSamplingContext = {
  marketPriceSpread: () => PriceSpread;
  oppositeSide: (side: OrderSide) => OrderSide;
  priceHistory: () => PriceHistoryEntry[];
  querySideVolumeInPriceRange: (side: OrderSide, minPrice: number, maxPrice: number, includeMax?: boolean) => number;
  time: () => number;
};

type CancellationOrderFeatures = {
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
  features: CancellationOrderFeatures;
  weight: number;
  index?: number;
};

export type CancellationProposal = "exact" | "age" | "uniform";

export type SamplingFeatures = {
  averageAge: number;
  averageDistanceFromMid: number;
  averageLocalVolume: number;
  fractionBuy: number;
  fractionSell: number;
  fractionFar: number;
  averageTrueWeight: number;
  averageCancellationPriceDistance: number;
};

const sides = ["buy", "sell"] as const;
const eventTypes: SimulationEventType[] = [
  "market-buy",
  "market-sell",
  "order-buy",
  "order-sell",
  "cancel-buy",
  "cancel-sell",
];

export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const createCancellationOptions = (
  dependencies: Pick<CancellationOptions, "market" | "time">,
  settings: MarketBehaviorSettings,
  onCancel: (order: RestingOrder) => boolean,
  weights = {
    age: 0.000_001,
    priceMovement: 0.5,
    localVolume: 0.5,
    farOrder: 0.5,
  },
): CancellationOptions => ({
  ...dependencies,
  candidatesCount: () => 64,
  onCancel,
  ageWeight: () => weights.age,
  priceMovement: {
    weight: () => weights.priceMovement,
    recencyDecay: () => settings.cancellationPriceMovementOrderDecay,
  },
  localVolume: {
    weight: () => weights.localVolume,
    ramp: () => settings.cancellationLocalVolumeRamp,
  },
  farOrder: {
    weight: () => weights.farOrder,
    minAge: () => settings.cancellationFarOrderMinAge,
    window: () => settings.cancellationFarOrderWindow,
    ramp: () => settings.cancellationFarOrderRamp,
  },
});

export const buildSamplingFixture = async (fixtureOptions: {
  seed?: number;
  ticks: number;
}): Promise<{
  context: CancellationSamplingContext;
  options: CancellationOptions;
  sampleStateCancellation: (side: OrderSide) => RestingOrder | null;
  state: CancellationState;
  orders: RestingOrder[];
}> => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.spyOn(Math, "random").mockImplementation(seededRandom(fixtureOptions.seed ?? 0x5eed));
  let latestCanceledOrder: RestingOrder | null = null;
  const testOrderSubscriptions = new Map<number, Set<(change: OrderBookChange) => void>>();
  const emitTestOrderRemove = (order: RestingOrder): void => {
    const subscribers = testOrderSubscriptions.get(order.id);
    if (!subscribers) return;

    for (const subscriber of [...subscribers]) {
      subscriber({ kind: "remove", side: order.side, order });
    }
  };

  const [{ createTradingSimulationState }, cancellation, { createMarketState }, order, { createSimulationTimeState }] =
    await Promise.all([
      import("../src/simulation/index"),
      import("../src/simulation/cancellation"),
      import("../src/market"),
      import("../src/market/order"),
      import("../src/simulation/time"),
    ]);
  const timeModule = createSimulationTimeState();
  const actualMarket = createRoot(() => createMarketState({ time: timeModule.time }));
  const market: MarketState = {
    ...actualMarket,
    subscribeToOrder: (id: number, cb: (change: OrderBookChange) => void) => {
      if (!testOrderSubscriptions.has(id)) {
        testOrderSubscriptions.set(id, new Set());
      }

      const subscribers = testOrderSubscriptions.get(id)!;
      const callback = (change: OrderBookChange): void => {
        cb(change);
        if (change.kind === "remove") subscribers.delete(callback);
        if (subscribers.size === 0) testOrderSubscriptions.delete(id);
      };
      subscribers.add(callback);
      const unsubscribeActual = actualMarket.subscribeToOrder(id, callback);

      return () => {
        unsubscribeActual();
        subscribers.delete(callback);
        if (subscribers.size === 0) testOrderSubscriptions.delete(id);
      };
    },
  };
  const simulation = createTradingSimulationState({ market, time: timeModule });

  let orders: RestingOrder[] = [];
  let tick = 0;
  for (; tick < fixtureOptions.ticks; tick += 1) {
    simulation.tick(250);
  }

  while (tick < fixtureOptions.ticks * 100) {
    orders = sides.flatMap((side) => simulation.getCancellationRestingOrders(side));
    if (
      orders.length > 20 &&
      orders.some((order) => order.side === "buy") &&
      orders.some((order) => order.side === "sell")
    ) {
      break;
    }

    simulation.tick(250);
    tick += 1;
  }

  const settings = simulation.getMarketBehaviorSettings();
  timeModule.advance(settings.cancellationFarOrderMinAge + 1_000);

  orders = sides.flatMap((side) => simulation.getCancellationRestingOrders(side));
  expect(orders.length).toBeGreaterThan(20);
  expect(orders.some((order) => order.side === "buy")).toBe(true);
  expect(orders.some((order) => order.side === "sell")).toBe(true);

  const options = createCancellationOptions({ market, time: timeModule }, settings, (order) => {
    latestCanceledOrder = order;
    emitTestOrderRemove(order);
    return true;
  });
  const state = cancellation.createCancellationState(options);
  for (const order of orders) {
    state.addOrder(order);
  }

  const sampleStateCancellation = (side: OrderSide): RestingOrder | null => {
    latestCanceledOrder = null;
    state.simulate(side);
    const order = latestCanceledOrder;
    if (order) state.addOrder(order);
    return order;
  };

  return {
    context: {
      marketPriceSpread: market.marketPriceSpread,
      oppositeSide: order.oppositeSide,
      priceHistory: market.priceHistory,
      querySideVolumeInPriceRange: market.querySideVolumeInPriceRange,
      time: timeModule.time,
    },
    options,
    sampleStateCancellation,
    state,
    orders,
  };
};

const getAllRestingOrders = (state: CancellationState): RestingOrder[] => [
  ...state.getRestingOrders("buy"),
  ...state.getRestingOrders("sell"),
];

const getOrderFeatures = (
  order: RestingOrder,
  options: CancellationOptions,
  context: CancellationSamplingContext,
): CancellationOrderFeatures => {
  const spread = context.marketPriceSpread();
  const volumePriceMin = order.side === "buy" ? order.price : spread.sell;
  const volumePriceMax = order.side === "buy" ? spread.buy : order.price;
  const localVolumeValue = context.querySideVolumeInPriceRange(order.side, volumePriceMin, volumePriceMax);
  const localVolumeWeight = localVolumeValue;

  const age = context.time() - order.createdAt;
  const opposite = context.oppositeSide(order.side);

  const priceMovementValue = (() => {
    const history = context.priceHistory();
    const latest = history[history.length - 1];
    const prev = history[history.length - 2];
    if (!prev || !latest) return 0;

    const prevPrice = prev.spread[opposite];
    const latestPrice = latest.spread[opposite];
    if (!Number.isFinite(prevPrice) || !Number.isFinite(latestPrice)) return 0;

    const sign = order.side === "buy" ? 1 : -1;
    return Math.max(0, sign * (latestPrice - prevPrice));
  })();

  const priceMovementWeight = priceMovementValue * Math.exp(-age / options.priceMovement.recencyDecay());

  const cancellationReferencePrice = spread[opposite];
  const cancellationPriceDistance =
    Number.isFinite(cancellationReferencePrice) && cancellationReferencePrice > 0
      ? Math.abs(order.price - cancellationReferencePrice) / cancellationReferencePrice
      : 0;

  const farWeight = (() => {
    if (age < options.farOrder.minAge()) return 0;

    const excessDistance = cancellationPriceDistance - options.farOrder.window();
    if (excessDistance <= 0) return 0;

    return 1 - Math.exp(-excessDistance / options.farOrder.ramp());
  })();

  const midPrice = (spread.buy + spread.sell) / 2;
  const distanceFromMid = Number.isFinite(midPrice) && midPrice > 0 ? Math.abs(order.price - midPrice) / midPrice : 0;

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

const getOrderWeight = (
  order: RestingOrder,
  options: CancellationOptions,
  context: CancellationSamplingContext,
): number => {
  const features = getOrderFeatures(order, options, context);
  const { ageWeight, priceMovement, localVolume, farOrder } = options;

  let weight = 1;
  weight += features.age * ageWeight();
  weight += features.priceMovementWeight * priceMovement.weight();
  weight += features.localVolumeWeight * localVolume.weight();
  weight += features.farWeight * farOrder.weight();
  return weight;
};

export const getWeightedCancellationOrders = (
  state: CancellationState,
  options: CancellationOptions,
  context: CancellationSamplingContext,
): WeightedCancellationOrder[] =>
  getAllRestingOrders(state).map((order) => ({
    order,
    features: getOrderFeatures(order, options, context),
    weight: getOrderWeight(order, options, context),
  }));

const getProposalWeight = (order: WeightedCancellationOrder, proposal: CancellationProposal): number => {
  switch (proposal) {
    case "exact":
      return order.weight;
    case "age":
      return Math.max(order.features.age, Number.EPSILON);
    case "uniform":
      return 1;
  }
};

export const getResampledApproximateWeightedCancellationOrders = (
  state: CancellationState,
  options: CancellationOptions,
  context: CancellationSamplingContext,
  {
    candidateCount,
    proposal = "age",
    sampleCount,
  }: {
    candidateCount: number;
    proposal?: CancellationProposal;
    sampleCount: number;
  },
): {
  orders: WeightedCancellationOrder[];
  diagnostics: {
    candidateCount: number;
    sampleCount: number;
    uniqueCandidateCount: number;
    candidateCoverage: number;
    effectiveSampleSize: number;
    minWeightRatio: number;
    maxWeightRatio: number;
    weightRatioSpread: number;
  };
} => {
  const preciseOrders = getWeightedCancellationOrders(state, options, context);
  const proposalOrders = preciseOrders.map((order) => ({
    ...order,
    weight: getProposalWeight(order, proposal),
  }));
  const sampleProposalOrder = createWeightedSampler(proposalOrders);
  const makeSampledCandidate = (candidate: WeightedCancellationOrder): WeightedCancellationOrder => ({
    ...candidate,
    weight: getOrderWeight(candidate.order, options, context) / Math.max(candidate.weight, Number.EPSILON),
  });
  const makeExhaustiveCandidate = (candidate: WeightedCancellationOrder): WeightedCancellationOrder => ({
    ...candidate,
    weight: getOrderWeight(candidate.order, options, context),
  });
  const candidates: WeightedCancellationOrder[] =
    candidateCount >= proposalOrders.length ? proposalOrders.map(makeExhaustiveCandidate) : [];
  const approximateOrders = new Map<number, WeightedCancellationOrder>();
  const candidateIds = new Set<number>(candidates.map((candidate) => candidate.order.id));
  let minWeightRatio = Infinity;
  let maxWeightRatio = 0;
  let effectiveSampleSizeTotal = 0;
  let successfulCandidateSets = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sampleCandidates = [...candidates];

    for (let index = sampleCandidates.length; index < candidateCount; index += 1) {
      const candidate = sampleProposalOrder();
      if (!candidate) break;

      sampleCandidates.push(makeSampledCandidate(candidate));
    }

    for (const candidate of sampleCandidates) {
      candidateIds.add(candidate.order.id);
      if (Number.isFinite(candidate.weight) && candidate.weight > 0) {
        minWeightRatio = Math.min(minWeightRatio, candidate.weight);
        maxWeightRatio = Math.max(maxWeightRatio, candidate.weight);
      }
    }

    const weightTotal = sampleCandidates.reduce((total, candidate) => total + candidate.weight, 0);
    const squaredWeightTotal = sampleCandidates.reduce((total, candidate) => total + candidate.weight ** 2, 0);
    if (squaredWeightTotal > 0) {
      effectiveSampleSizeTotal += weightTotal ** 2 / squaredWeightTotal;
      successfulCandidateSets += 1;
    }

    const selected = sampleWeightedList(sampleCandidates);
    if (!selected) continue;

    const existing = approximateOrders.get(selected.order.id);
    if (existing) {
      existing.weight += 1;
      continue;
    }

    approximateOrders.set(selected.order.id, { ...selected, weight: 1 });
  }

  const uniqueCandidateCount = candidateIds.size;
  if (!Number.isFinite(minWeightRatio)) minWeightRatio = 0;

  return {
    orders: [...approximateOrders.values()],
    diagnostics: {
      candidateCount,
      sampleCount,
      uniqueCandidateCount,
      candidateCoverage: preciseOrders.length > 0 ? uniqueCandidateCount / preciseOrders.length : 0,
      effectiveSampleSize: successfulCandidateSets > 0 ? effectiveSampleSizeTotal / successfulCandidateSets : 0,
      minWeightRatio,
      maxWeightRatio,
      weightRatioSpread: minWeightRatio > 0 ? maxWeightRatio / minWeightRatio : 0,
    },
  };
};

export const getSideStratifiedResampledCancellationOrders = (
  preciseOrders: WeightedCancellationOrder[],
  {
    candidateCount,
    sampleCount,
  }: {
    candidateCount: number;
    sampleCount: number;
  },
): WeightedCancellationOrder[] => {
  const preciseBySide = {
    buy: preciseOrders.filter((order) => order.order.side === "buy"),
    sell: preciseOrders.filter((order) => order.order.side === "sell"),
  };
  const sideWeights = {
    buy: totalWeight(preciseBySide.buy),
    sell: totalWeight(preciseBySide.sell),
  };
  const sideTotal = sideWeights.buy + sideWeights.sell;
  const proposalSamplers = {
    buy: createUniformSampler(preciseBySide.buy),
    sell: createUniformSampler(preciseBySide.sell),
  };
  const samples = new Map<number, WeightedCancellationOrder>();

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const side = Math.random() * sideTotal < sideWeights.buy ? "buy" : "sell";
    const candidates: WeightedCancellationOrder[] = [];

    for (let index = 0; index < candidateCount; index += 1) {
      const candidate = proposalSamplers[side]();
      if (!candidate) break;

      candidates.push(candidate);
    }

    const selected = sampleWeightedList(candidates);
    if (!selected) continue;

    const existing = samples.get(selected.order.id);
    if (existing) {
      existing.weight += 1;
      continue;
    }

    samples.set(selected.order.id, { ...selected, weight: 1 });
  }

  return [...samples.values()];
};

export const empiricalStateCancellationWeights = (
  preciseOrders: WeightedCancellationOrder[],
  sampleCount: number,
  sampleStateCancellation: (side: OrderSide) => RestingOrder | null,
): WeightedCancellationOrder[] => {
  const preciseById = new Map(preciseOrders.map((order) => [order.order.id, order]));
  const sideWeights = {
    buy: totalWeight(preciseOrders.filter((order) => order.order.side === "buy")),
    sell: totalWeight(preciseOrders.filter((order) => order.order.side === "sell")),
  };
  const sideTotal = sideWeights.buy + sideWeights.sell;
  const samples = new Map<number, WeightedCancellationOrder>();

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const side = Math.random() * sideTotal < sideWeights.buy ? "buy" : "sell";
    const selectedOrder = sampleStateCancellation(side);
    if (!selectedOrder) continue;

    const precise = preciseById.get(selectedOrder.id);
    if (!precise) continue;

    const existing = samples.get(selectedOrder.id);
    if (existing) {
      existing.weight += 1;
      continue;
    }

    samples.set(selectedOrder.id, { ...precise, weight: 1 });
  }

  return [...samples.values()];
};

export const totalWeight = (orders: WeightedCancellationOrder[]): number =>
  orders.reduce((total, order) => total + order.weight, 0);

const totalVariationDistance = (
  preciseOrders: WeightedCancellationOrder[],
  approximateOrders: WeightedCancellationOrder[],
): number => {
  const preciseTotal = totalWeight(preciseOrders);
  const approximateTotal = totalWeight(approximateOrders);
  if (
    !Number.isFinite(preciseTotal) ||
    !Number.isFinite(approximateTotal) ||
    preciseTotal <= 0 ||
    approximateTotal <= 0
  ) {
    return 1;
  }

  const approximateProbability = new Map(
    approximateOrders.map((order) => [order.order.id, order.weight / approximateTotal]),
  );

  return (
    preciseOrders.reduce((distance, order) => {
      const precise = order.weight / preciseTotal;
      const approximate = approximateProbability.get(order.order.id) ?? 0;

      return distance + Math.abs(precise - approximate);
    }, 0) / 2
  );
};

const measureFeatures = (
  selectionWeights: WeightedCancellationOrder[],
  preciseOrders: WeightedCancellationOrder[],
): SamplingFeatures => {
  const preciseById = new Map(preciseOrders.map((order) => [order.order.id, order]));
  const total = totalWeight(selectionWeights);
  if (!Number.isFinite(total) || total <= 0) {
    return {
      averageAge: 0,
      averageDistanceFromMid: 0,
      averageLocalVolume: 0,
      fractionBuy: 0,
      fractionSell: 0,
      fractionFar: 0,
      averageTrueWeight: 0,
      averageCancellationPriceDistance: 0,
    };
  }

  const features: SamplingFeatures = {
    averageAge: 0,
    averageDistanceFromMid: 0,
    averageLocalVolume: 0,
    fractionBuy: 0,
    fractionSell: 0,
    fractionFar: 0,
    averageTrueWeight: 0,
    averageCancellationPriceDistance: 0,
  };

  for (const selection of selectionWeights) {
    const precise = preciseById.get(selection.order.id);
    if (!precise) continue;

    const probability = selection.weight / total;

    features.averageAge += probability * precise.features.age;
    features.averageDistanceFromMid += probability * precise.features.distanceFromMid;
    features.averageLocalVolume += probability * precise.features.localVolume;
    features.fractionBuy += probability * (precise.order.side === "buy" ? 1 : 0);
    features.fractionSell += probability * (precise.order.side === "sell" ? 1 : 0);
    features.fractionFar += probability * (precise.features.isFar ? 1 : 0);
    features.averageTrueWeight += probability * precise.weight;
    features.averageCancellationPriceDistance += probability * precise.features.cancellationPriceDistance;
  }

  return features;
};

const relativeError = (actual: number, expected: number): number => {
  if (!Number.isFinite(actual) && !Number.isFinite(expected)) return 0;
  if (!Number.isFinite(actual)) return Number.MAX_SAFE_INTEGER;
  if (!Number.isFinite(expected)) return Math.abs(actual);
  if (expected === 0) return Math.abs(actual);

  return Math.abs((actual - expected) / expected);
};

const featureRelativeErrors = (
  precise: SamplingFeatures,
  approximate: SamplingFeatures,
): Record<keyof SamplingFeatures, number> => ({
  averageAge: relativeError(approximate.averageAge, precise.averageAge),
  averageDistanceFromMid: relativeError(approximate.averageDistanceFromMid, precise.averageDistanceFromMid),
  averageLocalVolume: relativeError(approximate.averageLocalVolume, precise.averageLocalVolume),
  fractionBuy: relativeError(approximate.fractionBuy, precise.fractionBuy),
  fractionSell: relativeError(approximate.fractionSell, precise.fractionSell),
  fractionFar: relativeError(approximate.fractionFar, precise.fractionFar),
  averageTrueWeight: relativeError(approximate.averageTrueWeight, precise.averageTrueWeight),
  averageCancellationPriceDistance: relativeError(
    approximate.averageCancellationPriceDistance,
    precise.averageCancellationPriceDistance,
  ),
});

export const compareSamplers = (
  preciseOrders: WeightedCancellationOrder[],
  approximateOrders: WeightedCancellationOrder[],
): {
  totalVariationDistance: number;
  featureErrors: Record<keyof SamplingFeatures, number>;
} => {
  const preciseFeatures = measureFeatures(preciseOrders, preciseOrders);
  const approximateFeatures = measureFeatures(approximateOrders, preciseOrders);

  return {
    totalVariationDistance: totalVariationDistance(preciseOrders, approximateOrders),
    featureErrors: featureRelativeErrors(preciseFeatures, approximateFeatures),
  };
};

export const indexApproximateWeights = (orders: WeightedCancellationOrder[]): WeightedCancellationOrder[] =>
  orders.map((order, index) => ({
    ...order,
    index,
    weight: index + 1,
  }));

export const empiricalSampleWeights = (
  orders: WeightedCancellationOrder[],
  sampleCount: number,
): WeightedCancellationOrder[] => {
  const samples = new Map<number, WeightedCancellationOrder>();
  const sampleOrder = createWeightedSampler(orders);

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const selected = sampleOrder();
    if (!selected) continue;

    const existing = samples.get(selected.order.id);

    if (existing) {
      existing.weight += 1;
      continue;
    }

    samples.set(selected.order.id, { ...selected, weight: 1 });
  }

  return [...samples.values()];
};

const createWeightedSampler = <T extends { weight: number }>(orders: T[]): (() => T | null) => {
  const cumulativeWeights: number[] = [];
  let total = 0;

  for (const order of orders) {
    if (!Number.isFinite(order.weight) || order.weight <= 0) {
      cumulativeWeights.push(total);
      continue;
    }

    total += order.weight;
    cumulativeWeights.push(total);
  }

  return () => {
    if (!Number.isFinite(total) || total <= 0) return null;

    const target = Math.random() * total;
    const index = binarySearchIndex(cumulativeWeights, (weight) => (weight <= target ? -1 : 1));

    return orders[index] ?? null;
  };
};

const createUniformSampler = <T>(items: T[]): (() => T | null) => {
  return () => {
    if (items.length === 0) return null;

    return items[Math.floor(Math.random() * items.length)] ?? null;
  };
};

const sampleWeightedList = (orders: WeightedCancellationOrder[]): WeightedCancellationOrder | null => {
  const total = totalWeight(orders);
  if (!Number.isFinite(total) || total <= 0) return null;

  const target = Math.random() * total;
  let cumulative = 0;

  for (const order of orders) {
    cumulative += order.weight;
    if (cumulative > target) return order;
  }

  return orders[orders.length - 1] ?? null;
};
