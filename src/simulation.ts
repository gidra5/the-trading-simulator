import {
  makeOrder,
  marketPriceSpread,
  oppositeSide,
  takeOrder,
} from "./market";

const tickTime = 200;
const publicInterest = 500; // event rate per second
const patience = 0.5; // cancellation prob
const greed = 0.6; // market order prob
const fear = 0.5; // sell order prob
const orderSpread = 0.02;
const orderBias = 0;

// TODO: Trading at certain times of the day
// TODO: Trading character defined by what parameters and features a particular actor uses
// TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const tick = () => {
  // TODO: psychology, like preferring round prices
  // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
  const isMaker = Math.random() < greed;
  const side = Math.random() > fear ? "buy" : "sell";
  // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
  // TODO: simulate account internal state (bounded balance)
  // TODO: make depend on spread, book depth, volatlity, uncertainty.
  // TODO: simulate order spitting for large ones
  // TODO: stop loss, take profit liquidation simulations
  // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
  // TODO: anchoring
  // TODO: delays in price reaction
  // TODO: replace with power law distribution
  const size = Math.random() * 100;

  // TODO: cancellation`
  // TODO: also account for distance from current price (both far and near),
  // TODO: if price moved away recently, side and density of orders, spread, volatility, imbalance
  // TODO: weight by how long ago the order was created

  // TODO: simulate initial interest
  if (isMaker) {
    // todo: exponential distribution
    const jitter = Math.random() * 2 - 1 + orderBias;
    const price =
      marketPriceSpread()[oppositeSide(side)] * (1 + jitter * orderSpread); // +-1% of market price
    makeOrder(side, { price, size });

    return;
  }

  takeOrder(side, size);
};

// todo: move to a worker
export const run = () => {
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
