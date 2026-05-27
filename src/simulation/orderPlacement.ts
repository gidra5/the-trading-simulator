import { type MarketState, type OrderSide } from "../market/index";
import { assert, clamp } from "../utils";
import { type SimulationTimeState } from "./time";
import { type RestingOrder } from "./types";

type SimulationOrderPlacementOptions = {
  market: MarketState;
  time: SimulationTimeState;
  sampleOrderDistance: () => number;
  sampleOrderSize: () => number;
};

export const createOrderPlacementState = (options: SimulationOrderPlacementOptions) => {
  const sampleOrderPrice = (side: OrderSide): number => {
    const spread = options.market.marketPriceSpread();
    const distance = 1 + options.sampleOrderDistance();

    if (side === "buy") return spread.buy / distance;
    return spread.sell * distance;
  };

  const simulateLimitOrderEvent = (side: OrderSide): RestingOrder => {
    const size = options.sampleOrderSize();
    const price = sampleOrderPrice(side);
    const result = options.market.makeOrder(side, { price, size });
    console.log(side, size, price, options.market.marketPriceSpread());

    assert(result.order.size === size, "simulated limit orders should not fill immediately");

    return { id: result.order.id, side, price, size: result.order.size, createdAt: options.time.time() };
  };

  return {
    simulateLimitOrderEvent,
  };
};
