import { expect, vi } from "vitest";
import type { CancellationOptions, WeightedCancellationOrder } from "../src/simulation/cancellation";
import type { MarketBehaviorSettings, RestingOrder, SimulationEventType } from "../src/simulation/types";
import { sampleWeightedList } from "../src/sampling";

type CancellationModule = typeof import("../src/simulation/cancellation");

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
  settings: MarketBehaviorSettings,
  weights = {
    age: 0.000_001,
    priceMovement: 0.5,
    localVolume: 0.5,
    farOrder: 0.5,
  },
): CancellationOptions => ({
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
  cancellation: CancellationModule;
  options: CancellationOptions;
  orders: RestingOrder[];
}> => {
  vi.restoreAllMocks();
  vi.resetModules();
  vi.spyOn(Math, "random").mockImplementation(seededRandom(fixtureOptions.seed ?? 0x5eed));

  const [{ TradingSimulation }, cancellation, { advance }] = await Promise.all([
    import("../src/simulation/index"),
    import("../src/simulation/cancellation"),
    import("../src/simulation/time"),
  ]);
  const simulation = new TradingSimulation();

  for (let tick = 0; tick < fixtureOptions.ticks; tick += 1) {
    simulation.tick(250);
  }

  const settings = simulation.getMarketBehaviorSettings();
  advance(settings.cancellationFarOrderMinAge + 1_000);

  const orders = sides.flatMap((side) => simulation.getCancellationRestingOrders(side));
  expect(orders.length).toBeGreaterThan(20);
  expect(orders.some((order) => order.side === "buy")).toBe(true);
  expect(orders.some((order) => order.side === "sell")).toBe(true);

  return {
    cancellation,
    options: createCancellationOptions(settings),
    orders,
  };
};

export const totalWeight = (orders: WeightedCancellationOrder[]): number =>
  orders.reduce((total, order) => total + order.weight, 0);

const totalVariationDistance = (
  preciseOrders: WeightedCancellationOrder[],
  approximateOrders: WeightedCancellationOrder[],
): number => {
  const preciseTotal = totalWeight(preciseOrders);
  const approximateTotal = totalWeight(approximateOrders);
  if (!Number.isFinite(preciseTotal) || !Number.isFinite(approximateTotal) || preciseTotal <= 0 || approximateTotal <= 0) {
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

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const selected = sampleWeightedList(orders);
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
