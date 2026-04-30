import { takeOrder, type OrderSide } from "../market/index";
import { SimulationCancellation } from "./cancellation";
import { SimulationExcitation } from "./excitation";
import { SimulationOrderPlacement } from "./orderPlacement";
import {
  cloneMarketBehaviorSettings,
  defaultMarketBehaviorSettings,
  type MarketBehaviorSettings,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type SimulationEventSettingGroup,
  type SimulationEventType,
} from "./types";

export {
  defaultMarketBehaviorSettings,
  simulationTickTime,
  type MarketBehaviorSettings,
  type MarketEventSetting,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type SimulationEventSettingGroup,
} from "./types";

// TODO:  Preference to place orders in the direction of the movement
// TODO: in spread orders prob proportional to size of the spread
export class TradingSimulation {
  private marketBehaviorSettings = cloneMarketBehaviorSettings(defaultMarketBehaviorSettings);
  private orderPriceDistribution: OrderPriceDistribution = "power-law";
  private orderSizeDistribution: OrderSizeDistribution = "power-law";
  private excitation = new SimulationExcitation(() => this.marketBehaviorSettings);
  private cancellation = new SimulationCancellation(() => this.marketBehaviorSettings);
  private orderPlacement = new SimulationOrderPlacement(
    () => this.marketBehaviorSettings,
    () => this.orderPriceDistribution,
    () => this.orderSizeDistribution,
  );

  getMarketBehaviorSettings(): MarketBehaviorSettings {
    return cloneMarketBehaviorSettings(this.marketBehaviorSettings);
  }

  setMarketBehaviorSetting<Key extends keyof MarketBehaviorSettings>(
    key: Key,
    value: MarketBehaviorSettings[Key],
  ): void {
    this.marketBehaviorSettings = { ...this.marketBehaviorSettings, [key]: value };
  }

  setMarketBehaviorEventSetting(
    group: SimulationEventSettingGroup,
    eventType: SimulationEventType,
    value: number,
  ): void {
    this.marketBehaviorSettings = {
      ...this.marketBehaviorSettings,
      [group]: { ...this.marketBehaviorSettings[group], [eventType]: value },
    };
  }

  setOrderPriceDistribution(distribution: OrderPriceDistribution): void {
    this.orderPriceDistribution = distribution;
  }

  getOrderPriceDistribution(): OrderPriceDistribution {
    return this.orderPriceDistribution;
  }

  setOrderSizeDistribution(distribution: OrderSizeDistribution): void {
    this.orderSizeDistribution = distribution;
  }

  getOrderSizeDistribution(): OrderSizeDistribution {
    return this.orderSizeDistribution;
  }

  setCancellationTimeWeighting(weighting: number): void {
    this.cancellation.setCancellationTimeWeighting(weighting);
  }

  setCancellationPriceMovementWeighting(weighting: number): void {
    this.cancellation.setCancellationPriceMovementWeighting(weighting);
  }

  setCancellationLocalVolumeWeighting(weighting: number): void {
    this.cancellation.setCancellationLocalVolumeWeighting(weighting);
  }

  setCancellationFarOrderWeighting(weighting: number): void {
    this.cancellation.setCancellationFarOrderWeighting(weighting);
  }

  // TODO: separate economy simulation model to allow for news impacts
  // TODO: separate trading platform model for complex market behavior
  // TODO: separate market agent model to simulate individual behavior
  // TODO: Trading at certain times of the day
  // TODO: Trading character defined by what parameters and features a particular actor uses
  // TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
  // https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
  tick(dt: number): void {
    this.excitation.forEachEvent(dt, (eventType) => this.simulateEvent(eventType));
  }

  private simulateEvent(eventType: SimulationEventType): void {
    switch (eventType) {
      case "market-buy":
        this.simulateMarketOrderEvent("buy");
        break;
      case "market-sell":
        this.simulateMarketOrderEvent("sell");
        break;
      case "order-buy":
        this.simulateLimitOrderEvent("buy");
        break;
      case "order-sell":
        this.simulateLimitOrderEvent("sell");
        break;
      case "cancel-buy":
        this.cancellation.simulateCancellationEvent("buy");
        break;
      case "cancel-sell":
        this.cancellation.simulateCancellationEvent("sell");
        break;
    }

    this.orderPlacement.updateRecentPriceAnchors();
    this.cancellation.updateTouchPriceHistory();
  }

  private simulateLimitOrderEvent(side: OrderSide): void {
    const restingOrder = this.orderPlacement.simulateLimitOrderEvent(side);

    if (restingOrder !== null) {
      this.cancellation.trackRestingOrder(restingOrder);
    }
  }

  private simulateMarketOrderEvent(side: OrderSide): void {
    takeOrder(side, this.orderPlacement.sampleOrderSize());
  }
}
