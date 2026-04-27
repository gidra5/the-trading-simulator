import { cancelOrder, getOrderBookHistogram, hasOrder, makeOrder, marketPriceSpread, type OrderSide, takeOrder } from "./market";
import {
  sampleBernoulli,
  sampleExponential,
  sampleLogNormal,
  sampleMultivariateHawkesProcessEventTimes,
  sampleNormal,
  samplePowerLaw,
  sampleUniform,
  sampleUniformInteger,
} from "./distributions";
import { assert, clamp, halfLifeToDecay, positiveFiniteOrZero } from "./utils";

export type OrderSizeDistribution = "uniform" | "log-normal" | "power-law" | "exponential";
export type OrderPriceDistribution = "uniform" | "abs-normal" | "log-normal" | "power-law" | "exponential";

const tickTime = 200;

const simulationEventTypes = [
  "market-buy",
  "market-sell",
  "order-buy",
  "order-sell",
  "cancel-buy",
  "cancel-sell",
] as const;
type SimulationEventType = (typeof simulationEventTypes)[number];
type SimulationEventVector = Record<SimulationEventType, number>;
type SimulationExcitationMatrix = Record<SimulationEventType, SimulationEventVector>;
export type MarketBehaviorSettings = {
  publicInterestRate: number;
  patience: number;
  greed: number;
  fear: number;
  excitementHalfLife: SimulationEventVector;
  branchingRatio: SimulationEventVector;
  reflexivity: number;
  contrarianism: number;
  passiveMirroring: number;
  liquidityChasing: number;
  liquidityFading: number;
  adverseSelection: number;
  orderCrowding: number;
  passiveAdverseSelection: number;
  cancelCrowding: number;
  bookRebalancing: number;
  cancelPanic: number;
  orderSpread: number;
  orderPriceTail: number;
  inSpreadOrderProbability: number;
  orderSizeScale: number;
  orderSizeTail: number;
  anchorPreference: number;
  liquidityWallAnchorPreference: number;
  liquidityWallAnchorRange: number;
  liquidityWallHistogramResolution: number;
  roundPricePreference: number;
  roundPriceAnchorMinMidDistance: number;
  cancellationPriceMovementWindow: number;
  cancellationNearTouchDistance: number;
  cancellationPriceMovementBoost: number;
  cancellationPriceMovementOrderDecay: number;
  cancellationLocalVolumeWindow: number;
  cancellationFarOrderWindow: number;
  cancellationFarOrderRamp: number;
  cancellationFarOrderMinAge: number;
};

const eventVector = (vector: SimulationEventVector): number[] =>
  simulationEventTypes.map((eventType) => vector[eventType]);

const eventExcitationMatrix = (matrix: SimulationExcitationMatrix): number[][] =>
  simulationEventTypes.map((eventType) => eventVector(matrix[eventType]));

const normalizeExcitationMatrix = (
  rawMatrix: number[][],
  decay: number[],
  targetBranchingRatio: number[],
): number[][] =>
  rawMatrix.map((row, sourceIndex) => {
    const rawBranchingRatio = row.reduce((total, excitation, targetIndex) => {
      const targetDecay = positiveFiniteOrZero(decay[targetIndex] ?? 0);

      return targetDecay > 0 ? total + positiveFiniteOrZero(excitation) / targetDecay : total;
    }, 0);
    const targetRatio = positiveFiniteOrZero(targetBranchingRatio[sourceIndex] ?? 0);
    const scale = rawBranchingRatio > 0 ? targetRatio / rawBranchingRatio : 0;

    return row.map((excitation) => positiveFiniteOrZero(excitation) * scale);
  });

export const defaultMarketBehaviorSettings: MarketBehaviorSettings = {
  publicInterestRate: 200, // total event rate per second before self-excitation
  patience: 0.9, // probability of placing an order instead of canceling
  greed: 0.3, // market order prob
  fear: 0.5, // sell order prob
  excitementHalfLife: {
    "market-buy": 0.2,
    "market-sell": 0.2,
    "order-buy": 1,
    "order-sell": 1,
    "cancel-buy": 0.05,
    "cancel-sell": 0.05,
  }, // seconds until extra interest halves
  branchingRatio: {
    "market-buy": 1,
    "market-sell": 1,
    "order-buy": 0.15,
    "order-sell": 0.15,
    "cancel-buy": 0.25,
    "cancel-sell": 0.25,
  }, // expected total child events caused by one event
  reflexivity: 1, // same event excites same event
  contrarianism: 0.12, // buy excites sell, sell excites buy
  passiveMirroring: 0.2, // limit buy excites limit sell, and vice versa
  liquidityChasing: 0.25, // market events excite same-side limit orders
  liquidityFading: 0.15, // market events excite same-side cancels
  adverseSelection: 0.1, // market buys pull asks, market sells pull bids
  orderCrowding: 0.3, // limit orders excite same-side limit orders
  passiveAdverseSelection: 0.05, // limit orders can make same-side liquidity pull back
  cancelCrowding: 0.8, // cancels excite same-side cancels
  bookRebalancing: 0.1, // cancels excite opposite-side limit orders
  cancelPanic: 0.05, // cancels can trigger opposite-side market pressure
  orderSpread: 0.15, // mean maker price distance percent
  orderPriceTail: 0.1, // distance dispersion: higher = more tiny and far orders
  inSpreadOrderProbability: 0.5,
  orderSizeScale: 100, // mean order size
  orderSizeTail: 0.8, // size dispersion: higher = more tiny and huge orders
  anchorPreference: 0.35,
  liquidityWallAnchorPreference: 0.2,
  liquidityWallAnchorRange: 0.001,
  liquidityWallHistogramResolution: 64,
  roundPricePreference: 0.45,
  roundPriceAnchorMinMidDistance: 0.005,
  cancellationPriceMovementWindow: 5_000,
  cancellationNearTouchDistance: 0.005,
  cancellationPriceMovementBoost: 4,
  cancellationPriceMovementOrderDecay: 5_000,
  cancellationLocalVolumeWindow: 0.001,
  cancellationFarOrderWindow: 0.15,
  cancellationFarOrderRamp: 0.15,
  cancellationFarOrderMinAge: 60_000,
};
let marketBehaviorSettings: MarketBehaviorSettings = {
  ...defaultMarketBehaviorSettings,
  excitementHalfLife: { ...defaultMarketBehaviorSettings.excitementHalfLife },
  branchingRatio: { ...defaultMarketBehaviorSettings.branchingRatio },
};

export const getMarketBehaviorSettings = (): MarketBehaviorSettings => ({
  ...marketBehaviorSettings,
  excitementHalfLife: { ...marketBehaviorSettings.excitementHalfLife },
  branchingRatio: { ...marketBehaviorSettings.branchingRatio },
});

export const setMarketBehaviorSetting = <Key extends keyof MarketBehaviorSettings>(
  key: Key,
  value: MarketBehaviorSettings[Key],
): void => {
  marketBehaviorSettings = { ...marketBehaviorSettings, [key]: value };
};

export const setMarketBehaviorEventSetting = (
  group: "excitementHalfLife" | "branchingRatio",
  eventType: SimulationEventType,
  value: number,
): void => {
  marketBehaviorSettings = {
    ...marketBehaviorSettings,
    [group]: { ...marketBehaviorSettings[group], [eventType]: value },
  };
};

const publicInterestVector = (): number[] => {
  const { publicInterestRate, patience, greed, fear } = marketBehaviorSettings;
  const marketPressure = patience * greed;
  const orderPressure = patience * (1 - greed);
  const cancelPressure = 1 - patience;

  return eventVector({
    "market-buy": marketPressure * (1 - fear),
    "market-sell": marketPressure * fear,
    "order-buy": orderPressure * (1 - fear),
    "order-sell": orderPressure * fear,
    "cancel-buy": cancelPressure * (1 - fear),
    "cancel-sell": cancelPressure * fear,
  }).map((v) => publicInterestRate * v); // event rates per second before self-excitation
};

const excitementDecayVector = (): number[] => eventVector(marketBehaviorSettings.excitementHalfLife).map(halfLifeToDecay);

const excitationMatrix = (): number[][] => {
  const {
    fear,
    reflexivity,
    contrarianism,
    passiveMirroring,
    liquidityChasing,
    liquidityFading,
    adverseSelection,
    orderCrowding,
    passiveAdverseSelection,
    cancelCrowding,
    bookRebalancing,
    cancelPanic,
  } = marketBehaviorSettings;

  return eventExcitationMatrix({
  "market-buy": {
    "market-buy": reflexivity * (1 - fear),
    "market-sell": contrarianism * fear,
    "order-buy": liquidityChasing * (1 - fear),
    "order-sell": passiveMirroring * fear,
    "cancel-buy": liquidityFading * (1 - fear),
    "cancel-sell": adverseSelection * fear,
  },
  "market-sell": {
    "market-buy": contrarianism * (1 - fear),
    "market-sell": reflexivity * fear,
    "order-buy": passiveMirroring * (1 - fear),
    "order-sell": liquidityChasing * fear,
    "cancel-buy": adverseSelection * (1 - fear),
    "cancel-sell": liquidityFading * fear,
  },
  "order-buy": {
    "market-buy": reflexivity * (1 - fear),
    "market-sell": contrarianism * fear,
    "order-buy": orderCrowding * (1 - fear),
    "order-sell": passiveMirroring * fear,
    "cancel-buy": passiveAdverseSelection * (1 - fear),
    "cancel-sell": adverseSelection * fear,
  },
  "order-sell": {
    "market-buy": contrarianism * (1 - fear),
    "market-sell": reflexivity * fear,
    "order-buy": passiveMirroring * (1 - fear),
    "order-sell": orderCrowding * fear,
    "cancel-buy": adverseSelection * (1 - fear),
    "cancel-sell": passiveAdverseSelection * fear,
  },
  "cancel-buy": {
    "market-buy": contrarianism * (1 - fear),
    "market-sell": cancelPanic * fear,
    "order-buy": reflexivity * (1 - fear),
    "order-sell": bookRebalancing * fear,
    "cancel-buy": cancelCrowding * (1 - fear),
    "cancel-sell": passiveMirroring * fear,
  },
  "cancel-sell": {
    "market-buy": cancelPanic * (1 - fear),
    "market-sell": contrarianism * fear,
    "order-buy": bookRebalancing * (1 - fear),
    "order-sell": reflexivity * fear,
    "cancel-buy": passiveMirroring * (1 - fear),
    "cancel-sell": cancelCrowding * fear,
  },
  }); // row event adds rates to column events before branching-ratio scaling
};

const interestExcitationMatrix = (decay: number[]): number[][] =>
  normalizeExcitationMatrix(excitationMatrix(), decay, eventVector(marketBehaviorSettings.branchingRatio));
const priceAnchorIntervals = [60_000, 600_000, 1_800_000, 3_600_000] as const;

let orderPriceDistribution: OrderPriceDistribution = "power-law";
let orderSizeDistribution: OrderSizeDistribution = "power-law";
let cancellationTimeWeighting = 0.5;
let cancellationPriceMovementWeighting = 0.5;
let cancellationLocalVolumeWeighting = 0.5;
let cancellationFarOrderWeighting = 0.5;

export const setOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
  orderPriceDistribution = distribution;
};

export const getOrderPriceDistribution = (): OrderPriceDistribution => orderPriceDistribution;

export const setOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
  orderSizeDistribution = distribution;
};

export const getOrderSizeDistribution = (): OrderSizeDistribution => orderSizeDistribution;

export const setCancellationTimeWeighting = (weighting: number): void => {
  cancellationTimeWeighting = clamp(weighting, 0, 1);
};

export const setCancellationPriceMovementWeighting = (weighting: number): void => {
  cancellationPriceMovementWeighting = clamp(weighting, 0, 1);
};

export const setCancellationLocalVolumeWeighting = (weighting: number): void => {
  cancellationLocalVolumeWeighting = clamp(weighting, 0, 1);
};

export const setCancellationFarOrderWeighting = (weighting: number): void => {
  cancellationFarOrderWeighting = clamp(weighting, 0, 1);
};

type RestingOrder = {
  id: number;
  side: OrderSide;
  price: number;
  size: number;
  createdAt: number;
};
type PricePoint = {
  time: number;
  price: number;
};
type PriceAnchorWindow = {
  durationMs: number;
  highs: PricePoint[];
  lows: PricePoint[];
  highOffset: number;
  lowOffset: number;
};

const restingOrders: RestingOrder[] = [];
const touchPriceHistory: Record<OrderSide, PricePoint[]> = {
  buy: [],
  sell: [],
};
const priceAnchorWindows: PriceAnchorWindow[] = priceAnchorIntervals.map((durationMs) => ({
  durationMs,
  highs: [],
  lows: [],
  highOffset: 0,
  lowOffset: 0,
}));

let excitedInterest = eventVector({
  "market-buy": 0,
  "market-sell": 0,
  "order-buy": 0,
  "order-sell": 0,
  "cancel-buy": 0,
  "cancel-sell": 0,
});

const sampleOrderDistance = (distribution: OrderPriceDistribution, scale: number, tail: number): number => {
  switch (distribution) {
    case "uniform":
      return sampleUniform(0, scale * 2);
    case "abs-normal":
      return Math.abs(sampleNormal(0, scale));
    case "log-normal":
      return sampleLogNormal(scale, tail);
    case "power-law":
      return scale * samplePowerLaw(tail);
    case "exponential":
      return sampleExponential(scale);
  }
};

const inSpreadReach = -0.01;
const sampleInSpreadOrderPrice = (spread: ReturnType<typeof marketPriceSpread>): number | null => {
  const bestBid = spread.sell;
  const bestAsk = spread.buy;

  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= bestBid) return null;

  const padding = (bestAsk - bestBid) * inSpreadReach;
  const minPrice = bestBid + padding;
  const maxPrice = bestAsk - padding;

  return maxPrice > minPrice ? sampleUniform(minPrice, maxPrice) : (bestBid + bestAsk) / 2;
};

const sampleMakerOrderPrice = (side: OrderSide): number => {
  const spread = marketPriceSpread();
  const inSpreadPrice = sampleBernoulli(marketBehaviorSettings.inSpreadOrderProbability)
    ? sampleInSpreadOrderPrice(spread)
    : null;

  if (inSpreadPrice !== null) return inSpreadPrice;

  const bestPrice = spread[side];
  const jitter = sampleOrderDistance(
    orderPriceDistribution,
    marketBehaviorSettings.orderSpread,
    marketBehaviorSettings.orderPriceTail,
  );
  const direction = side === "buy" ? -1 : 1;
  return bestPrice * (1 + jitter) ** direction;
};

const roundPriceStep = (price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return 0;

  const magnitude = 10 ** Math.floor(Math.log10(price));
  const roll = Math.random();

  if (roll < 0.15) return magnitude * 0.1;
  if (roll < 0.45) return magnitude * 0.05;
  return magnitude * 0.01;
};

const isNearMidPrice = (price: number, spread: ReturnType<typeof marketPriceSpread>): boolean => {
  const midPrice = (spread.buy + spread.sell) / 2;

  if (!Number.isFinite(price) || !Number.isFinite(midPrice) || midPrice <= 0) return false;

  return Math.abs(price - midPrice) / midPrice <= marketBehaviorSettings.roundPriceAnchorMinMidDistance;
};

const compactPricePoints = (points: PricePoint[], offset: number): number => {
  if (offset < 64 || offset * 2 < points.length) return offset;

  points.splice(0, offset);
  return 0;
};

const updateRecentPriceAnchors = (spread = marketPriceSpread(), time = Date.now()): void => {
  const price = (spread.buy + spread.sell) / 2;

  if (!Number.isFinite(price) || price <= 0) return;

  for (const window of priceAnchorWindows) {
    const expiresBefore = time - window.durationMs;

    while (window.highOffset < window.highs.length && window.highs[window.highOffset]!.time < expiresBefore) {
      window.highOffset += 1;
    }

    while (window.lowOffset < window.lows.length && window.lows[window.lowOffset]!.time < expiresBefore) {
      window.lowOffset += 1;
    }

    while (window.highs.length > window.highOffset && window.highs[window.highs.length - 1]!.price <= price) {
      window.highs.pop();
    }

    while (window.lows.length > window.lowOffset && window.lows[window.lows.length - 1]!.price >= price) {
      window.lows.pop();
    }

    window.highs.push({ time, price });
    window.lows.push({ time, price });
    window.highOffset = compactPricePoints(window.highs, window.highOffset);
    window.lowOffset = compactPricePoints(window.lows, window.lowOffset);
  }
};

const updateTouchPriceHistory = (spread = marketPriceSpread(), time = Date.now()): void => {
  const expiresBefore = time - marketBehaviorSettings.cancellationPriceMovementWindow;

  for (const side of ["buy", "sell"] as const) {
    const price = spread[side];

    if (!Number.isFinite(price) || price <= 0) continue;

    const history = touchPriceHistory[side];
    history.push({ time, price });

    while (history.length > 1 && history[1]!.time <= expiresBefore) {
      history.shift();
    }
  }
};

const priceMovedAwayFromOrder = (order: RestingOrder, spread = marketPriceSpread()): boolean => {
  const currentTouch = spread[order.side];
  const previousTouch = touchPriceHistory[order.side][0]?.price;

  if (!Number.isFinite(currentTouch) || currentTouch <= 0 || !Number.isFinite(previousTouch) || previousTouch <= 0) {
    return false;
  }

  const currentDistance = Math.abs(currentTouch - order.price) / currentTouch;

  if (currentDistance > marketBehaviorSettings.cancellationNearTouchDistance) return false;

  const previousDistance = Math.abs(previousTouch - order.price) / previousTouch;

  return currentDistance > previousDistance;
};

const farOrderCancellationProbability = (
  order: RestingOrder,
  now = Date.now(),
  spread = marketPriceSpread(),
): number => {
  if (now - order.createdAt < marketBehaviorSettings.cancellationFarOrderMinAge) return 0;

  const midPrice = (spread.buy + spread.sell) / 2;

  if (!Number.isFinite(midPrice) || midPrice <= 0) return 0;

  const distance = Math.abs(order.price - midPrice) / midPrice;
  const excessDistance = distance - marketBehaviorSettings.cancellationFarOrderWindow;

  if (excessDistance <= 0) return 0;

  return 1 - Math.exp(-excessDistance / marketBehaviorSettings.cancellationFarOrderRamp);
};

const sampleRecentHighLowAnchor = (side: OrderSide): number | null => {
  const window = priceAnchorWindows[sampleUniformInteger(0, priceAnchorWindows.length)];

  if (!window) return null;

  const high = window.highs[window.highOffset]?.price;
  const low = window.lows[window.lowOffset]?.price;
  const preferSideAnchor = Math.random() < 0.7;
  const anchor = preferSideAnchor === (side === "buy") ? low : high;

  return Number.isFinite(anchor) && anchor > 0 ? anchor : null;
};

const sampleSupportResistanceAnchor = (
  side: OrderSide,
  candidatePrice: number,
  spread: ReturnType<typeof marketPriceSpread>,
): number | null => {
  const currentPrice = (spread.buy + spread.sell) / 2;

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(candidatePrice)) return null;

  const priceMin = Math.min(spread.buy, spread.sell, candidatePrice);
  const priceMax = Math.max(spread.buy, spread.sell, candidatePrice);
  const padding = Math.max((priceMax - priceMin) * 0.5, currentPrice * 0.05);
  const rangeMin = Math.max(Number.MIN_VALUE, priceMin - padding);
  const rangeMax = priceMax + padding;
  const cellHeight = (rangeMax - rangeMin) / marketBehaviorSettings.liquidityWallHistogramResolution;
  const histogram = getOrderBookHistogram({
    price: [rangeMin, rangeMax],
    resolution: marketBehaviorSettings.liquidityWallHistogramResolution,
  });
  let closestLevelPrice = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  const sizes = new Array<number>(marketBehaviorSettings.liquidityWallHistogramResolution).fill(0);
  let totalSize = 0;

  for (const entry of histogram) {
    if (entry.kind === side) {
      sizes[entry.y] = entry.size;
      totalSize += entry.size;
    }
  }

  const meanSize = totalSize / marketBehaviorSettings.liquidityWallHistogramResolution;

  for (let index = 0; index < histogram.length; index += 1) {
    const entry = histogram[index];

    if (!entry || entry.kind !== side || entry.size <= meanSize || entry.size <= 0) continue;

    const previousSize = sizes[entry.y - 1] ?? 0;
    const nextSize = sizes[entry.y + 1] ?? 0;

    if (entry.size < previousSize * 1.5 && entry.size < nextSize * 1.5) continue;

    const levelPrice = rangeMin + (entry.y + 0.5) * cellHeight;
    const isSupport = side === "buy" && levelPrice < currentPrice;
    const isResistance = side === "sell" && levelPrice > currentPrice;

    if (isSupport || isResistance) {
      const distance = Math.abs(levelPrice - candidatePrice);

      if (distance < closestDistance) {
        closestLevelPrice = levelPrice;
        closestDistance = distance;
      }
    }
  }

  if (closestDistance === Number.POSITIVE_INFINITY) return null;

  return side === "buy"
    ? closestLevelPrice * sampleUniform(1, 1 + marketBehaviorSettings.liquidityWallAnchorRange)
    : closestLevelPrice * sampleUniform(1 - marketBehaviorSettings.liquidityWallAnchorRange, 1);
};

const applyOrderPricePsychology = (side: OrderSide, price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return price;

  const spread = marketPriceSpread();
  updateRecentPriceAnchors(spread);

  let adjustedPrice = price;

  if (Math.random() < marketBehaviorSettings.anchorPreference) {
    const anchor = sampleRecentHighLowAnchor(side);

    if (anchor !== null) {
      adjustedPrice += (anchor - adjustedPrice) * sampleUniform(0.15, 0.6);
    }
  }

  if (Math.random() < marketBehaviorSettings.liquidityWallAnchorPreference) {
    const anchor = sampleSupportResistanceAnchor(side, adjustedPrice, spread);

    if (anchor !== null) {
      adjustedPrice = anchor;
    }
  }

  if (!isNearMidPrice(adjustedPrice, spread) && Math.random() < marketBehaviorSettings.roundPricePreference) {
    const step = roundPriceStep(adjustedPrice);

    if (step > 0) {
      adjustedPrice = Math.round(adjustedPrice / step) * step;
    }
  }

  return side === "buy" ? clamp(adjustedPrice, Number.MIN_VALUE, spread.buy) : Math.max(adjustedPrice, spread.sell);
};

const sampleOrderSize = () => {
  switch (orderSizeDistribution) {
    case "uniform":
      return sampleUniform(0, marketBehaviorSettings.orderSizeScale * 2);
    case "log-normal":
      return sampleLogNormal(marketBehaviorSettings.orderSizeScale, marketBehaviorSettings.orderSizeTail);
    case "power-law":
      return marketBehaviorSettings.orderSizeScale * samplePowerLaw(marketBehaviorSettings.orderSizeTail);
    case "exponential":
      return sampleExponential(marketBehaviorSettings.orderSizeScale);
  }
};

const trackRestingOrder = (order: RestingOrder): void => {
  restingOrders.push(order);
};

const removeRestingOrder = (index: number): RestingOrder => {
  const [order] = restingOrders.splice(index, 1);
  assert(order, "Expected tracked resting order to exist");

  return order;
};

const randomRestingOrder = (
  side: OrderSide,
  weightByAge = false,
  weightByPriceMovement = false,
  weightByLocalVolume = false,
  weightByFarOrder = false,
): {
  order: RestingOrder;
  index: number;
} | null => {
  for (let index = restingOrders.length - 1; index >= 0; index -= 1) {
    const order = restingOrders[index];

    if (!order || !hasOrder(order.id, order.side)) {
      removeRestingOrder(index);
    }
  }

  const candidates = restingOrders
    .map((order, index) => ({ order, index }))
    .filter((candidate) => candidate.order.side === side);

  if (candidates.length === 0) return null;

  const now = Date.now();
  const spread = marketPriceSpread();
  const localVolumeByCandidateIndex = new Map<number, number>();

  if (weightByLocalVolume) {
    const priceSortedCandidates = [...candidates].sort((left, right) => left.order.price - right.order.price);
    let leftIndex = 0;
    let rightIndex = 0;
    let localVolume = 0;

    for (let index = 0; index < priceSortedCandidates.length; index += 1) {
      const candidate = priceSortedCandidates[index]!;
      const minPrice = candidate.order.price * (1 - marketBehaviorSettings.cancellationLocalVolumeWindow);
      const maxPrice = candidate.order.price * (1 + marketBehaviorSettings.cancellationLocalVolumeWindow);

      while (rightIndex < priceSortedCandidates.length && priceSortedCandidates[rightIndex]!.order.price <= maxPrice) {
        localVolume += priceSortedCandidates[rightIndex]!.order.size;
        rightIndex += 1;
      }

      while (leftIndex < priceSortedCandidates.length && priceSortedCandidates[leftIndex]!.order.price < minPrice) {
        localVolume -= priceSortedCandidates[leftIndex]!.order.size;
        leftIndex += 1;
      }

      localVolumeByCandidateIndex.set(candidate.index, Math.max(Number.EPSILON, localVolume));
    }
  }

  const candidateWeight = (candidate: { order: RestingOrder; index: number }): number => {
    let weight = weightByLocalVolume ? (localVolumeByCandidateIndex.get(candidate.index) ?? Number.EPSILON) : 1;

    if (weightByPriceMovement && priceMovedAwayFromOrder(candidate.order, spread)) {
      const age = Math.max(0, now - candidate.order.createdAt);
      const recency = Math.exp(-age / marketBehaviorSettings.cancellationPriceMovementOrderDecay);

      weight *= 1 + (marketBehaviorSettings.cancellationPriceMovementBoost - 1) * recency;
    }

    if (weightByFarOrder) {
      weight *= farOrderCancellationProbability(candidate.order, now, spread);
    }

    if (weightByAge) {
      weight *= Math.max(1, now - candidate.order.createdAt);
    }

    return weight;
  };
  let totalWeight = 0;

  for (const candidate of candidates) {
    totalWeight += candidateWeight(candidate);
  }

  if (totalWeight <= 0) return null;

  let targetWeight = sampleUniform(0, totalWeight);

  for (const candidate of candidates) {
    targetWeight -= candidateWeight(candidate);

    if (targetWeight <= 0) return candidate;
  }

  return candidates[sampleUniformInteger(0, candidates.length)] ?? null;
};

const simulateCancellationEvent = (side: OrderSide): boolean => {
  const candidate = randomRestingOrder(
    side,
    sampleBernoulli(cancellationTimeWeighting),
    sampleBernoulli(cancellationPriceMovementWeighting),
    sampleBernoulli(cancellationLocalVolumeWeighting),
    sampleBernoulli(cancellationFarOrderWeighting),
  );

  if (!candidate) return false;

  removeRestingOrder(candidate.index);
  return cancelOrder(candidate.order.id, candidate.order.side) !== null;
};

const simulateLimitOrderEvent = (side: OrderSide) => {
  // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
  // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
  // TODO: simulate account internal state (bounded balance)
  // TODO: make depend on spread, book depth, volatlity, uncertainty.
  // TODO: simulate order spitting for large ones
  // TODO: stop loss, take profit liquidation simulations
  // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
  // TODO: delays in price reaction
  const size = sampleOrderSize();

  // TODO: simulate initial interest
  const price = applyOrderPricePsychology(side, sampleMakerOrderPrice(side));
  const order = makeOrder(side, { price, size });

  if (order.restingSize > 0) {
    trackRestingOrder({ id: order.id, side, price, size: order.restingSize, createdAt: Date.now() });
  }
};

const simulateMarketOrderEvent = (side: OrderSide) => {
  const size = sampleOrderSize();
  takeOrder(side, size);
};

const simulateEvent = (eventType: SimulationEventType): void => {
  switch (eventType) {
    case "market-buy":
      simulateMarketOrderEvent("buy");
      break;
    case "market-sell":
      simulateMarketOrderEvent("sell");
      break;
    case "order-buy":
      simulateLimitOrderEvent("buy");
      break;
    case "order-sell":
      simulateLimitOrderEvent("sell");
      break;
    case "cancel-buy":
      simulateCancellationEvent("buy");
      break;
    case "cancel-sell":
      simulateCancellationEvent("sell");
      break;
  }

  updateRecentPriceAnchors();
  updateTouchPriceHistory();
};

// TODO: separate economy simulation model to allow for news impacts
// TODO: separate trading platform model for complex market behavior
// TODO: separate market agent model to simulate individual behavior
// TODO: Trading at certain times of the day
// TODO: Trading character defined by what parameters and features a particular actor uses
// TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const tick = () => {
  const excitementDecay = excitementDecayVector();
  const { events, excitedInterest: nextExcitedInterest } = sampleMultivariateHawkesProcessEventTimes(
    publicInterestVector(),
    interestExcitationMatrix(excitementDecay),
    excitementDecay,
    tickTime,
    excitedInterest,
  );

  excitedInterest = nextExcitedInterest;
  for (const event of events) {
    simulateEvent(simulationEventTypes[event.type]);
  }
};

// TODO: move to a worker
export const run = () => {
  excitedInterest = excitedInterest.map(() => 0);
  touchPriceHistory.buy.length = 0;
  touchPriceHistory.sell.length = 0;
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
