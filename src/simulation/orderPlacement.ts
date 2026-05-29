import type { Accessor } from "solid-js";
import { sampleBernoulli, sampleTruncatedExponential } from "../distributions";
import { type MarketState, type OrderSide } from "../market/index";
import { assert } from "../utils";
import { type SimulationTimeState } from "./time";
import { type RestingOrder } from "./types";

export type SimulationOrderPlacementOptions = {
  market: MarketState;
  time: SimulationTimeState;
  rng: () => number;
  sampleOrderDistance: () => number;
  sampleOrderSize: () => number;
  inSpread: {
    max: Accessor<number>; // max fraction of orders to place in spread when its large
    halfRateSize: Accessor<number>; // spread size at which half of max fraction are placed in spread
    mean: Accessor<number>; // mean distance from best offer at large spread
  };
};

export const createOrderPlacementState = (options: SimulationOrderPlacementOptions) => {
  const sampleOrderPrice = (side: OrderSide): number => {
    const spread = options.market.marketPriceSpread();

    // in spread sample
    const spreadSize = spread.buy - spread.sell;
    const ramp = Math.LN2 / options.inSpread.halfRateSize();
    const max = options.inSpread.max();
    if (sampleBernoulli(max * (1 - Math.exp(-ramp * spreadSize)), options.rng)) {
      const mean = options.inSpread.mean();
      const distance = sampleTruncatedExponential(mean, spreadSize, options.rng);

      if (side === "buy") return spread.sell + distance;
      if (!Number.isFinite(spread.buy)) return spread.sell + distance;
      return spread.buy - distance;
    }

    const distance = 1 + options.sampleOrderDistance();
    const price = (() => {
      if (side === "buy") return spread.sell / distance;
      return spread.buy * distance;
    })();

    return price;
  };

  const simulateLimitOrderEvent = (side: OrderSide): RestingOrder => {
    const size = options.sampleOrderSize();
    const price = sampleOrderPrice(side);
    const result = options.market.makeOrder(side, { price, size });

    assert(result.order.size === size, "simulated limit orders should not fill immediately");

    return { id: result.order.id, side, price, size: result.order.size, createdAt: options.time.time() };
  };

  return {
    simulateLimitOrderEvent,
  };
};
