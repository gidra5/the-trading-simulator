import { cancelOrder, getOrderBookHistogram, hasOrder, makeOrder, marketPriceSpread, type OrderSide, takeOrder } from "./market";
import {
  sampleExponential,
  sampleLogNormal,
  sampleMultivariateHawkesProcessEventTimes,
  sampleNormal,
  samplePowerLaw,
  sampleUniform,
  sampleUniformInteger,
} from "./distributions";
import { assert, clamp } from "./utils";

export type OrderSizeDistribution = "uniform" | "log-normal" | "power-law" | "exponential";
export type OrderPriceDistribution =
  | "uniform"
  | "symmetric-uniform"
  | "normal"
  | "log-normal"
  | "power-law"
  | "exponential";

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

const eventVector = (vector: SimulationEventVector): number[] =>
  simulationEventTypes.map((eventType) => vector[eventType]);

const eventExcitationMatrix = (matrix: SimulationExcitationMatrix): number[][] =>
  simulationEventTypes.map((eventType) => eventVector(matrix[eventType]));

const positiveFiniteOrZero = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

const halfLifeToDecay = (halfLifeSeconds: number): number => {
  const halfLife = positiveFiniteOrZero(halfLifeSeconds);

  return halfLife > 0 ? Math.LN2 / halfLife : 0;
};

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

const publicInterestRate = 20; // total event rate per second before self-excitation
const patience = 0.99; // probability of placing an order instead of canceling
const greed = 0.4; // market order prob
const fear = 0.5; // sell order prob
const marketPressure = patience * greed;
const orderPressure = patience * (1 - greed);
const cancelPressure = 1 - patience;
const publicInterest = eventVector({
  "market-buy": marketPressure * (1 - fear),
  "market-sell": marketPressure * fear,
  "order-buy": orderPressure * (1 - fear),
  "order-sell": orderPressure * fear,
  "cancel-buy": cancelPressure * (1 - fear),
  "cancel-sell": cancelPressure * fear,
}).map((v) => publicInterestRate * v); // event rates per second before self-excitation

const excitementHalfLife = eventVector({
  "market-buy": 0.02,
  "market-sell": 0.02,
  "order-buy": 0.05,
  "order-sell": 0.05,
  "cancel-buy": 0.05,
  "cancel-sell": 0.05,
}); // seconds until extra interest halves
const excitementDecay = excitementHalfLife.map(halfLifeToDecay);

const branchingRatio = eventVector({
  "market-buy": 1,
  "market-sell": 1,
  "order-buy": 0.15,
  "order-sell": 0.15,
  "cancel-buy": 0.25,
  "cancel-sell": 0.25,
}); // expected total child events caused by one event
const reflexivity = 1; // same event excites same event
const contrarianism = 0.12; // buy excites sell, sell excites buy
const passiveMirroring = 0.2; // limit buy excites limit sell, and vice versa
const liquidityChasing = 0.25; // market events excite same-side limit orders
const liquidityFading = 0.15; // market events excite same-side cancels
const adverseSelection = 0.1; // market buys pull asks, market sells pull bids
const orderCrowding = 0.3; // limit orders excite same-side limit orders
const passiveAdverseSelection = 0.05; // limit orders can make same-side liquidity pull back
const cancelCrowding = 0.8; // cancels excite same-side cancels
const bookRebalancing = 0.1; // cancels excite opposite-side limit orders
const cancelPanic = 0.05; // cancels can trigger opposite-side market pressure
// Keep excitations low relative to decay rates for a stable market, otherwise
// the event counts can explode exponentially.
const excitationMatrix = eventExcitationMatrix({
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
const interestExcitation = normalizeExcitationMatrix(excitationMatrix, excitementDecay, branchingRatio);
const orderSpread = 0.15; // mean maker price distance percent
const orderPriceTail = 1.5; // distance dispersion: higher = more tiny and far orders
const orderSizeScale = 100; // mean order size
const orderSizeTail = 1.5; // size dispersion: higher = more tiny and huge orders
const anchorPreference = 0.35;
const liquidityWallAnchorPreference = 0.2;
const liquidityWallAnchorRange = 0.001;
const liquidityWallHistogramResolution = 64;
const roundPricePreference = 0.45;
const priceAnchorIntervals = [60_000, 600_000, 1_800_000, 3_600_000] as const;

let orderPriceDistribution: OrderPriceDistribution = "uniform";
let orderSizeDistribution: OrderSizeDistribution = "uniform";

export const setOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
  orderPriceDistribution = distribution;
};

export const setOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
  orderSizeDistribution = distribution;
};

type RestingOrder = {
  id: number;
  side: OrderSide;
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
    case "symmetric-uniform":
      return sampleUniform(-scale, scale);
    case "normal":
      return sampleNormal(0, scale);
    case "log-normal":
      return sampleLogNormal(scale, tail);
    case "power-law":
      return scale * samplePowerLaw(tail);
    case "exponential":
      return sampleExponential(scale);
  }
};

const sampleMakerOrderPrice = (side: OrderSide): number => {
  const bestPrice = marketPriceSpread()[side];
  const jitter = sampleOrderDistance(orderPriceDistribution, orderSpread, orderPriceTail);
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
  const cellHeight = (rangeMax - rangeMin) / liquidityWallHistogramResolution;
  const histogram = getOrderBookHistogram({
    price: [rangeMin, rangeMax],
    resolution: liquidityWallHistogramResolution,
  });
  let closestLevelPrice = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  const sizes = new Array<number>(liquidityWallHistogramResolution).fill(0);
  let totalSize = 0;

  for (const entry of histogram) {
    if (entry.kind === side) {
      sizes[entry.y] = entry.size;
      totalSize += entry.size;
    }
  }

  const meanSize = totalSize / liquidityWallHistogramResolution;

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
    ? closestLevelPrice * sampleUniform(1, 1 + liquidityWallAnchorRange)
    : closestLevelPrice * sampleUniform(1 - liquidityWallAnchorRange, 1);
};

const applyOrderPricePsychology = (side: OrderSide, price: number): number => {
  if (!Number.isFinite(price) || price <= 0) return price;

  const spread = marketPriceSpread();
  updateRecentPriceAnchors(spread);

  let adjustedPrice = price;

  if (Math.random() < anchorPreference) {
    const anchor = sampleRecentHighLowAnchor(side);

    if (anchor !== null) {
      adjustedPrice += (anchor - adjustedPrice) * sampleUniform(0.15, 0.6);
    }
  }

  if (Math.random() < liquidityWallAnchorPreference) {
    const anchor = sampleSupportResistanceAnchor(side, adjustedPrice, spread);

    if (anchor !== null) {
      adjustedPrice = anchor;
    }
  }

  if (Math.random() < roundPricePreference) {
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
      return sampleUniform(0, orderSizeScale * 2);
    case "log-normal":
      return sampleLogNormal(orderSizeScale, orderSizeTail);
    case "power-law":
      return orderSizeScale * samplePowerLaw(orderSizeTail);
    case "exponential":
      return sampleExponential(orderSizeScale);
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

  return candidates[sampleUniformInteger(0, candidates.length)] ?? null;
};

// TODO: also account for distance from current price (both far and near),
// TODO: if price moved away recently, side and density of orders, spread, volatility, imbalance
// TODO: weight by how long ago the order was created
const simulateCancellationEvent = (side: OrderSide): boolean => {
  const candidate = randomRestingOrder(side);

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
    trackRestingOrder({ id: order.id, side });
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
};

// TODO: separate economy simulation model to allow for news impacts
// TODO: separate trading platform model for complex market behavior
// TODO: separate market agent model to simulate individual behavior
// TODO: Trading at certain times of the day
// TODO: Trading character defined by what parameters and features a particular actor uses
// TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const tick = () => {
  const { events, excitedInterest: nextExcitedInterest } = sampleMultivariateHawkesProcessEventTimes(
    publicInterest,
    interestExcitation,
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
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
