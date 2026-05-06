import { createSignal } from "solid-js";
import { takeOrder, type OrderSide } from "../market/index";
import { createCancellationState } from "./cancellation";
import { SimulationExcitation } from "./excitation";
import { SimulationOrderPlacement } from "./orderPlacement";
import {
  cloneMarketBehaviorSettings,
  defaultMarketBehaviorSettings,
  type MarketBehaviorSettings,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type RestingOrder,
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

// TODO: Preference to place orders in the direction of the movement
// todo: Preference to place orders closer to spread?
export class TradingSimulation {
  private marketBehaviorSettings = cloneMarketBehaviorSettings(defaultMarketBehaviorSettings);
  private orderPriceDistribution: OrderPriceDistribution = "power-law";
  private orderSizeDistribution: OrderSizeDistribution = "power-law";
  private excitation = new SimulationExcitation(() => this.marketBehaviorSettings);
  private cancellationProbabilities = {
    time: createSignal(0.5),
    priceMovement: createSignal(0.5),
    localVolume: createSignal(0.5),
    farOrder: createSignal(0.5),
  };
  private cancellation = createCancellationState({
    ageWeight: this.cancellationProbabilities.time[0],
    priceMovement: {
      weight: this.cancellationProbabilities.priceMovement[0],
      recencyDecay: () => this.marketBehaviorSettings.cancellationPriceMovementOrderDecay,
    },
    localVolume: {
      weight: this.cancellationProbabilities.localVolume[0],
      ramp: () => this.marketBehaviorSettings.cancellationLocalVolumeRamp,
    },
    farOrder: {
      weight: this.cancellationProbabilities.farOrder[0],
      minAge: () => this.marketBehaviorSettings.cancellationFarOrderMinAge,
      window: () => this.marketBehaviorSettings.cancellationFarOrderWindow,
      ramp: () => this.marketBehaviorSettings.cancellationFarOrderRamp,
    },
  });
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

  getCancellationRestingOrders(side: OrderSide): RestingOrder[] {
    return this.cancellation.getRestingOrders(side);
  }

  setCancellationTimeWeighting(weighting: number): void {
    this.cancellationProbabilities.time[1](weighting);
  }

  setCancellationPriceMovementWeighting(weighting: number): void {
    this.cancellationProbabilities.priceMovement[1](weighting);
  }

  setCancellationLocalVolumeWeighting(weighting: number): void {
    this.cancellationProbabilities.localVolume[1](weighting);
  }

  setCancellationFarOrderWeighting(weighting: number): void {
    this.cancellationProbabilities.farOrder[1](weighting);
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
        this.cancellation.simulate("buy");
        break;
      case "cancel-sell":
        this.cancellation.simulate("sell");
        break;
    }

    this.orderPlacement.updateRecentPriceAnchors();
  }

  private simulateLimitOrderEvent(side: OrderSide): void {
    const restingOrder = this.orderPlacement.simulateLimitOrderEvent(side);

    if (restingOrder !== null) {
      this.cancellation.addOrder(restingOrder);
    }
  }

  private simulateMarketOrderEvent(side: OrderSide): void {
    takeOrder(side, this.orderPlacement.sampleOrderSize());
  }
}
