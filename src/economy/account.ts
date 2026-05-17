import { createEffect, createSignal, untrack, type Accessor } from "solid-js";
import { type MarketState, type OrderSide } from "../market";
import { type SimulationTimeState } from "../simulation/time";

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

type AccountStateOptions = {
  market: MarketState;
  time: SimulationTimeState;
  feeRate: Accessor<number>;
  debtCapitalizationRate: Accessor<number>;
  maintenanceMargin: Accessor<number>;
};

 const createOrderHistory = (time: Accessor<number>) => {
   let nextEntryId = 0;
   const [entries, setEntries] = createSignal<OrderHistoryEntry[]>([]);

   const record = (entry: Omit<OrderHistoryEntry, "id" | "timestamp">): void => {
     const historyEntry = { ...entry, id: nextEntryId++, timestamp: time() };
     setEntries((current) => [historyEntry, ...current]);
   };

   return {
     entries,
     submitted: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind" | "cost">): void =>
       record({ ...entry, kind: "submitted", cost: 0 }),
     partialFill: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void =>
       record({ ...entry, kind: "partial-fill" }),
     filled: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void =>
       record({ ...entry, kind: "filled" }),
     canceled: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind" | "cost">): void =>
       record({ ...entry, kind: "canceled", cost: 0 }),
     liquidation: (entry: Omit<OrderHistoryEntry, "id" | "timestamp" | "kind">): void =>
       record({ ...entry, kind: "liquidation" }),
   };
 };

export const createAccount = (options: AccountStateOptions) => {
  const market = options.market;
  const timeState = options.time;
  const id = nextAccountId++;
  const orderHistory = createOrderHistory(timeState.time);
  const [portfolio, setPortfolio] = createSignal<Portfolio>({ Money: 0, Stock: 0 });
  const [activeOrders, setActiveOrders] = createSignal<PendingOrder[]>([]);
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

  const updatePortfolio = (size: number, moneyDelta: number): void => {
    setPortfolio((current) => ({
      Stock: current.Stock + size,
      Money: current.Money + moneyDelta,
    }));
  };

  const addMoney = (amount: number): void => {
    updatePortfolio(0, amount);
  };

  const applyFill = (side: OrderSide, fulfilled: number, cost: number): void => {
    if (fulfilled <= 0) return;

    if (side === "buy") updatePortfolio(fulfilled * (1 - options.feeRate()), -cost);
    else updatePortfolio(-fulfilled, cost * (1 - options.feeRate()));
  };

  const cancelActiveOrder = (order: PendingOrder): void => {
    market.cancelOrder(order.id, order.side);
    setActiveOrders((current) => current.filter((pending) => pending.id !== order.id));
    orderHistory.canceled({
      orderId: order.id,
      side: order.side,
      size: order.size,
      price: order.price,
    });
  };

  const placeMarketOrder = (side: OrderSide, size: number): void => {
    if (size <= 0) return;

    const result = market.takeOrder(side, size);
    applyFill(side, result.fulfilled, result.cost);
    if (result.fulfilled > 0) {
      orderHistory.filled({
        orderId: result.id,
        side,
        size: result.fulfilled,
        price: result.cost / result.fulfilled,
        cost: result.cost,
      });
    }
  };

  const placeLimitOrder = (side: OrderSide, price: number, size: number): void => {
    if (price <= 0 || size <= 0) return;

    const result = market.makeOrder(side, { price, size });

    applyFill(side, result.fulfilled, result.cost);
    orderHistory.submitted({ orderId: result.order.id, side, size, price });
    if (result.fulfilled > 0) {
      const entry = {
        orderId: result.order.id,
        side,
        size: result.fulfilled,
        price: result.cost / result.fulfilled,
        cost: result.cost,
      };
      if (result.order.size > 0) orderHistory.partialFill(entry);
      else orderHistory.filled(entry);
    }
    if (result.order.size === 0) return;

    market.subscribeToOrder(result.order.id, (change) => {
      if (change.kind === "add") {
        const order = {
          id: result.order.id,
          side,
          price,
          initialSize: size,
          size: result.order.size,
          createdAt: timeState.time(),
        };
        setActiveOrders((current) => [...current, order]);
        return;
      }

      const pending = activeOrders().find((order) => order.id === change.order.id);
      if (!pending) return;
      if (change.kind === "remove") {
        const filled = change.order.size;
        const cost = filled * change.order.price;
        setActiveOrders((current) => current.filter((order) => order.id !== change.order.id));
        applyFill(change.side, change.order.size, cost);
        orderHistory.filled({
          orderId: change.order.id,
          side: change.side,
          size: change.order.size,
          price: change.order.price,
          cost,
        });
        return;
      }

      const filled = change.prevSize - change.order.size;
      const cost = filled * change.order.price;
      applyFill(pending.side, filled, cost);
      orderHistory.partialFill({
        orderId: change.order.id,
        side: change.side,
        size: filled,
        price: change.order.price,
        cost,
      });

      setActiveOrders((current) =>
        current.map((order) => (order.id === pending.id ? { ...order, size: change.order.size } : order)),
      );
    });
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
          orderHistory.liquidation({
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
          orderHistory.liquidation({
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
    placeMarketOrder,
    placeLimitOrder,
    cancelActiveOrder,
  };
};
