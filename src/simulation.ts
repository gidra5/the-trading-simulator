import {
  makeOrder,
  marketPriceSpread,
  oppositeSide,
  takeOrder,
} from "./market";

const tickTime = 200;

const tick = () => {
  for (let i = 0; i < 10; i++) {
    const isMaker = Math.random() < 0.5;
    const side = Math.random() < 0.5 ? "buy" : "sell";
    const size = Math.random() * 100;

    if (isMaker) {
      const jitter = Math.random() * 2 - 1;
      const price =
        marketPriceSpread()[oppositeSide(side)] * (1 + jitter * 0.01); // +-1% of market price
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
