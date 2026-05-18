import { type Accessor } from "solid-js";
import { type MarketState, type OrderSide } from "../market/index";
import { createCancellationState } from "./cancellation";
import { createOrderPlacementState } from "./orderPlacement";
import { type SimulationTimeState } from "./time";
import { type RestingOrder, type SimulationEventType } from "./types";
import { createSimulationEventStream } from "./eventStream";
import { assert } from "../utils";

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
  cancellation: {
    candidatesCount: Accessor<number>;
    ageWeight: Accessor<number>;
    priceMovement: {
      weight: Accessor<number>;
      recencyDecay: Accessor<number>;
    };
    localVolume: {
      weight: Accessor<number>;
      ramp: Accessor<number>;
    };
    farOrder: {
      weight: Accessor<number>;
      minAge: Accessor<number>;
      window: Accessor<number>;
      ramp: Accessor<number>;
    };
  };
  orderPlacement: {
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
  eventStream: {
    publicInterest: Accessor<number[]>;
    excitementDecay: Accessor<number[]>;
    excitationMatrix: Accessor<number[][]>;
  };
};

// TODO: Preference to place orders in the direction of the movement
// todo: Preference to place orders closer to spread?
export const createTradingSimulationState = (options: TradingSimulationOptions) => {
  const eventStream = createSimulationEventStream(options.eventStream);
  const cancellation = createCancellationState({
    market: options.market,
    time: options.time,
    onCancel: (order) => options.market.cancelOrder(order.id, order.side) !== null,
    ...options.cancellation,
  });

  const orderPlacement = createOrderPlacementState({
    market: options.market,
    time: options.time,
    ...options.orderPlacement,
  });

  const getCancellationRestingOrders = (side: OrderSide): RestingOrder[] => {
    return cancellation.getRestingOrders(side);
  };

  const simulateLimitOrderEvent = (side: OrderSide): void => {
    const restingOrder = orderPlacement.simulateLimitOrderEvent(side);
    assert(restingOrder !== null);
    cancellation.addOrder(restingOrder);
  };

  const simulateMarketOrderEvent = (side: OrderSide): void => {
    options.market.takeOrder(side, options.orderPlacement.sampleOrderSize());
  };

  const simulateEvent = (eventType: SimulationEventType, dt: number): void => {
    options.time.advance(dt);
    const [event, side] = eventType.split("-") as ["market" | "order" | "cancel", OrderSide];
    switch (event) {
      case "market":
        simulateMarketOrderEvent(side);
        break;
      case "order":
        simulateLimitOrderEvent(side);
        break;
      case "cancel":
        cancellation.simulate(side);
        break;
    }

    orderPlacement.updateRecentPriceAnchors();
  };

  // TODO: separate economy simulation model to allow for news impacts
  // TODO: separate market agent model to simulate individual behavior
  // TODO: Trading at certain times of the day
  // TODO: Trading character defined by what parameters and features a particular actor uses
  // TODO: external factors like news, events, reports, etc. All infer a "sentiment" of the market
  // TODO: add saturation of order book, so that once we hit that only cancels or market orders happen
  // TODO: macro laws?
  // https://chatgpt.com/c/69e01063-a9c8-8390-a2db-4f314b4d59f1
  const tick = (dt: number): void => {
    eventStream.sampleEvents(dt, simulateEvent);
  };

  return { getCancellationRestingOrders, tick };
};

export type TradingSimulation = ReturnType<typeof createTradingSimulationState>;
