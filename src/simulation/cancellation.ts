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
import { sampleUniform } from "../distributions";
import { time } from "./time";

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
type CancellationAgeMemo = Record<OrderSide, { count: number; totalCreatedAt: number }>;

type ApproximateCancellationSamplingOptions = {
  candidateCount?: number;
  minimumProposalAge?: number;
  proposal?: "age" | "exact" | "uniform";
};

type ApproximateCancellationResamplingOptions = ApproximateCancellationSamplingOptions & {
  sampleCount?: number;
};

type ApproximateCancellationSamplingDiagnostics = {
  candidateCount: number;
  uniqueCandidateCount: number;
  candidateCoverage: number;
  effectiveSampleSize: number;
  minWeightRatio: number;
  maxWeightRatio: number;
  weightRatioSpread: number;
};

type WeightedCancellationCandidate = WeightedCancellationOrder & {
  proposalProbability: number;
  weightRatio: number;
};

type AgeProposal = {
  order: RestingOrder;
  index: number;
  proposalWeight: number;
};

type AgeProposalSampler = {
  totalWeight: number;
  sample: () => AgeProposal | null;
};

type CancellationCoverageLookup = {
  totalWeight: number;
  weightByOrderId: Map<number, number>;
};

const approximateCancellationSampleDefaults = {
  candidateCount: 64,
  minimumProposalAge: 0,
  proposal: "age",
  sampleCount: 4096,
} as const;

const defaultCancellationWeightEnvironment: CancellationWeightEnvironment = {
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
  // const localVolumeWeight = 1 - Math.exp(-localVolumeValue / options.localVolume.ramp());
  const localVolumeWeight = localVolumeValue;

  const age = time() - order.createdAt;
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
};;

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

const getAgeProposalWeight = (order: RestingOrder, minimumProposalAge: number, now = time()): number =>
  Math.max(minimumProposalAge, now - order.createdAt);

const getAgeProposalTotalWeight = (
  orders: RestingOrder[],
  minimumProposalAge: number,
  proposal: "age" | "exact" | "uniform",
  options: CancellationOptions,
  environment: CancellationWeightEnvironment,
  memo?: { count: number; totalCreatedAt: number },
  now = time(),
): number => {
  if (proposal === "uniform") return orders.length;
  if (proposal === "exact")
    return orders.reduce(
      (total, order) =>
        total + getCancellationOrderWeightFromFeatures(getCancellationOrderFeatures(order, options, environment), options),
      0,
    );
  if (minimumProposalAge <= 0 && memo) return Math.max(0, memo.count * now - memo.totalCreatedAt);

  return orders.reduce((total, order) => total + getAgeProposalWeight(order, minimumProposalAge, now), 0);
};

const getProposalWeight = (
  order: RestingOrder,
  minimumProposalAge: number,
  proposal: "age" | "exact" | "uniform",
  options: CancellationOptions,
  environment: CancellationWeightEnvironment,
  now = time(),
): number => {
  if (proposal === "uniform") return 1;
  if (proposal === "exact")
    return getCancellationOrderWeightFromFeatures(getCancellationOrderFeatures(order, options, environment), options);

  return getAgeProposalWeight(order, minimumProposalAge, now);
};

const createAgeProposalSampler = (
  orders: RestingOrder[],
  minimumProposalAge: number,
  proposal: "age" | "exact" | "uniform",
  options: CancellationOptions,
  environment: CancellationWeightEnvironment,
  memo?: { count: number; totalCreatedAt: number },
): AgeProposalSampler => {
  const now = time();
  const cumulativeWeights: number[] = [];
  const proposalWeights: number[] = [];
  let cumulativeWeight = 0;

  for (const order of orders) {
    const proposalWeight = getProposalWeight(order, minimumProposalAge, proposal, options, environment, now);
    proposalWeights.push(proposalWeight);
    cumulativeWeight += proposalWeight;
    cumulativeWeights.push(cumulativeWeight);
  }

  const totalWeight = getAgeProposalTotalWeight(orders, minimumProposalAge, proposal, options, environment, memo, now);

  return {
    totalWeight,
    sample: () => {
      if (orders.length === 0 || totalWeight <= 0) return null;

      const targetWeight = sampleUniform(0, totalWeight);
      let left = 0;
      let right = cumulativeWeights.length - 1;

      while (left < right) {
        const mid = Math.floor((left + right) / 2);

        if ((cumulativeWeights[mid] ?? 0) >= targetWeight) right = mid;
        else left = mid + 1;
      }

      const order = orders[left];
      const proposalWeight = proposalWeights[left];

      return order && proposalWeight !== undefined ? { order, index: left, proposalWeight } : null;
    },
  };
};

const getNormalizedApproximateSamplingOptions = (
  samplingOptions: ApproximateCancellationSamplingOptions,
): Required<ApproximateCancellationSamplingOptions> => {
  const proposal = samplingOptions.proposal ?? approximateCancellationSampleDefaults.proposal;

  return {
    candidateCount: Math.max(
      1,
      Math.floor(samplingOptions.candidateCount ?? approximateCancellationSampleDefaults.candidateCount),
    ),
    minimumProposalAge: Math.max(
      0,
      samplingOptions.minimumProposalAge ?? approximateCancellationSampleDefaults.minimumProposalAge,
    ),
    proposal: proposal === "uniform" || proposal === "exact" ? proposal : "age",
  };
};

const getApproximateWeightedCancellationOrdersFromProposal = (
  proposalSampler: AgeProposalSampler,
  orderCount: number,
  options: CancellationOptions,
  candidateCount: number,
  environment: CancellationWeightEnvironment,
): WeightedCancellationOrder[] => {
  const candidates = new Map<number, WeightedCancellationCandidate>();

  for (let sample = 0; sample < candidateCount; sample += 1) {
    const proposal = proposalSampler.sample();
    if (!proposal) break;

    if (candidates.has(proposal.order.id)) continue;

    const proposalProbability = proposal.proposalWeight / proposalSampler.totalWeight;

    const features = getCancellationOrderFeatures(proposal.order, options, environment);
    const targetWeight = getCancellationOrderWeightFromFeatures(features, options);
    const weightRatio = targetWeight / proposalProbability;

    candidates.set(proposal.order.id, {
      order: proposal.order,
      index: proposal.index,
      features,
      weight: weightRatio,
      proposalProbability,
      weightRatio,
    });
  }

  return [...candidates.values()].slice(0, orderCount);
};

const getCancellationCoverageLookup = (
  sourceOrders: RestingOrder[],
  options: CancellationOptions,
  environment: CancellationWeightEnvironment,
): CancellationCoverageLookup => {
  const sourceWeightedOrders = getWeightedCancellationOrders(sourceOrders, options, environment);

  return {
    totalWeight: sourceWeightedOrders.reduce((total, order) => total + order.weight, 0),
    weightByOrderId: new Map(sourceWeightedOrders.map((order) => [order.order.id, order.weight])),
  };
};

const getExactWeightCoverage = (
  coveredOrders: WeightedCancellationOrder[],
  coverageLookup: CancellationCoverageLookup,
): number => {
  if (coverageLookup.totalWeight <= 0) return 0;

  const coveredOrderIds = new Set(coveredOrders.map((order) => order.order.id));
  let coveredWeight = 0;

  for (const orderId of coveredOrderIds) {
    coveredWeight += coverageLookup.weightByOrderId.get(orderId) ?? 0;
  }

  return coveredWeight / coverageLookup.totalWeight;
};

const getApproximateSamplingDiagnostics = (
  approximateOrders: WeightedCancellationOrder[],
  coverageLookup: CancellationCoverageLookup,
  candidateCount: number,
  candidateCoverage = getExactWeightCoverage(approximateOrders, coverageLookup),
): ApproximateCancellationSamplingDiagnostics => {
  const totalWeight = approximateOrders.reduce((total, order) => total + order.weight, 0);
  const sumSquaredWeights = approximateOrders.reduce((total, order) => total + order.weight ** 2, 0);
  const weights = approximateOrders.map((order) => order.weight);
  const minWeight = weights.length > 0 ? Math.min(...weights) : 0;
  const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;

  return {
    candidateCount,
    uniqueCandidateCount: approximateOrders.length,
    candidateCoverage,
    effectiveSampleSize: sumSquaredWeights > 0 ? totalWeight ** 2 / sumSquaredWeights : 0,
    minWeightRatio: minWeight,
    maxWeightRatio: maxWeight,
    weightRatioSpread: minWeight > 0 ? maxWeight / minWeight : Number.POSITIVE_INFINITY,
  };
};

export const getApproximateWeightedCancellationOrders = (
  orders: RestingOrder[],
  options: CancellationOptions,
  samplingOptions: ApproximateCancellationSamplingOptions = {},
  environment = defaultCancellationWeightEnvironment,
  ageMemo?: { count: number; totalCreatedAt: number },
): {
  orders: WeightedCancellationOrder[];
  diagnostics: ApproximateCancellationSamplingDiagnostics;
} => {
  const { candidateCount, minimumProposalAge, proposal } = getNormalizedApproximateSamplingOptions(samplingOptions);
  const proposalSampler = createAgeProposalSampler(orders, minimumProposalAge, proposal, options, environment, ageMemo);
  const coverageLookup = getCancellationCoverageLookup(orders, options, environment);
  const approximateOrders = getApproximateWeightedCancellationOrdersFromProposal(
    proposalSampler,
    orders.length,
    options,
    candidateCount,
    environment,
  );

  return {
    orders: approximateOrders,
    diagnostics: getApproximateSamplingDiagnostics(approximateOrders, coverageLookup, candidateCount),
  };
};

export const getResampledApproximateWeightedCancellationOrders = (
  orders: RestingOrder[],
  options: CancellationOptions,
  samplingOptions: ApproximateCancellationResamplingOptions = {},
  environment = defaultCancellationWeightEnvironment,
  ageMemo?: { count: number; totalCreatedAt: number },
): {
  orders: WeightedCancellationOrder[];
  diagnostics: ApproximateCancellationSamplingDiagnostics & { sampleCount: number };
} => {
  const { candidateCount, minimumProposalAge, proposal } = getNormalizedApproximateSamplingOptions(samplingOptions);
  const sampleCount = Math.max(
    1,
    Math.floor(samplingOptions.sampleCount ?? approximateCancellationSampleDefaults.sampleCount),
  );
  const proposalSampler = createAgeProposalSampler(orders, minimumProposalAge, proposal, options, environment, ageMemo);
  const coverageLookup = getCancellationCoverageLookup(orders, options, environment);
  const samples = new Map<number, WeightedCancellationOrder>();
  let totalCandidateCoverage = 0;
  let candidateRefreshes = 0;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const candidates = getApproximateWeightedCancellationOrdersFromProposal(
      proposalSampler,
      orders.length,
      options,
      candidateCount,
      environment,
    );
    totalCandidateCoverage += getExactWeightCoverage(candidates, coverageLookup);
    candidateRefreshes += 1;

    const selected = sampleWeightedList(candidates);
    if (!selected) continue;

    const existing = samples.get(selected.order.id);

    if (existing) {
      existing.weight += 1;
      continue;
    }

    samples.set(selected.order.id, { ...selected, weight: 1 });
  }

  const approximateOrders = [...samples.values()];

  return {
    orders: approximateOrders,
    diagnostics: {
      ...getApproximateSamplingDiagnostics(
        approximateOrders,
        coverageLookup,
        candidateCount,
        candidateRefreshes > 0 ? totalCandidateCoverage / candidateRefreshes : 0,
      ),
      sampleCount,
    },
  };
};

const sampleApproximateCancellationOrder = (
  orders: RestingOrder[],
  options: CancellationOptions,
  samplingOptions: ApproximateCancellationSamplingOptions = {},
  ageMemo?: { count: number; totalCreatedAt: number },
): RestingOrder | null =>
  sampleWeightedList(
    getApproximateWeightedCancellationOrders(orders, options, samplingOptions, undefined, ageMemo).orders,
  )?.order ?? null;

const createSampler = () => {};

export const createCancellationState = (options: CancellationOptions) => {
  const [restingOrders, setRestingOrders] = createSignal<RestingOrders>({ buy: [], sell: [] });
  const ageMemo: CancellationAgeMemo = {
    buy: { count: 0, totalCreatedAt: 0 },
    sell: { count: 0, totalCreatedAt: 0 },
  };

  const addOrderToAgeMemo = (order: RestingOrder): void => {
    ageMemo[order.side].count += 1;
    ageMemo[order.side].totalCreatedAt += order.createdAt;
  };

  const removeOrderFromAgeMemo = (order: RestingOrder): void => {
    ageMemo[order.side].count = Math.max(0, ageMemo[order.side].count - 1);
    ageMemo[order.side].totalCreatedAt -= order.createdAt;
  };

  createEffect(() => {
    const latest = latestOrderBookChange();
    const removed = latest.changes.filter((change) => change.kind === "remove");
    const partialFilled = latest.changes.filter((change) => change.kind === "partial-fill");

    setRestingOrders((orders) => {
      let didChange = false;
      const updatedOrders = (orders: RestingOrder[]) => {
        return orders
          .filter((order) => {
            const shouldRemove = removed.some((change) => change.order.id === order.id);
            didChange = didChange || shouldRemove;
            if (shouldRemove) removeOrderFromAgeMemo(order);
            return !shouldRemove;
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
    return sampleApproximateCancellationOrder(restingOrders()[side], options, undefined, ageMemo[side]);
  };

  const removeRestingOrder = (id: number) => {
    setRestingOrders((orders) => {
      const removedOrder = orders.buy.find((order) => order.id === id) ?? orders.sell.find((order) => order.id === id);
      if (removedOrder) removeOrderFromAgeMemo(removedOrder);

      return {
        buy: orders.buy.filter((order) => order.id !== id),
        sell: orders.sell.filter((order) => order.id !== id),
      };
    });
  };

  const simulate = (side: OrderSide) => {
    const order = randomRestingOrder(side);
    if (!order) return false;

    removeRestingOrder(order.id);
    return cancelOrder(order.id, order.side) !== null;
  };

  const addOrder = (order: RestingOrder): void => {
    // todo: binary search insert?
    addOrderToAgeMemo(order);
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

  return {
    simulate,
    addOrder,
    getRestingOrders,
  };
};
