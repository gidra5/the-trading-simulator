import { batch, createEffect, createMemo, createSignal, untrack, type Accessor } from "solid-js";
import { type MarketState, type OrderSide } from "../market";
import { oppositeSide } from "../market/order";
import { type SimulationTimeState } from "../simulation/time";
import type { ProgressionState } from "../progression/interface";
import { ProgressionMetric, ProgressionNode } from "../progression/data";
import { createCleanupScope } from "../utils";

let nextAccountId = 0;

export const assets = ["Money", "Stock"] as const;
export type Asset = (typeof assets)[number];
export type AssetPair = { buy: Asset; sell: Asset };

type Portfolio = Record<Asset, number>;
type PendingOrder = {
  id: number;
  side: OrderSide;
  price: number;
  initialSize: number;
  size: number;
  createdAt: number;
};
type OrderHistoryEntry = {
  id: number;
  orderId: number;
  kind: "submitted" | "partial-fill" | "filled" | "canceled" | "liquidation";
  side: OrderSide;
  size: number;
  price: number | null;
  cost: number;
  timestamp: number;
};

type OrderHistorySnapshot = {
  entries: OrderHistoryEntry[];
  nextEntryId: number;
};

export type AccountSnapshot = {
  activeOrders: PendingOrder[];
  orderHistory: OrderHistorySnapshot;
  portfolio: Portfolio;
};

type AccountStateOptions = {
  progression: ProgressionState;
  market: MarketState;
  time: SimulationTimeState;
  feeRate: Accessor<number>;
  debtCapitalizationRate: Accessor<number>;
  maintenanceMargin: Accessor<number>;
};

const clonePendingOrder = (order: PendingOrder): PendingOrder => ({ ...order });
const cloneOrderHistoryEntry = (entry: OrderHistoryEntry): OrderHistoryEntry => ({ ...entry });

const createOrderHistory = (time: Accessor<number>) => {
  let nextEntryId = 0;
  const [entries, setEntries] = createSignal<OrderHistoryEntry[]>([]);

  const record = (entry: Omit<OrderHistoryEntry, "id" | "timestamp">): void => {
    const historyEntry = { ...entry, id: nextEntryId++, timestamp: time() };
    setEntries((current) => [historyEntry, ...current]);
  };

  const snapshot = (): OrderHistorySnapshot => ({
    entries: entries().map(cloneOrderHistoryEntry),
    nextEntryId,
  });

  const restore = (snapshot: OrderHistorySnapshot): void => {
    nextEntryId = snapshot.nextEntryId;
    setEntries(snapshot.entries.map(cloneOrderHistoryEntry));
  };

  return {
    entries,
    restore,
    snapshot,
    submitted: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind" | "cost">): void =>
      record({ ...entry, kind: "submitted", cost: 0 }),
    partialFill: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void =>
      record({ ...entry, kind: "partial-fill" }),
    filled: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void => record({ ...entry, kind: "filled" }),
    canceled: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind" | "cost">): void =>
      record({ ...entry, kind: "canceled", cost: 0 }),
    liquidation: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void =>
      record({ ...entry, kind: "liquidation" }),
  };
};

export type Account = ReturnType<typeof createAccount>;
export const createAccount = (options: AccountStateOptions) => {
  const market = options.market;
  const timeState = options.time;
  const id = nextAccountId++;
  const orderHistory = createOrderHistory(timeState.time);
  const [portfolio, setPortfolio] = createSignal<Portfolio>({ Money: 0, Stock: 0 });
  const [activeOrders, setActiveOrders] = createSignal<PendingOrder[]>([]);
  const activeOrderSubscriptionScope = createCleanupScope();
  const subscribedActiveOrderIds = new Set<number>();
  const reservedPortfolio = createMemo(() => {
    const reserved = { Money: 0, Stock: 0 };

    for (const order of activeOrders()) {
      if (order.side === "buy") reserved.Money -= order.price * order.size;
      else reserved.Stock -= order.size;
    }
    return reserved;
  });
  const availablePortfolio = () => ({
    Money: portfolio().Money - reservedPortfolio().Money,
    Stock: portfolio().Stock - reservedPortfolio().Stock,
  });
  let isLiquidating = false;

  const owned = () => ({
    Money: Math.max(0, portfolio().Money),
    Stock: Math.max(0, portfolio().Stock),
  });
  const debt = () => ({
    Money: Math.max(0, -portfolio().Money),
    Stock: Math.max(0, -portfolio().Stock),
  });
  const borrowed = () => debt().Money + debt().Stock * market.marketPriceSpread().buy;
  const capital = () => owned().Money + owned().Stock * market.marketPriceSpread().sell;
  const netWorth = () => capital() - borrowed();
  const leverage = () => capital() / (netWorth() + Number.EPSILON);
  const liquidationPrice = () => {
    if (portfolio().Stock === 0) return null;
    return -portfolio().Money / (portfolio().Stock * (1 - options.maintenanceMargin() * Math.sign(portfolio().Stock)));
  };

  const gates = {
    liquidationHistory: () => options.progression.isComplete(ProgressionNode.LiquidationJournaling),
    orderHistory: () => options.progression.isComplete(ProgressionNode.Journaling),
    debt: () => options.progression.isComplete(ProgressionNode.TradingLeverage),
    limitOrders: () => options.progression.isComplete(ProgressionNode.TradingAdvanced),
  };

  const tracking = {
    trade: () => options.progression.addMetric(ProgressionMetric.Trades, 1),
    liquidation: (dt: number) => options.progression.addMetric(ProgressionMetric.LeveragedTime, dt),
  };

  createEffect(() => {
    if (portfolio().Money < 0 || portfolio().Stock < 0) {
      const dt = options.time.dt();
      tracking.liquidation(dt);
    }
  });

  const updatePortfolio = (size: number, moneyDelta: number): void => {
    setPortfolio((current) => ({
      Stock: current.Stock + size,
      Money: current.Money + moneyDelta,
    }));
  };

  const addMoney = (amount: number): void => {
    updatePortfolio(0, amount);
  };

  const trackOrderHistory = (record: () => void): void => {
    if (gates.orderHistory()) record();
  };

  const trackLiquidationHistory = (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void => {
    if (gates.liquidationHistory()) orderHistory.liquidation(entry);
  };

  const estimateOrderCost = (side: OrderSide, size: number, price?: number): number => {
    let cost = 0;
    let fulfilled = 0;
    const orders = market.orderBook()[oppositeSide(side)];
    let orderIndex = orders.length - 1;

    while (fulfilled < size) {
      const order = orders[orderIndex];
      if (!order) return cost;
      if (price !== undefined && side === "buy" && order.price > price) return cost;
      if (price !== undefined && side === "sell" && order.price < price) return cost;

      const sizeToFulfill = Math.min(order.size, size - fulfilled);
      fulfilled += sizeToFulfill;
      cost += order.price * sizeToFulfill;
      orderIndex -= 1;
    }

    return cost;
  };

  const canPlaceOrder = (side: OrderSide, size: number, price?: number): boolean => {
    if (gates.debt()) return true;

    const available = availablePortfolio();
    if (side === "sell") return available.Stock >= size;

    const cost = price === undefined ? estimateOrderCost(side, size) : price * size;
    return available.Money >= cost;
  };

  const applyFill = (side: OrderSide, fulfilled: number, cost: number): void => {
    if (fulfilled <= 0) return;

    if (side === "buy") updatePortfolio(fulfilled * (1 - options.feeRate()), -cost);
    else updatePortfolio(-fulfilled, cost * (1 - options.feeRate()));
  };

  const removeActiveOrder = (id: number): void => {
    subscribedActiveOrderIds.delete(id);
    setActiveOrders((current) => current.filter((order) => order.id !== id));
  };

  const setActiveOrder = (order: PendingOrder): void => {
    setActiveOrders((current) => {
      const index = current.findIndex((pending) => pending.id === order.id);
      if (index === -1) return [...current, clonePendingOrder(order)];

      const next = [...current];
      next[index] = clonePendingOrder(order);
      return next;
    });
  };

  const trackActiveOrder = (order: PendingOrder): void => {
    setActiveOrder(order);
    if (subscribedActiveOrderIds.has(order.id)) return;

    subscribedActiveOrderIds.add(order.id);
    activeOrderSubscriptionScope.run(() =>
      market.subscribeToOrder(order.id, (change) => {
        if (change.kind === "add") {
          trackActiveOrder({ ...order, size: change.order.size });
          return;
        }

        if (change.kind === "remove") subscribedActiveOrderIds.delete(change.order.id);

        const pending = activeOrders().find((order) => order.id === change.order.id);
        if (!pending) return;
        if (change.kind === "remove") {
          const filled = change.order.size;
          const cost = filled * change.order.price;
          removeActiveOrder(change.order.id);
          applyFill(change.side, change.order.size, cost);
          tracking.trade();
          trackOrderHistory(() =>
            orderHistory.filled({
              orderId: change.order.id,
              side: change.side,
              size: change.order.size,
              price: change.order.price,
              cost,
            }),
          );
          return;
        }

        const filled = change.prevSize - change.order.size;
        const cost = filled * change.order.price;
        applyFill(pending.side, filled, cost);
        tracking.trade();
        trackOrderHistory(() =>
          orderHistory.partialFill({
            orderId: change.order.id,
            side: change.side,
            size: filled,
            price: change.order.price,
            cost,
          }),
        );

        setActiveOrder({ ...pending, size: change.order.size });
      }),
    );
  };

  const cancelActiveOrder = (order: PendingOrder): void => {
    removeActiveOrder(order.id);
    market.cancelOrder(order.id, order.side);
    trackOrderHistory(() =>
      orderHistory.canceled({
        orderId: order.id,
        side: order.side,
        size: order.size,
        price: order.price,
      }),
    );
  };

  const placeMarketOrder = (side: OrderSide, size: number): void => {
    if (size <= 0) return;
    if (!canPlaceOrder(side, size)) return;

    const result = market.takeOrder(side, size);
    applyFill(side, result.fulfilled, result.cost);
    if (result.fulfilled > 0) {
      tracking.trade();
      trackOrderHistory(() =>
        orderHistory.filled({
          orderId: result.id,
          side,
          size: result.fulfilled,
          price: result.cost / result.fulfilled,
          cost: result.cost,
        }),
      );
    }
  };

  const placeLimitOrder = (side: OrderSide, price: number, size: number): void => {
    if (price <= 0 || size <= 0) return;
    if (!gates.limitOrders()) return;
    if (!canPlaceOrder(side, size, price)) return;

    const result = market.makeOrder(side, { price, size });

    applyFill(side, result.fulfilled, result.cost);
    trackOrderHistory(() => orderHistory.submitted({ orderId: result.order.id, side, size, price }));
    if (result.fulfilled > 0) {
      tracking.trade();
      const entry = {
        orderId: result.order.id,
        side,
        size: result.fulfilled,
        price: result.cost / result.fulfilled,
        cost: result.cost,
      };
      if (result.order.size > 0) trackOrderHistory(() => orderHistory.partialFill(entry));
      else trackOrderHistory(() => orderHistory.filled(entry));
    }
    if (result.order.size === 0) return;

    trackActiveOrder({
      id: result.order.id,
      side,
      price,
      initialSize: size,
      size: result.order.size,
      createdAt: timeState.time(),
    });
  };

  const snapshot = (): AccountSnapshot => ({
    activeOrders: activeOrders().map(clonePendingOrder),
    orderHistory: orderHistory.snapshot(),
    portfolio: portfolio(),
  });

  const restore = (snapshot: AccountSnapshot): void => {
    activeOrderSubscriptionScope.reset();
    subscribedActiveOrderIds.clear();

    const restoredActiveOrders = snapshot.activeOrders.map(clonePendingOrder);
    batch(() => {
      setPortfolio(snapshot.portfolio);
      setActiveOrders(restoredActiveOrders);
      orderHistory.restore(snapshot.orderHistory);
    });

    for (const order of restoredActiveOrders) trackActiveOrder(order);
  };

  createEffect(() => {
    const capitalizeDebt = (): void => {
      const elapsedMinutes = timeState.dt() / 60_000;

      if (elapsedMinutes > 0) {
        const ratePerMinute = untrack(options.debtCapitalizationRate);
        const debtGrowth = (1 + ratePerMinute) ** elapsedMinutes;
        setPortfolio((current) => ({
          Money: current.Money < 0 ? current.Money * debtGrowth : current.Money,
          Stock: current.Stock < 0 ? current.Stock * debtGrowth : current.Stock,
        }));
      }
    };

    capitalizeDebt();
  });

  createEffect(() => {
    const repayDebtWithMarketOrders = (): void => {
      const current = portfolio();

      if (current.Money < 0 && current.Stock > 0) {
        const result = market.takeOrder("sell", current.Stock);
        applyFill("sell", result.fulfilled, result.cost);
        if (result.fulfilled > 0) {
          trackLiquidationHistory({
            orderId: result.id,
            side: "sell",
            size: result.fulfilled,
            price: result.cost / result.fulfilled,
            cost: result.cost,
          });
        }
        return;
      }

      if (current.Stock < 0 && current.Money > 0) {
        const feeMultiplier = 1 - options.feeRate();
        const buySize = -current.Stock / feeMultiplier;
        const result = market.takeOrder("buy", buySize);
        applyFill("buy", result.fulfilled, result.cost);
        if (result.fulfilled > 0) {
          trackLiquidationHistory({
            orderId: result.id,
            side: "buy",
            size: result.fulfilled,
            price: result.cost / result.fulfilled,
            cost: result.cost,
          });
        }
      }
    };

    const liquidate = (): void => {
      if (isLiquidating) return;

      isLiquidating = true;
      for (const order of activeOrders()) {
        cancelActiveOrder(order);
      }
      repayDebtWithMarketOrders();
      isLiquidating = false;
    };

    const shouldLiquidate = (): boolean => {
      const liquidation = liquidationPrice();
      if (liquidation === null) return false;

      const spread = market.marketPriceSpread();
      const sign = Math.sign(portfolio().Stock);
      const exit = ((sign + 1) / 2) * spread.buy + ((sign - 1) / 2) * spread.sell;
      return exit < sign * liquidation;
    };

    if (!gates.debt()) {
      repayDebtWithMarketOrders();
      return;
    }

    if (shouldLiquidate()) liquidate();
  });

  return {
    id,
    portfolio,
    activeOrders,
    orderHistory: orderHistory.entries,
    capital,
    netWorth,
    leverage,
    liquidationPrice,
    addMoney,
    restore,
    snapshot,
    placeMarketOrder,
    placeLimitOrder,
    cancelActiveOrder,
  };
};
