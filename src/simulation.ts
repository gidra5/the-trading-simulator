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
const patience = 1; // probability of placing an order instead of canceling
const greed = 0.1; // market order prob
const fear = 0.5; // sell order prob
const publicInterest = eventVector({
  "market-buy": patience * greed * (1 - fear),
  "market-sell": patience * greed * fear,
  "order-buy": patience * (1 - greed) * (1 - fear),
  "order-sell": patience * (1 - greed) * fear,
  "cancel-buy": (1 - patience) * (1 - fear),
  "cancel-sell": (1 - patience) * fear,
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
  "market-buy": 0.5,
  "market-sell": 0.5,
  "order-buy": 0.15,
  "order-sell": 0.15,
  "cancel-buy": 0.25,
  "cancel-sell": 0.25,
}); // expected total child events caused by one event
const reflexivity = 1; // same event excites same event
const contrarianism = 0.12; // buy excites sell, sell excites buy
const liquidityResponse = 0.25; // market orders excite limit orders
const liquidityWithdrawal = 0.15; // market orders excite cancels
const cancellationContagion = 0.8; // cancels excite more cancels
const sideSymmetry = 1; // 1 = equal buy/sell reactions
const buyExcitement = positiveFiniteOrZero(sideSymmetry);
const sellExcitement = sideSymmetry > 0 && Number.isFinite(sideSymmetry) ? 1 / sideSymmetry : 1;
// Keep excitations low relative to decay rates for a stable market, otherwise
// the event counts can explode exponentially.
const excitationMatrix = eventExcitationMatrix({
  "market-buy": {
    "market-buy": reflexivity * buyExcitement,
    "market-sell": contrarianism * sellExcitement,
    "order-buy": liquidityResponse * buyExcitement,
    "order-sell": 0,
    "cancel-buy": liquidityWithdrawal * buyExcitement,
    "cancel-sell": 0,
  },
  "market-sell": {
    "market-buy": contrarianism * buyExcitement,
    "market-sell": reflexivity * sellExcitement,
    "order-buy": 0,
    "order-sell": liquidityResponse * sellExcitement,
    "cancel-buy": 0,
    "cancel-sell": liquidityWithdrawal * sellExcitement,
  },
  "order-buy": {
    "market-buy": 0,
    "market-sell": contrarianism * sellExcitement,
    "order-buy": reflexivity * buyExcitement,
    "order-sell": 0,
    "cancel-buy": 0,
    "cancel-sell": 0,
  },
  "order-sell": {
    "market-buy": contrarianism * buyExcitement,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": reflexivity * sellExcitement,
    "cancel-buy": 0,
    "cancel-sell": 0,
  },
  "cancel-buy": {
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": 0,
    "cancel-buy": cancellationContagion * buyExcitement,
    "cancel-sell": 0,
  },
  "cancel-sell": {
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": 0,
    "cancel-buy": 0,
    "cancel-sell": cancellationContagion * sellExcitement,
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
