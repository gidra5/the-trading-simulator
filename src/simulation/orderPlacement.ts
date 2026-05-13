import { type MarketState, type OrderSide } from "../market/index";
import type { PriceSpread } from "../market/orderBook";
import {
  sampleBernoulli,
  sampleExponential,
  sampleLogNormal,
  sampleNormal,
  samplePowerLaw,
  sampleUniform,
  sampleUniformInteger,
} from "../distributions";
import { clamp, sigmoid } from "../utils";
import { type SimulationTimeState } from "./time";
import {
  type MarketBehaviorSettings,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type PriceAnchorWindow,
  type RestingOrder,
} from "./types";

type SimulationOrderPlacementOptions = {
  getSettings: () => MarketBehaviorSettings;
  getOrderPriceDistribution: () => OrderPriceDistribution;
  getOrderSizeDistribution: () => OrderSizeDistribution;
  market: MarketState;
  time: SimulationTimeState;
};

export const createSimulationOrderPlacementState = (options: SimulationOrderPlacementOptions) => {
  const priceAnchorIntervals = [60_000, 600_000, 1_800_000, 3_600_000] as const;
  const priceAnchorWindows: PriceAnchorWindow[] = priceAnchorIntervals.map((durationMs) => ({
    durationMs,
    highTimes: [],
    highPrices: [],
    lowTimes: [],
    lowPrices: [],
    highOffset: 0,
    lowOffset: 0,
  }));

  const sampleOrderDistance = (distribution: OrderPriceDistribution, scale: number, tail: number): number => {
    switch (distribution) {
      case "uniform":
        return sampleUniform(0, scale * 2);
      case "abs-normal":
        return Math.abs(sampleNormal(0, scale));
      case "log-normal":
        return sampleLogNormal(scale, tail);
      case "power-law":
        return scale * samplePowerLaw(tail);
      case "exponential":
        return sampleExponential(scale);
    }
  };

  const sampleInSpreadOrderPrice = (spread: PriceSpread, side: OrderSide): number => {
    const bestBid = spread.sell;
    const bestAsk = spread.buy;

    const settings = options.getSettings();
    const padding = (bestAsk - bestBid) * settings.inSpreadReach;
    const minPrice = side === "buy" ? bestBid + padding : bestBid;
    const maxPrice = side === "buy" ? bestAsk : bestAsk - padding;

    return sampleUniform(minPrice, maxPrice);
  };

  const sampleNearOrderPrice = (spread: PriceSpread, side: OrderSide): number => {
    const bestBid = spread.sell;
    const bestAsk = spread.buy;
    const midPrice = (bestAsk + bestBid) / 2;

    const settings = options.getSettings();
    const padding = midPrice * settings.nearSpreadSize;
    const minPrice = side === "buy" ? bestBid + padding : bestAsk;
    const maxPrice = side === "buy" ? bestBid : bestAsk - padding;

    return sampleUniform(minPrice, maxPrice);
  };

  const sampleMakerOrderPrice = (side: OrderSide): number => {
    const settings = options.getSettings();
    let spread = options.market.marketPriceSpread();
    spread = { buy: spread.buy * (1 - settings.nearSpreadSize), sell: spread.sell * (1 + settings.nearSpreadSize) };
    const spreadSize = spread.buy - spread.sell;
    const rate = 10 ** settings.inSpreadOrderProbability;
    const inSpreadProb = 2 * sigmoid(spreadSize * rate) - 1;
    if (sampleBernoulli(inSpreadProb)) return sampleInSpreadOrderPrice(spread, side);
    if (sampleBernoulli(settings.nearSpreadProbability)) return sampleNearOrderPrice(spread, side);
    const bestPrice = spread[side];
    const jitter = sampleOrderDistance(
      options.getOrderPriceDistribution(),
      settings.orderSpread,
      settings.orderPriceTail,
    );
    const direction = side === "buy" ? -1 : 1;
    return bestPrice * (1 + jitter) ** direction;
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

    return Math.abs(price - midPrice) / midPrice <= options.getSettings().roundPriceAnchorMinMidDistance;
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
    const settings = options.getSettings();
    const currentPrice = (spread.buy + spread.sell) / 2;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(candidatePrice)) return null;

    const priceMin = Math.min(spread.buy, spread.sell, candidatePrice);
    const priceMax = Math.max(spread.buy, spread.sell, candidatePrice);
    const padding = Math.max((priceMax - priceMin) * 0.5, currentPrice * 0.05);
    const rangeMin = Math.max(Number.MIN_VALUE, priceMin - padding);
    const rangeMax = priceMax + padding;
    const { cellHeight, sizes } = options.market.getOrderBookHistogramSeries(
      {
        price: [rangeMin, rangeMax],
        resolution: settings.liquidityWallHistogramResolution,
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
      ? closestLevelPrice * sampleUniform(1, 1 + settings.liquidityWallAnchorRange)
      : closestLevelPrice * sampleUniform(1 - settings.liquidityWallAnchorRange, 1);
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

  const applyOrderPricePsychology = (side: OrderSide, price: number): number => {
    const settings = options.getSettings();

    if (!Number.isFinite(price) || price <= 0) return price;

    const spread = options.market.marketPriceSpread();
    updateRecentPriceAnchors(options.market.midPrice());

    let adjustedPrice = price;

    if (Math.random() < settings.anchorPreference) {
      const anchor = sampleRecentHighLowAnchor(side);

      if (anchor !== null) {
        adjustedPrice += (anchor - adjustedPrice) * sampleUniform(0.15, 0.6);
      }
    }

    if (Math.random() < settings.liquidityWallAnchorPreference) {
      const anchor = sampleSupportResistanceAnchor(side, adjustedPrice, spread);

      if (anchor !== null) {
        adjustedPrice = anchor;
      }
    }

    if (!isNearMidPrice(adjustedPrice, spread) && Math.random() < settings.roundPricePreference) {
      const step = roundPriceStep(adjustedPrice);

      if (step > 0) {
        adjustedPrice = Math.round(adjustedPrice / step) * step;
      }
    }

    return side === "buy" ? clamp(adjustedPrice, Number.MIN_VALUE, spread.buy) : Math.max(adjustedPrice, spread.sell);
  };

  const sampleOrderSize = (): number => {
    const settings = options.getSettings();

    switch (options.getOrderSizeDistribution()) {
      case "uniform":
        return sampleUniform(0, settings.orderSizeScale * 2);
      case "log-normal":
        return sampleLogNormal(settings.orderSizeScale, settings.orderSizeTail);
      case "power-law":
        return settings.orderSizeScale * samplePowerLaw(settings.orderSizeTail);
      case "exponential":
        return sampleExponential(settings.orderSizeScale);
    }
  };

  const simulateLimitOrderEvent = (side: OrderSide): RestingOrder | null => {
    // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
    // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
    // TODO: simulate account internal state (bounded balance)
    // TODO: make depend on spread, book depth, volatlity, uncertainty.
    // TODO: simulate order spitting for large ones
    // TODO: stop loss, take profit liquidation simulations
    // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
    // TODO: delays in price reaction
    const size = sampleOrderSize();

    // TODO: simulate initial interest
    const price = applyOrderPricePsychology(side, sampleMakerOrderPrice(side));
    const result = options.market.makeOrder(side, { price, size });

    return result.order.size > 0
      ? { id: result.order.id, side, price, size: result.order.size, createdAt: options.time.time() }
      : null;
  };

  return {
    sampleOrderSize,
    simulateLimitOrderEvent,
    updateRecentPriceAnchors,
  };
};

export type SimulationOrderPlacementState = ReturnType<typeof createSimulationOrderPlacementState>;
