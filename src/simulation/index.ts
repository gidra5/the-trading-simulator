import { type Accessor } from "solid-js";
import type { Distributions } from "../distributions";
import { type MarketState, type OrderSide } from "../market/index";
import { assert, binarySearchIndex, createCleanupScope } from "../utils";
import {
  createSimulationCapitalState,
  type SimulationCapitalPair,
  type SimulationCapitalSnapshot,
  type SimulationCapitalState,
} from "./capital";
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
  initialCapital: SimulationCapitalPair;
  cancellation: {
    candidatesCount: Accessor<number>;
    sampleOrderIndex: (orderCount: number) => number;
  };
  orderPlacement: Omit<SimulationOrderPlacementOptions, "capital" | "market" | "time">;
  eventStream: {
    applyMarketParameterEvents: (dt: number, capital: SimulationCapitalState) => void;
    baselineActivity: Accessor<number[]>;
    excitementDecay: Accessor<number[]>;
    excitationMatrix: Accessor<number[][]>;
    distributions: Pick<Distributions, "sampleMultivariateHawkesProcessEventTypes">;
  };
};

export type TradingSimulationSnapshot = {
  capital: SimulationCapitalSnapshot;
  ownedOrders: OwnedOrdersSnapshot;
  excitedInterest: number[];
};

export type OwnedOrders = { buy: RestingOrder[]; sell: RestingOrder[] };
type SubscribeToOrder = (id: number, callback: (change: OrderBookChange) => void) => VoidFunction | void;
type OwnedOrderChangeHandler = (change: OrderBookChange) => void;

export type OwnedOrdersSnapshot = {
  orders: OwnedOrders;
};

const cloneRestingOrder = (order: RestingOrder): RestingOrder => ({ ...order });
const cloneRestingOrders = (orders: OwnedOrders): OwnedOrders => ({
  buy: orders.buy.map(cloneRestingOrder),
  sell: orders.sell.map(cloneRestingOrder),
});

const createOwnedOrders = (subscribeToOrder: SubscribeToOrder, onOwnedOrderChange: OwnedOrderChangeHandler) => {
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

  const update = (side: OrderSide, order: { id: number; price: number; size: number }): boolean => {
    const orders = _orders[side];
    let idx = binarySearchIndex(orders, (candidate) => candidate.price - order.price);
    if (idx >= orders.length) return false;

    while (idx < orders.length && orders[idx]!.price === order.price && orders[idx]!.id !== order.id) idx += 1;
    if (idx >= orders.length || orders[idx]!.price !== order.price) return false;

    orders[idx] = { ...orders[idx]!, size: order.size };
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
        if (change.kind === "partial-fill") {
          if (update(change.side, change.order)) onOwnedOrderChange(change);
          return;
        }

        if (remove(change.side, change.order)) onOwnedOrderChange(change);
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
  const capital = createSimulationCapitalState(options.initialCapital);
  const ownedOrders = createOwnedOrders(options.market.subscribeToOrder, capital.applyOwnedOrderChange);
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
    shouldCancel: (side) => options.orderPlacement.distributions.sampleBernoulli(capital.reservedFraction(side)),
    onCancel: (order) => {
      const canceled = options.market.cancelOrder(order.id, order.side);
      if (!canceled) return false;

      capital.recoverLimitOrder({ ...order, size: canceled.size });
      return true;
    },
    ...options.cancellation,
  });

  const orderPlacement = createOrderPlacementState({
    market: options.market,
    time: options.time,
    capital,
    ...options.orderPlacement,
  });

  const simulateLimitOrderEvent = (side: OrderSide): void => {
    const restingOrder = orderPlacement.simulateLimitOrderEvent(side);
    if (!restingOrder) return;

    capital.reserveLimitOrder(restingOrder);
    ownedOrders.add(restingOrder);
  };

  const simulateMarketOrderEvent = (side: OrderSide): void => {
    const size = affordableMarketOrderSize(side, options.orderPlacement.sampleOrderSize());
    if (size <= 0) return;

    const result = options.market.takeOrder(side, size);
    capital.applySimulatedMarketFill(side, result.fulfilled, result.cost);
  };

  const affordableMarketOrderSize = (side: OrderSide, size: number): number => {
    if (side === "sell") return Math.min(size, capital.free.Stock());

    let affordableSize = 0;
    let cost = 0;
    const orders = options.market.orderBook().sell;
    let orderIndex = orders.length - 1;

    while (affordableSize < size) {
      const order = orders[orderIndex];
      if (!order) return affordableSize;

      const nextSize = Math.min(order.size, size - affordableSize);
      if (cost + nextSize * order.price > capital.free.Money()) {
        return affordableSize + (capital.free.Money() - cost) / order.price;
      }

      affordableSize += nextSize;
      cost += nextSize * order.price;
      orderIndex -= 1;
    }

    return affordableSize;
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
    options.eventStream.applyMarketParameterEvents(dt, capital);

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
    capital: capital.snapshot(),
    ownedOrders: ownedOrders.snapshot(),
    excitedInterest: [...excitedInterest],
  });

  const restore = (snapshot: TradingSimulationSnapshot): void => {
    excitedInterest = [...snapshot.excitedInterest];
    capital.restore(snapshot.capital);
    ownedOrders.restore(snapshot.ownedOrders);
  };

  return { capital, ownedOrders: ownedOrders.orders, restore, snapshot, tick };
};

export type TradingSimulation = ReturnType<typeof createTradingSimulationState>;
