import { cancelOrder, hasOrder, marketPriceSpread, type OrderSide } from "../market/index";
import { sampleBernoulli, sampleUniform, sampleUniformInteger } from "../distributions";
import { assert, clamp } from "../utils";
import type { MarketBehaviorSettings, PricePoint, RestingOrder } from "./types";

export class SimulationCancellation {
  private cancellationTimeWeighting = 0.5;
  private cancellationPriceMovementWeighting = 0.5;
  private cancellationLocalVolumeWeighting = 0.5;
  private cancellationFarOrderWeighting = 0.5;
  private restingOrdersBySide: Record<OrderSide, RestingOrder[]> = {
    buy: [],
    sell: [],
  };
  private touchPriceHistory: Record<OrderSide, PricePoint[]> = {
    buy: [],
    sell: [],
  };
  private touchPriceHistoryOffset: Record<OrderSide, number> = {
    buy: 0,
    sell: 0,
  };

  constructor(private getSettings: () => MarketBehaviorSettings) {}

  setCancellationTimeWeighting(weighting: number): void {
    this.cancellationTimeWeighting = clamp(weighting, 0, 1);
  }

  setCancellationPriceMovementWeighting(weighting: number): void {
    this.cancellationPriceMovementWeighting = clamp(weighting, 0, 1);
  }

  setCancellationLocalVolumeWeighting(weighting: number): void {
    this.cancellationLocalVolumeWeighting = clamp(weighting, 0, 1);
  }

  setCancellationFarOrderWeighting(weighting: number): void {
    this.cancellationFarOrderWeighting = clamp(weighting, 0, 1);
  }

  trackRestingOrder(order: RestingOrder): void {
    this.restingOrdersBySide[order.side].push(order);
  }

  simulateCancellationEvent(side: OrderSide): boolean {
    const candidate = this.randomRestingOrder(
      side,
      sampleBernoulli(this.cancellationTimeWeighting),
      sampleBernoulli(this.cancellationPriceMovementWeighting),
      sampleBernoulli(this.cancellationLocalVolumeWeighting),
      sampleBernoulli(this.cancellationFarOrderWeighting),
    );

    if (!candidate) return false;

    this.removeRestingOrder(candidate.order.side, candidate.index);
    return cancelOrder(candidate.order.id, candidate.order.side) !== null;
  }

  updateTouchPriceHistory(spread = marketPriceSpread(), time = Date.now()): void {
    const expiresBefore = time - this.getSettings().cancellationPriceMovementWindow;

    for (const side of ["buy", "sell"] as const) {
      const price = spread[side];

      if (!Number.isFinite(price) || price <= 0) continue;

      const history = this.touchPriceHistory[side];
      history.push({ time, price });

      while (
        this.touchPriceHistoryOffset[side] + 1 < history.length &&
        history[this.touchPriceHistoryOffset[side] + 1]!.time <= expiresBefore
      ) {
        this.touchPriceHistoryOffset[side] += 1;
      }

      this.touchPriceHistoryOffset[side] = this.compactPricePoints(history, this.touchPriceHistoryOffset[side]);
    }
  }

  private removeRestingOrder(side: OrderSide, index: number): RestingOrder {
    const [order] = this.restingOrdersBySide[side].splice(index, 1);
    assert(order, "Expected tracked resting order to exist");

    return order;
  }

  private priceMovedAwayFromOrder(order: RestingOrder, spread = marketPriceSpread()): boolean {
    const currentTouch = spread[order.side];
    const previousTouch = this.touchPriceHistory[order.side][this.touchPriceHistoryOffset[order.side]]?.price;

    if (!Number.isFinite(currentTouch) || currentTouch <= 0 || !Number.isFinite(previousTouch) || previousTouch <= 0) {
      return false;
    }

    const currentDistance = Math.abs(currentTouch - order.price) / currentTouch;

    if (currentDistance > this.getSettings().cancellationNearTouchDistance) return false;

    const previousDistance = Math.abs(previousTouch - order.price) / previousTouch;

    return currentDistance > previousDistance;
  }

  private compactPricePoints(points: PricePoint[], offset: number): number {
    if (offset < 64 || offset * 2 < points.length) return offset;

    points.splice(0, offset);
    return 0;
  }

  private farOrderCancellationProbability(order: RestingOrder, now = Date.now(), spread = marketPriceSpread()): number {
    const settings = this.getSettings();

    if (now - order.createdAt < settings.cancellationFarOrderMinAge) return 0;

    const midPrice = (spread.buy + spread.sell) / 2;

    if (!Number.isFinite(midPrice) || midPrice <= 0) return 0;

    const distance = Math.abs(order.price - midPrice) / midPrice;
    const excessDistance = distance - settings.cancellationFarOrderWindow;

    if (excessDistance <= 0) return 0;

    return 1 - Math.exp(-excessDistance / settings.cancellationFarOrderRamp);
  }

  private randomRestingOrder(
    side: OrderSide,
    weightByAge = false,
    weightByPriceMovement = false,
    weightByLocalVolume = false,
    weightByFarOrder = false,
  ): {
    order: RestingOrder;
    index: number;
  } | null {
    const restingOrders = this.restingOrdersBySide[side];

    for (let index = restingOrders.length - 1; index >= 0; index -= 1) {
      const order = restingOrders[index];

      if (!order || !hasOrder(order.id, order.side)) {
        this.removeRestingOrder(side, index);
      }
    }

    const candidates = restingOrders.map((order, index) => ({ order, index }));

    if (candidates.length === 0) return null;

    const settings = this.getSettings();
    const now = Date.now();
    const spread = marketPriceSpread();
    const localVolumeByCandidateIndex = new Map<number, number>();

    if (weightByLocalVolume) {
      const priceSortedCandidates = [...candidates].sort((left, right) => left.order.price - right.order.price);
      let leftIndex = 0;
      let rightIndex = 0;
      let localVolume = 0;

      for (let index = 0; index < priceSortedCandidates.length; index += 1) {
        const candidate = priceSortedCandidates[index]!;
        const minPrice = candidate.order.price * (1 - settings.cancellationLocalVolumeWindow);
        const maxPrice = candidate.order.price * (1 + settings.cancellationLocalVolumeWindow);

        while (
          rightIndex < priceSortedCandidates.length &&
          priceSortedCandidates[rightIndex]!.order.price <= maxPrice
        ) {
          localVolume += priceSortedCandidates[rightIndex]!.order.size;
          rightIndex += 1;
        }

        while (leftIndex < priceSortedCandidates.length && priceSortedCandidates[leftIndex]!.order.price < minPrice) {
          localVolume -= priceSortedCandidates[leftIndex]!.order.size;
          leftIndex += 1;
        }

        localVolumeByCandidateIndex.set(candidate.index, Math.max(Number.EPSILON, localVolume));
      }
    }

    const candidateWeight = (candidate: { order: RestingOrder; index: number }): number => {
      let weight = weightByLocalVolume ? (localVolumeByCandidateIndex.get(candidate.index) ?? Number.EPSILON) : 1;

      if (weightByPriceMovement && this.priceMovedAwayFromOrder(candidate.order, spread)) {
        const age = Math.max(0, now - candidate.order.createdAt);
        const recency = Math.exp(-age / settings.cancellationPriceMovementOrderDecay);

        weight *= 1 + (settings.cancellationPriceMovementBoost - 1) * recency;
      }

      if (weightByFarOrder) {
        weight *= this.farOrderCancellationProbability(candidate.order, now, spread);
      }

      if (weightByAge) {
        weight *= Math.max(1, now - candidate.order.createdAt);
      }

      return weight;
    };
    let totalWeight = 0;

    for (const candidate of candidates) {
      totalWeight += candidateWeight(candidate);
    }

    if (totalWeight <= 0) return null;

    let targetWeight = sampleUniform(0, totalWeight);

    for (const candidate of candidates) {
      targetWeight -= candidateWeight(candidate);

      if (targetWeight <= 0) return candidate;
    }

    return candidates[sampleUniformInteger(0, candidates.length)] ?? null;
  }
}
