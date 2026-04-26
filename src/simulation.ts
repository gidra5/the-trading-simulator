import {
  cancelOrder,
  hasOrder,
  makeOrder,
  marketPriceSpread,
  type OrderSide,
  takeOrder,
} from "./market";
import {
  sampleBernoulli,
  sampleExponential,
  samplePowerLaw,
  samplePoissonProcessEvents,
  sampleUniformInteger,
} from "./distributions";

const tickTime = 200;
const publicInterest = 250; // event rate per second
const patience = 0.95; // cancellation prob
const greed = 0.5; // market order prob
const fear = 0.5; // sell order prob
const orderSpread = 0.02; // a volatility parameter
const orderSizeScale = 1; // a kind of average wealth paremeter
const orderSizeTail = 0.8; // a kind of wealthInequality parameter

type RestingOrder = {
  id: number;
  side: OrderSide;
};

const restingOrders: RestingOrder[] = [];

const sampleMakerOrderPrice = (side: OrderSide): number => {
  const jitter = sampleExponential(orderSpread);
  const bestPrice = marketPriceSpread()[side];
  const direction = side === "buy" ? -1 : 1;
  return bestPrice * (1 + jitter) ** direction;
};

const trackRestingOrder = (order: RestingOrder): void => {
  restingOrders.push(order);
};

const removeRestingOrder = (index: number): RestingOrder => {
  const [order] = restingOrders.splice(index, 1);

  // todo: assert
  if (!order) {
    throw new Error("Expected tracked resting order to exist");
  }

  return order;
};

const randomRestingOrder = (): {
  order: RestingOrder;
  index: number;
} | null => {
  while (restingOrders.length > 0) {
    const index = sampleUniformInteger(0, restingOrders.length);
    const order = restingOrders[index];

    if (order && hasOrder(order.id, order.side)) {
      return { order, index };
    }

    removeRestingOrder(index);
  }

  return null;
};

// TODO: also account for distance from current price (both far and near),
// TODO: if price moved away recently, side and density of orders, spread, volatility, imbalance
// TODO: weight by how long ago the order was created
const simulateCancellationEvent = (): boolean => {
  const candidate = randomRestingOrder();

  if (!candidate) return false;

  removeRestingOrder(candidate.index);
  return cancelOrder(candidate.order.id, candidate.order.side) !== null;
};

const simulateOrderEvent = () => {
  // TODO: psychology, like preferring round prices
  // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
  if (!sampleBernoulli(patience) && simulateCancellationEvent()) {
    return;
  }

  const isMaker = !sampleBernoulli(greed);
  const side = !sampleBernoulli(fear) ? "buy" : "sell";
  // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
  // TODO: simulate account internal state (bounded balance)
  // TODO: make depend on spread, book depth, volatlity, uncertainty.
  // TODO: simulate order spitting for large ones
  // TODO: stop loss, take profit liquidation simulations
  // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
  // TODO: anchoring
  // TODO: delays in price reaction
  const size = orderSizeScale * samplePowerLaw(orderSizeTail);

  // TODO: simulate initial interest
  if (isMaker) {
    const price = sampleMakerOrderPrice(side);
    const order = makeOrder(side, { price, size });

    if (order.restingSize > 0) {
      trackRestingOrder({ id: order.id, side });
    }

    return;
  }

  takeOrder(side, size);
};

// TODO: Trading at certain times of the day
// TODO: Trading character defined by what parameters and features a particular actor uses
// TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const tick = () => {
  const events = samplePoissonProcessEvents(publicInterest, tickTime);

  for (let i = 0; i < events; i++) {
    simulateOrderEvent();
  }
};

// todo: move to a worker
export const run = () => {
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
