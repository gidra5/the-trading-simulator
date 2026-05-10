import { getOrderBookHistogramSeries, makeOrder, marketPriceSpread, midPrice, type OrderSide } from "../market/index";
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
import {
  type MarketBehaviorSettings,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type PriceAnchorWindow,
  type RestingOrder,
} from "./types";
import type { PriceSpread } from "../market/orderBook";
import { time } from "./time";

export class SimulationOrderPlacement {
  private priceAnchorIntervals = [60_000, 600_000, 1_800_000, 3_600_000] as const;
  private inSpreadReach = -0.1;
  private priceAnchorWindows: PriceAnchorWindow[] = this.priceAnchorIntervals.map((durationMs) => ({
    durationMs,
    highTimes: [],
    highPrices: [],
    lowTimes: [],
    lowPrices: [],
    highOffset: 0,
    lowOffset: 0,
  }));

  constructor(
    private getSettings: () => MarketBehaviorSettings,
    private getOrderPriceDistribution: () => OrderPriceDistribution,
    private getOrderSizeDistribution: () => OrderSizeDistribution,
  ) {}

  simulateLimitOrderEvent(side: OrderSide): RestingOrder | null {
    // TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
    // TODO: fee (percent from what you buy) and slippage (difference between expected and actual)
    // TODO: simulate account internal state (bounded balance)
    // TODO: make depend on spread, book depth, volatlity, uncertainty.
    // TODO: simulate order spitting for large ones
    // TODO: stop loss, take profit liquidation simulations
    // TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
    // TODO: delays in price reaction
    const size = this.sampleOrderSize();

    // TODO: simulate initial interest
    const price = this.applyOrderPricePsychology(side, this.sampleMakerOrderPrice(side));
    const result = makeOrder(side, { price, size });

    return result.order.size > 0
      ? { id: result.order.id, side, price, size: result.order.size, createdAt: time() }
      : null;
  }

  updateRecentPriceAnchors(price = midPrice()): void {
    if (!Number.isFinite(price) || price <= 0) return;

    for (const window of this.priceAnchorWindows) {
      const expiresBefore = time() - window.durationMs;

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

      window.highTimes.push(time());
      window.highPrices.push(price);
      window.lowTimes.push(time());
      window.lowPrices.push(price);
      window.highOffset = this.compactPricePoints(window.highTimes, window.highPrices, window.highOffset);
      window.lowOffset = this.compactPricePoints(window.lowTimes, window.lowPrices, window.lowOffset);
    }
  }

  sampleOrderSize(): number {
    const settings = this.getSettings();

    switch (this.getOrderSizeDistribution()) {
      case "uniform":
        return sampleUniform(0, settings.orderSizeScale * 2);
      case "log-normal":
        return sampleLogNormal(settings.orderSizeScale, settings.orderSizeTail);
      case "power-law":
        return settings.orderSizeScale * samplePowerLaw(settings.orderSizeTail);
      case "exponential":
        return sampleExponential(settings.orderSizeScale);
    }
  }

  private sampleOrderDistance(distribution: OrderPriceDistribution, scale: number, tail: number): number {
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
  }

  private sampleInSpreadOrderPrice(spread: PriceSpread, side: OrderSide): number | null {
    const bestBid = spread.sell;
    const bestAsk = spread.buy;

    if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk) || bestBid <= 0 || bestAsk <= bestBid) return null;

    const padding = (bestAsk - bestBid) * this.inSpreadReach;
    const minPrice = side === "buy" ? bestBid + padding : bestBid;
    const maxPrice = side === "buy" ? bestAsk : bestAsk - padding;

    return sampleUniform(minPrice, maxPrice);
  }

  private sampleMakerOrderPrice(side: OrderSide): number {
    const settings = this.getSettings();
    const spread = marketPriceSpread();
    const spreadSize = spread.buy - spread.sell;
    const rate = 10 ** settings.inSpreadOrderProbability;
    const inSpreadProb = 2 * sigmoid(spreadSize * rate) - 1;
    const inSpreadPrice = sampleBernoulli(inSpreadProb) ? this.sampleInSpreadOrderPrice(spread, side) : null;

    if (inSpreadPrice !== null) return inSpreadPrice;

    const bestPrice = spread[side];
    const jitter = this.sampleOrderDistance(
      this.getOrderPriceDistribution(),
      settings.orderSpread,
      settings.orderPriceTail,
    );
    const direction = side === "buy" ? -1 : 1;
    return bestPrice * (1 + jitter) ** direction;
  }

  private roundPriceStep(price: number): number {
    if (!Number.isFinite(price) || price <= 0) return 0;

    const magnitude = 10 ** Math.floor(Math.log10(price));
    const roll = Math.random();

    if (roll < 0.15) return magnitude * 0.1;
    if (roll < 0.45) return magnitude * 0.05;
    return magnitude * 0.01;
  }

  private isNearMidPrice(price: number, spread: ReturnType<typeof marketPriceSpread>): boolean {
    const midPrice = (spread.buy + spread.sell) / 2;

    if (!Number.isFinite(price) || !Number.isFinite(midPrice) || midPrice <= 0) return false;

    return Math.abs(price - midPrice) / midPrice <= this.getSettings().roundPriceAnchorMinMidDistance;
  }

  private compactPricePoints(times: number[], prices: number[], offset: number): number {
    if (offset < 64 || offset * 2 < times.length) return offset;

    times.splice(0, offset);
    prices.splice(0, offset);
    return 0;
  }

  private sampleRecentHighLowAnchor(side: OrderSide): number | null {
    const window = this.priceAnchorWindows[sampleUniformInteger(0, this.priceAnchorWindows.length)];

    if (!window) return null;

    const high = window.highPrices[window.highOffset];
    const low = window.lowPrices[window.lowOffset];
    const preferSideAnchor = Math.random() < 0.7;
    const anchor = preferSideAnchor === (side === "buy") ? low : high;

    return Number.isFinite(anchor) && anchor > 0 ? anchor : null;
  }

  private sampleSupportResistanceAnchor(side: OrderSide, candidatePrice: number, spread: PriceSpread): number | null {
    const settings = this.getSettings();
    const currentPrice = (spread.buy + spread.sell) / 2;

    if (!Number.isFinite(currentPrice) || currentPrice <= 0 || !Number.isFinite(candidatePrice)) return null;

    const priceMin = Math.min(spread.buy, spread.sell, candidatePrice);
    const priceMax = Math.max(spread.buy, spread.sell, candidatePrice);
    const padding = Math.max((priceMax - priceMin) * 0.5, currentPrice * 0.05);
    const rangeMin = Math.max(Number.MIN_VALUE, priceMin - padding);
    const rangeMax = priceMax + padding;
    const { cellHeight, sizes } = getOrderBookHistogramSeries(
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
  }

  private applyOrderPricePsychology(side: OrderSide, price: number): number {
    const settings = this.getSettings();

    if (!Number.isFinite(price) || price <= 0) return price;

    const spread = marketPriceSpread();
    this.updateRecentPriceAnchors(midPrice());

    let adjustedPrice = price;

    if (Math.random() < settings.anchorPreference) {
      const anchor = this.sampleRecentHighLowAnchor(side);

      if (anchor !== null) {
        adjustedPrice += (anchor - adjustedPrice) * sampleUniform(0.15, 0.6);
      }
    }

    if (Math.random() < settings.liquidityWallAnchorPreference) {
      const anchor = this.sampleSupportResistanceAnchor(side, adjustedPrice, spread);

      if (anchor !== null) {
        adjustedPrice = anchor;
      }
    }

    if (!this.isNearMidPrice(adjustedPrice, spread) && Math.random() < settings.roundPricePreference) {
      const step = this.roundPriceStep(adjustedPrice);

      if (step > 0) {
        adjustedPrice = Math.round(adjustedPrice / step) * step;
      }
    }

    return side === "buy" ? clamp(adjustedPrice, Number.MIN_VALUE, spread.buy) : Math.max(adjustedPrice, spread.sell);
  }
}
