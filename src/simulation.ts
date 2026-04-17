import {
  makeOrder,
  marketPriceSpread,
  oppositeSide,
  takeOrder,
} from "./market";

const tickTime = 200;
const greed = 0.6;
const fear = 0.5;
const orderSpread = 0.02;
const orderBias = 0;

// https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
const tick = () => {
  for (let i = 0; i < 100; i++) {
    // todo: psychology, like preferring round prices
    // todo: poisson
    // todo: hawkes
    // todo: then multivariate hawkes process (market sell/buy, order sell/buy, cancels, a matrix for cross correlation)
    // todo: cancellation
    const isMaker = Math.random() < greed;
    const side = Math.random() > fear ? "buy" : "sell";
    // todo: fee (percent from what you buy) and slippage (difference between expected and actual)
    // todo: simulate account internal state (bounded balance)
    // todo: make depend on spread, book depth, volatlity, uncertainty.
    // todo: replace with power law distribution
    const size = Math.random() * 100;

    if (isMaker) {
      const jitter = Math.random() * 2 - 1 + orderBias; // todo: replace with normal distribution
      const price =
        marketPriceSpread()[oppositeSide(side)] * (1 + jitter * orderSpread); // +-1% of market price
      makeOrder(side, { price, size });
    } else {
      takeOrder(side, size);
    }
  }
};

export const run = () => {
  const intervalId = setInterval(tick, tickTime);

  return () => {
    if (intervalId === undefined) return;
    clearInterval(intervalId);
  };
};
