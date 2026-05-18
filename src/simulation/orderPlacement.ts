import { type MarketState, type OrderSide } from "../market/index";
import type { PriceSpread } from "../market/orderBook";
import { sampleBernoulli, sampleUniform, sampleUniformInteger } from "../distributions";
import { assert, clamp, sigmoid } from "../utils";
import { type SimulationTimeState } from "./time";
import { type PriceAnchorWindow, type RestingOrder } from "./types";
import { type Accessor } from "solid-js";

// const createPriceAnchoringState = (intervals: Accessor<number[]>, history: Accessor<PriceHistoryEntry[]>) => {
//   const intervalPriceAnchors = createMemo(() => {
//     return intervals().map((interval) => {
//       const min = createMemo(() => {
//         const priceHistory = history();
//       });
//     });
//   });
// };

type SimulationOrderPlacementOptions = {
  market: MarketState;
  time: SimulationTimeState;
  anchoringIntervals: Accessor<number[]>;
  sampleOrderDistance: () => number;
  sampleOrderSize: () => number;
  inSpreadReach: Accessor<number>;
  nearSpreadSize: Accessor<number>;
  inSpreadOrderProbability: Accessor<number>;
  nearSpreadProbability: Accessor<number>;
  anchorPreference: Accessor<number>;
  liquidityWallAnchorPreference: Accessor<number>;
  liquidityWallAnchorRange: Accessor<number>;
  liquidityWallHistogramResolution: Accessor<number>;
  roundPricePreference: Accessor<number>;
  roundPriceAnchorMinMidDistance: Accessor<number>;
};

export const createOrderPlacementState = (options: SimulationOrderPlacementOptions) => {
  const priceAnchorWindows: PriceAnchorWindow[] = options.anchoringIntervals().map((durationMs) => ({
    durationMs,
    highTimes: [],
    highPrices: [],
    lowTimes: [],
    lowPrices: [],
    highOffset: 0,
    lowOffset: 0,
  }));

  const sampleInSpreadOrderPrice = (spread: PriceSpread, side: OrderSide): number => {
    const bestBid = spread.sell;
    const bestAsk = spread.buy;

    const padding = (bestAsk - bestBid) * options.inSpreadReach();
    const minPrice = side === "buy" ? bestBid + padding : bestBid;
    const maxPrice = side === "buy" ? bestAsk : bestAsk - padding;

    return sampleUniform(minPrice, maxPrice);
  };

  const sampleNearOrderPrice = (spread: PriceSpread, side: OrderSide): number => {
    const bestBid = spread.sell;
    const bestAsk = spread.buy;
    const midPrice = (bestAsk + bestBid) / 2;

    const padding = midPrice * options.nearSpreadSize();
    const minPrice = side === "buy" ? bestBid + padding : bestAsk;
    const maxPrice = side === "buy" ? bestBid : bestAsk - padding;

    return sampleUniform(minPrice, maxPrice);
  };

  const sampleOrderPrice = (side: OrderSide): number => {
    const price = (() => {
      let spread = options.market.marketPriceSpread();
      const size = options.nearSpreadSize();
      const nearSpread = { buy: spread.buy * (1 + size), sell: spread.sell * (1 - size) };
      spread = nearSpread;
      const spreadSize = spread.buy - spread.sell;
      const rate = 10 ** options.inSpreadOrderProbability();
      const inSpreadProb = 2 * sigmoid(spreadSize * rate) - 1;
      if (sampleBernoulli(inSpreadProb)) return sampleInSpreadOrderPrice(spread, side);
      if (sampleBernoulli(options.nearSpreadProbability())) return sampleNearOrderPrice(spread, side);
      const bestPrice = spread[side];
      const jitter = options.sampleOrderDistance();
      const direction = side === "buy" ? -1 : 1;
      return bestPrice * (1 + jitter) ** direction;
    })();

    const spread = options.market.marketPriceSpread();
    updateRecentPriceAnchors(options.market.midPrice());

    let adjustedPrice = price;

    if (Math.random() < options.anchorPreference()) {
      const anchor = sampleRecentHighLowAnchor(side);

      if (anchor !== null) {
        adjustedPrice += (anchor - adjustedPrice) * sampleUniform(0.15, 0.6);
      }
    }

    if (Math.random() < options.liquidityWallAnchorPreference()) {
      const anchor = sampleSupportResistanceAnchor(side, adjustedPrice, spread);

      if (anchor !== null) {
        adjustedPrice = anchor;
      }
    }

    if (!isNearMidPrice(adjustedPrice, spread) && Math.random() < options.roundPricePreference()) {
      const step = roundPriceStep(adjustedPrice);

      if (step > 0) {
        adjustedPrice = Math.round(adjustedPrice / step) * step;
      }
    }

    return side === "buy"
      ? clamp(adjustedPrice, Number.MIN_VALUE, spread.buy * (1 - Number.EPSILON))
      : Math.max(adjustedPrice, spread.sell * (1 + Number.EPSILON));
  };

  const roundPriceStep = (price: number): number => {
    if (!Number.isFinite(price) || price <= 0) return 0;

    const magnitude = 10 ** Math.floor(Math.log10(price));
    const roll = Math.random();

    if (roll < 0.15) return magnitude * 0.1;
    if (roll < 0.45) return magnitude * 0.05;
    return magnitude * 0.01;
  };

  const isNearMidPrice = (price: number, spread: ReturnType<MarketState["marketPriceSpread"]>): boolean => {
    const midPrice = (spread.buy + spread.sell) / 2;

    if (!Number.isFinite(price) || !Number.isFinite(midPrice) || midPrice <= 0) return false;

    return Math.abs(price - midPrice) / midPrice <= options.roundPriceAnchorMinMidDistance();
  };

  const compactPricePoints = (times: number[], prices: number[], offset: number): number => {
    if (offset < 64 || offset * 2 < times.length) return offset;

    times.splice(0, offset);
    prices.splice(0, offset);
    return 0;
  };

  const sampleRecentHighLowAnchor = (side: OrderSide): number | null => {
    const window = priceAnchorWindows[sampleUniformInteger(0, priceAnchorWindows.length)];

    if (!window) return null;

    const high = window.highPrices[window.highOffset];
    const low = window.lowPrices[window.lowOffset];
    const preferSideAnchor = Math.random() < 0.7;
    const anchor = preferSideAnchor === (side === "buy") ? low : high;

    return Number.isFinite(anchor) && anchor > 0 ? anchor : null;
  };

  const sampleSupportResistanceAnchor = (
    side: OrderSide,
    candidatePrice: number,
    spread: PriceSpread,
  ): number | null => {
    const currentPrice = (spread.buy + spread.sell) / 2;

    const priceMin = Math.min(spread.buy, spread.sell, candidatePrice);
    const priceMax = Math.max(spread.buy, spread.sell, candidatePrice);
    const padding = Math.max((priceMax - priceMin) * 0.5, currentPrice * 0.05);
    const rangeMin = Math.max(Number.MIN_VALUE, priceMin - padding);
    const rangeMax = priceMax + padding;
    const { cellHeight, sizes } = options.market.getOrderBookHistogramSeries(
      {
        price: [rangeMin, rangeMax],
        resolution: options.liquidityWallHistogramResolution(),
      },
      side,
    );
    let closestLevelPrice = 0;
    let closestDistance = Number.POSITIVE_INFINITY;
    let totalSize = 0;

    for (const size of sizes) {
      totalSize += size;
    }

    const meanSize = sizes.length > 0 ? totalSize / sizes.length : 0;

    for (let y = 0; y < sizes.length; y += 1) {
      const size = sizes[y] ?? 0;

      if (size <= meanSize || size <= 0) continue;

      const previousSize = sizes[y - 1] ?? 0;
      const nextSize = sizes[y + 1] ?? 0;

      if (size < previousSize * 1.5 && size < nextSize * 1.5) continue;

      const levelPrice = rangeMin + (y + 0.5) * cellHeight;
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
      ? closestLevelPrice * sampleUniform(1, 1 + options.liquidityWallAnchorRange())
      : closestLevelPrice * sampleUniform(1 - options.liquidityWallAnchorRange(), 1);
  };

  const updateRecentPriceAnchors = (price = options.market.midPrice()): void => {
    if (!Number.isFinite(price) || price <= 0) return;

    for (const window of priceAnchorWindows) {
      const expiresBefore = options.time.time() - window.durationMs;

      while (window.highOffset < window.highTimes.length && window.highTimes[window.highOffset]! < expiresBefore) {
        window.highOffset += 1;
      }

      while (window.lowOffset < window.lowTimes.length && window.lowTimes[window.lowOffset]! < expiresBefore) {
        window.lowOffset += 1;
      }

      while (
        window.highPrices.length > window.highOffset &&
        window.highPrices[window.highPrices.length - 1]! <= price
      ) {
        window.highTimes.pop();
        window.highPrices.pop();
      }

      while (window.lowPrices.length > window.lowOffset && window.lowPrices[window.lowPrices.length - 1]! >= price) {
        window.lowTimes.pop();
        window.lowPrices.pop();
      }

      window.highTimes.push(options.time.time());
      window.highPrices.push(price);
      window.lowTimes.push(options.time.time());
      window.lowPrices.push(price);
      window.highOffset = compactPricePoints(window.highTimes, window.highPrices, window.highOffset);
      window.lowOffset = compactPricePoints(window.lowTimes, window.lowPrices, window.lowOffset);
    }
  };

  const simulateLimitOrderEvent = (side: OrderSide): RestingOrder => {
    const size = options.sampleOrderSize();
    const price = sampleOrderPrice(side);
    const result = options.market.makeOrder(side, { price, size });
    assert(result.order.size === size, "simulated pure market orders should not partially fill on post");

    return { id: result.order.id, side, price, size: result.order.size, createdAt: options.time.time() };
  };

  return {
    simulateLimitOrderEvent,
    updateRecentPriceAnchors,
  };
};

export type SimulationOrderPlacementState = ReturnType<typeof createOrderPlacementState>;
