import { type Accessor } from "solid-js";
import type { Distributions } from "../distributions";
import { type MarketState, type OrderSide } from "../market/index";
import { assert, binarySearchIndex, createCleanupScope } from "../utils";
import { createCancellationState } from "./cancellation";
import { createOrderPlacementState, type SimulationOrderPlacementOptions } from "./orderPlacement";
import { type SimulationTimeState } from "./time";
import { eventVector, simulationEventTypes as events, type RestingOrder, type SimulationEventType } from "./types";
import type { OrderBookChange } from "../market/orderBook";

export {
  defaultMarketModelSettings,
  simulationTickTime,
  type MarketModelSettings,
  type MarketEventSetting,
  type OrderPriceDistribution,
  type OrderSelectionDistribution,
  type OrderSizeDistribution,
  type SimulationEventType,
  type SimulationExcitationMatrix,
  type SimulationEventSettingGroup,
  type SimulationEventVector,
} from "./types";

type TradingSimulationOptions = {
  market: MarketState;
  time: SimulationTimeState;
  cancellation: {
    candidatesCount: Accessor<number>;
    sampleOrderIndex: (orderCount: number) => number;
  };
  orderPlacement: Omit<SimulationOrderPlacementOptions, "market" | "time">;
  eventStream: {
    baselineActivity: Accessor<number[]>;
    excitementDecay: Accessor<number[]>;
    excitationMatrix: Accessor<number[][]>;
    distributions: Pick<Distributions, "sampleMultivariateHawkesProcessEventTypes">;
  };
};

export type TradingSimulationSnapshot = {
  ownedOrders: OwnedOrdersSnapshot;
  excitedInterest: number[];
};

export type OwnedOrders = { buy: RestingOrder[]; sell: RestingOrder[] };
type SubscribeToOrder = (id: number, callback: (change: OrderBookChange) => void) => VoidFunction | void;

export type OwnedOrdersSnapshot = {
  orders: OwnedOrders;
};

const cloneRestingOrder = (order: RestingOrder): RestingOrder => ({ ...order });
const cloneRestingOrders = (orders: OwnedOrders): OwnedOrders => ({
  buy: orders.buy.map(cloneRestingOrder),
  sell: orders.sell.map(cloneRestingOrder),
});

const createOwnedOrders = (subscribeToOrder: SubscribeToOrder) => {
  const _orders: OwnedOrders = { buy: [], sell: [] };
  const subscriptionScope = createCleanupScope();
  const subscribedOrderIds = new Set<number>();

  const remove = (side: OrderSide, order: { id: number; price: number }): boolean => {
    const orders = _orders[side];
    let idx = binarySearchIndex(orders, (candidate) => candidate.price - order.price);
    if (idx >= orders.length) return false;

    while (idx < orders.length && orders[idx]!.price === order.price && orders[idx]!.id !== order.id) idx += 1;
    if (idx >= orders.length || orders[idx]!.price !== order.price) return false;

    _orders[side].splice(idx, 1);
    subscribedOrderIds.delete(order.id);
    return true;
  };

  const add = (order: RestingOrder): void => {
    const orders = _orders[order.side];
    const idx = binarySearchIndex(orders, (candidate) => candidate.price - order.price);
    orders.splice(idx, 0, cloneRestingOrder(order));

    if (subscribedOrderIds.has(order.id)) return;

    subscribedOrderIds.add(order.id);
    subscriptionScope.run(() =>
      subscribeToOrder(order.id, (change) => {
        if (change.kind !== "remove") return;
        remove(change.side, change.order);
      }),
    );
  };

  const orders = () => cloneRestingOrders(_orders);

  const snapshot = (): OwnedOrdersSnapshot => ({
    orders: cloneRestingOrders(_orders),
  });

  const restore = (snapshot: OwnedOrdersSnapshot): void => {
    subscriptionScope.reset();
    subscribedOrderIds.clear();
    _orders.buy = [];
    _orders.sell = [];

    for (const order of snapshot.orders.buy) add(order);
    for (const order of snapshot.orders.sell) add(order);
  };

  return {
    orders,
    add,
    remove,
    restore,
    snapshot,
  };
};

// TODO: Preference to place orders in the direction of the movement
// todo: Preference to place orders closer to spread?
export const createTradingSimulationState = (options: TradingSimulationOptions) => {
  const ownedOrders = createOwnedOrders(options.market.subscribeToOrder);
  let excitedInterest = eventVector({
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": 0,
    "cancel-buy": 0,
    "cancel-sell": 0,
  });

  const cancellation = createCancellationState({
    ownedOrders: ownedOrders.orders,
    removeOrder: (order) => ownedOrders.remove(order.side, order),
    onCancel: (order) => options.market.cancelOrder(order.id, order.side) !== null,
    ...options.cancellation,
  });

  const orderPlacement = createOrderPlacementState({
    market: options.market,
    time: options.time,
    ...options.orderPlacement,
  });

  const simulateLimitOrderEvent = (side: OrderSide): void => {
    const restingOrder = orderPlacement.simulateLimitOrderEvent(side);
    assert(restingOrder !== null);
    ownedOrders.add(restingOrder);
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
    let elapsed = 0;

    // todo: return elapsed instead of tracking it manually
    options.eventStream.distributions.sampleMultivariateHawkesProcessEventTypes(
      options.eventStream.baselineActivity(),
      options.eventStream.excitationMatrix(),
      options.eventStream.excitementDecay(),
      dt,
      excitedInterest,
      (index, dt) => {
        const event = events[index];
        assert(event !== undefined);

        elapsed += dt;
        simulateEvent(event, dt);
      },
    );

    if (elapsed < dt) options.time.advance(dt - elapsed);
  };

  const snapshot = (): TradingSimulationSnapshot => ({
    ownedOrders: ownedOrders.snapshot(),
    excitedInterest: [...excitedInterest],
  });

  const restore = (snapshot: TradingSimulationSnapshot): void => {
    excitedInterest = [...snapshot.excitedInterest];
    ownedOrders.restore(snapshot.ownedOrders);
  };

  return { ownedOrders: ownedOrders.orders, restore, snapshot, tick };
};

export type TradingSimulation = ReturnType<typeof createTradingSimulationState>;
