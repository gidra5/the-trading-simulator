import { createSignal } from "solid-js";
import { type MarketState, type OrderSide } from "../market/index";
import { createCancellationState } from "./cancellation";
import { createSimulationExcitationState } from "./excitation";
import { createSimulationOrderPlacementState } from "./orderPlacement";
import { type SimulationTimeState } from "./time";
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

type TradingSimulationOptions = {
  market: MarketState;
  time: SimulationTimeState;
};

// TODO: Preference to place orders in the direction of the movement
// todo: Preference to place orders closer to spread?
export const createTradingSimulationState = (options: TradingSimulationOptions) => {
  let marketBehaviorSettings = cloneMarketBehaviorSettings(defaultMarketBehaviorSettings);
  let orderPriceDistribution: OrderPriceDistribution = "power-law";
  let orderSizeDistribution: OrderSizeDistribution = "power-law";
  const cancellationProbabilities = {
    time: createSignal(0.5),
    priceMovement: createSignal(0.5),
    localVolume: createSignal(0.5),
    farOrder: createSignal(0.5),
  };

  const getMarketBehaviorSettings = (): MarketBehaviorSettings => {
    return cloneMarketBehaviorSettings(marketBehaviorSettings);
  };

  const setMarketBehaviorSetting = <Key extends keyof MarketBehaviorSettings>(
    key: Key,
    value: MarketBehaviorSettings[Key],
  ): void => {
    marketBehaviorSettings = { ...marketBehaviorSettings, [key]: value };
  };

  const setMarketBehaviorEventSetting = (
    group: SimulationEventSettingGroup,
    eventType: SimulationEventType,
    value: number,
  ): void => {
    marketBehaviorSettings = {
      ...marketBehaviorSettings,
      [group]: { ...marketBehaviorSettings[group], [eventType]: value },
    };
  };

  const setOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
    orderPriceDistribution = distribution;
  };

  const getOrderPriceDistribution = (): OrderPriceDistribution => {
    return orderPriceDistribution;
  };

  const setOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
    orderSizeDistribution = distribution;
  };

  const getOrderSizeDistribution = (): OrderSizeDistribution => {
    return orderSizeDistribution;
  };

  const excitation = createSimulationExcitationState({
    getSettings: () => marketBehaviorSettings,
  });
  const cancellation = createCancellationState({
    market: options.market,
    time: options.time,
    candidatesCount: () => 64,
    onCancel: (order) => options.market.cancelOrder(order.id, order.side) !== null,

    ageWeight: cancellationProbabilities.time[0],
    priceMovement: {
      weight: cancellationProbabilities.priceMovement[0],
      recencyDecay: () => marketBehaviorSettings.cancellationPriceMovementOrderDecay,
    },
    localVolume: {
      weight: cancellationProbabilities.localVolume[0],
      ramp: () => marketBehaviorSettings.cancellationLocalVolumeRamp,
    },
    farOrder: {
      weight: cancellationProbabilities.farOrder[0],
      minAge: () => marketBehaviorSettings.cancellationFarOrderMinAge,
      window: () => marketBehaviorSettings.cancellationFarOrderWindow,
      ramp: () => marketBehaviorSettings.cancellationFarOrderRamp,
    },
  });
  const orderPlacement = createSimulationOrderPlacementState({
    getSettings: () => marketBehaviorSettings,
    getOrderPriceDistribution: () => orderPriceDistribution,
    getOrderSizeDistribution: () => orderSizeDistribution,
    market: options.market,
    time: options.time,
  });

  const getCancellationRestingOrders = (side: OrderSide): RestingOrder[] => {
    return cancellation.getRestingOrders(side);
  };

  const setCancellationTimeWeighting = (weighting: number): void => {
    cancellationProbabilities.time[1](weighting);
  };

  const setCancellationPriceMovementWeighting = (weighting: number): void => {
    cancellationProbabilities.priceMovement[1](weighting);
  };

  const setCancellationLocalVolumeWeighting = (weighting: number): void => {
    cancellationProbabilities.localVolume[1](weighting);
  };

  const setCancellationFarOrderWeighting = (weighting: number): void => {
    cancellationProbabilities.farOrder[1](weighting);
  };

  const simulateLimitOrderEvent = (side: OrderSide): void => {
    const restingOrder = orderPlacement.simulateLimitOrderEvent(side);

    if (restingOrder !== null) {
      cancellation.addOrder(restingOrder);
    }
  };

  const simulateMarketOrderEvent = (side: OrderSide): void => {
    options.market.takeOrder(side, orderPlacement.sampleOrderSize());
  };

  const simulateEvent = (eventType: SimulationEventType): void => {
    switch (eventType) {
      case "market-buy":
        simulateMarketOrderEvent("buy");
        break;
      case "market-sell":
        simulateMarketOrderEvent("sell");
        break;
      case "order-buy":
        simulateLimitOrderEvent("buy");
        break;
      case "order-sell":
        simulateLimitOrderEvent("sell");
        break;
      case "cancel-buy":
        cancellation.simulate("buy");
        break;
      case "cancel-sell":
        cancellation.simulate("sell");
        break;
    }

    orderPlacement.updateRecentPriceAnchors();
  };

  // TODO: separate economy simulation model to allow for news impacts
  // TODO: separate trading platform model for complex market behavior
  // TODO: separate market agent model to simulate individual behavior
  // TODO: Trading at certain times of the day
  // TODO: Trading character defined by what parameters and features a particular actor uses
  // TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
  // TODO: add saturation of order book, so that once we hit that only cancels or market orders happen
  // TODO: macro laws?
  // https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
  const tick = (dt: number): void => {
    options.time.advance(dt);
    excitation.forEachEvent(dt, simulateEvent);
  };

  return {
    getCancellationRestingOrders,
    getMarketBehaviorSettings,
    getOrderPriceDistribution,
    getOrderSizeDistribution,
    setCancellationFarOrderWeighting,
    setCancellationLocalVolumeWeighting,
    setCancellationPriceMovementWeighting,
    setCancellationTimeWeighting,
    setMarketBehaviorEventSetting,
    setMarketBehaviorSetting,
    setOrderPriceDistribution,
    setOrderSizeDistribution,
    tick,
  };
};

export type TradingSimulation = ReturnType<typeof createTradingSimulationState>;
