import { cancelOrder, hasOrder, makeOrder, marketPriceSpread, type OrderSide, takeOrder } from "./market";
import {
  sampleExponential,
  sampleLogNormal,
  sampleMultivariateHawkesProcessEventTimes,
  sampleNormal,
  samplePowerLaw,
  sampleUniform,
  sampleUniformInteger,
} from "./distributions";
import { assert } from "./utils";

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
const orderSpread = 0.02; // mean maker price distance
const orderPriceTail = 1.5; // distance dispersion: higher = more tiny and far orders
const orderSizeScale = 100; // mean order size
const orderSizeTail = 1.5; // size dispersion: higher = more tiny and huge orders

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

const restingOrders: RestingOrder[] = [];

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
  const jitter = sampleOrderDistance(orderPriceDistribution, orderSpread, orderPriceTail);
  const bestPrice = marketPriceSpread()[side];
  const direction = side === "buy" ? -1 : 1;
  return bestPrice * (1 + jitter) ** direction;
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
  // TODO: psychology, like preferring round prices
  // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
  // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
  // TODO: simulate account internal state (bounded balance)
  // TODO: make depend on spread, book depth, volatlity, uncertainty.
  // TODO: simulate order spitting for large ones
  // TODO: stop loss, take profit liquidation simulations
  // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
  // TODO: anchoring
  // TODO: delays in price reaction
  const size = sampleOrderSize();

  // TODO: simulate initial interest
  const price = sampleMakerOrderPrice(side);
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
      return;
    case "market-sell":
      simulateMarketOrderEvent("sell");
      return;
    case "order-buy":
      simulateLimitOrderEvent("buy");
      return;
    case "order-sell":
      simulateLimitOrderEvent("sell");
      return;
    case "cancel-buy":
      simulateCancellationEvent("buy");
      return;
    case "cancel-sell":
      simulateCancellationEvent("sell");
      return;
  }
};

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

// todo: move to a worker
export const run = () => {
  excitedInterest = excitedInterest.map(() => 0);
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
