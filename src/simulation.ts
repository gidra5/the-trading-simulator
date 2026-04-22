import { cancelOrder, hasOrder, makeOrder, marketPriceSpread, oppositeSide, takeOrder, type OrderSide } from "./market";

const tickTime = 200;
const maxElapsedTime = 1_000;
const interest = 500; // event rate per second
const patience = 0.5; // cancellation prob
const greed = 0.6; // market order prob
const fear = 0.5; // sell order prob
const minOrderSize = 20;
const maxOrderSize = 400;
const orderSizeExponent = 1.4;
const meanPriceDistance = 0.01;

type RestingOrder = {
  id: number;
  side: OrderSide;
  createdAt: number;
};

const restingOrders: RestingOrder[] = [];

// TODO: Trading at certain times of the day
// TODO: Trading character defined by what parameters and features a particular actor uses
// TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const sampleStandardNormal = (): number => {
  const u1 = Math.max(Math.random(), Number.MIN_VALUE);
  const u2 = Math.random();

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
};

const samplePoisson = (mean: number, interval: number): number => {
  mean *= interval;
  if (mean <= 0) return 0; // TODO: assert
  if (mean >= 30) {
    return Math.max(0, Math.round(mean + Math.sqrt(mean) * sampleStandardNormal()));
  }

  const threshold = Math.exp(-mean);
  let product = 1;
  let count = 0;

  while (product > threshold) {
    count += 1;
    product *= Math.random();
  }

  return count - 1;
};

const samplePowerLaw = (min: number, max: number, exponent: number): number => {
  const clampedMin = Math.max(min, Number.MIN_VALUE);
  const clampedMax = Math.max(max, clampedMin);
  const u = Math.random();
  const maxTerm = (clampedMin / clampedMax) ** exponent;

  return clampedMin / (1 - u * (1 - maxTerm)) ** (1 / exponent);
};

const sampleExponential = (mean: number): number => {
  const u = Math.max(1 - Math.random(), Number.MIN_VALUE);

  return -mean * Math.log(u);
};

const pruneInactiveOrders = () => {
  for (let i = restingOrders.length - 1; i >= 0; i -= 1) {
    const order = restingOrders[i];
    if (!order || hasOrder(order.id, order.side)) {
      continue;
    }

    restingOrders.splice(i, 1);
  }
};

// TODO: also account for distance from current price (both far and near),
// TODO: if price moved away recently, side and density of orders, spread, volatility, imbalance
const selectCancellationIndex = (now: number): number => {
  const totalWeight = restingOrders.reduce((sum, order) => sum + Math.max(now - order.createdAt, 1), 0);
  let remainingWeight = Math.random() * totalWeight;

  for (let i = 0; i < restingOrders.length; i += 1) {
    const weight = Math.max(now - restingOrders[i]!.createdAt, 1);
    remainingWeight -= weight;

    if (remainingWeight <= 0) {
      return i;
    }
  }

  return restingOrders.length - 1;
};

const simulateOrderEvent = (now: number) => {
  // TODO: psychology, like preferring round prices
  // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
  const isMaker = Math.random() < greed;
  const side = Math.random() > fear ? "buy" : "sell";
  // TODO: fee (percent from what you get) and slippage (difference between expected and actual)
  // TODO: simulate account internal state (bounded balance)
  // TODO: make depend on spread, book depth, volatlity, uncertainty.
  // TODO: simulate order spitting for large ones
  // TODO: stop loss, take profit liquidation simulations
  // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
  // TODO: anchoring
  // TODO: delays in price reaction
  const size = samplePowerLaw(minOrderSize, maxOrderSize, orderSizeExponent);

  // TODO: simulate initial interest
  if (isMaker) {
    const referencePrice = marketPriceSpread()[oppositeSide(side)];
    const distance = Math.max(sampleExponential(meanPriceDistance), 0);
    const price =
      side === "buy" ? Math.max(referencePrice * (1 - distance), Number.MIN_VALUE) : referencePrice * (1 + distance);
    const result = makeOrder(side, { price, size });

    if (result.restingSize > 0) {
      restingOrders.push({ id: result.id, side, createdAt: now });
    }

    return;
  }

  takeOrder(side, size);
};;

const simulateCancellationEvent = (now: number) => {
  while (restingOrders.length > 0) {
    const index = selectCancellationIndex(now);
    const [order] = restingOrders.splice(index, 1);

    if (order && cancelOrder(order.id, order.side)) {
      return;
    }
  }
};

// TODO: orders should be properly distributed over the time period for nice heatmap
const tick = (elapsedTime: number, now: number) => {
  // TODO: hawkes
  // TODO: then multivariate hawkes process (market sell/buy, order sell/buy, cancels, a matrix for cross correlation)
  const orderEventCount = samplePoisson(interest / 1_000, elapsedTime);
  for (let i = 0; i < orderEventCount; i += 1) {
    if (restingOrders.length > 0 && Math.random() < patience) {
      simulateCancellationEvent(now);
    } else {
      simulateOrderEvent(now);
    }
  }

  pruneInactiveOrders();
};

export const run = () => {
  let lastTickAt = Date.now();
  const intervalId = setInterval(() => {
    const now = Date.now();
    const elapsedTime = Math.min(now - lastTickAt, maxElapsedTime);

    lastTickAt = now;
    tick(elapsedTime, now);
  }, tickTime);

  return () => {
    clearInterval(intervalId);
  };
};
