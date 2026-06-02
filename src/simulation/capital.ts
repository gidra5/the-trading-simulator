import { createMemo, createSignal } from "solid-js";
import type { OrderSide } from "../market";
import type { OrderBookChange } from "../market/orderBook";
import type { RestingOrder } from "./types";

export type SimulationCapitalPair = {
  Money: number;
  Stock: number;
};

export type SimulationCapitalSnapshot = {
  total: SimulationCapitalPair;
  reserved: SimulationCapitalPair;
};

const cloneCapital = (capital: SimulationCapitalPair): SimulationCapitalPair => ({ ...capital });

const createCapitalSignals = (initial: SimulationCapitalPair) => {
  const [money, setMoney] = createSignal(initial.Money);
  const [stock, setStock] = createSignal(initial.Stock);

  const addMoney = (amount: number): void => {
    setMoney((current) => current + amount);
  };
  const addStock = (amount: number): void => {
    setStock((current) => current + amount);
  };

  return {
    value: {
      Money: money,
      Stock: stock,
    },
    addMoney,
    addStock,
    restore: (capital: SimulationCapitalPair): void => {
      setMoney(capital.Money);
      setStock(capital.Stock);
    },
    snapshot: (): SimulationCapitalPair => ({
      Money: money(),
      Stock: stock(),
    }),
  };
};

type CapitalSignals = ReturnType<typeof createCapitalSignals>;

const reserveAmount = (order: Pick<RestingOrder, "side" | "price" | "size">): SimulationCapitalPair => ({
  Money: order.side === "buy" ? order.price * order.size : 0,
  Stock: order.side === "sell" ? order.size : 0,
});

export const createSimulationCapitalState = (initial: SimulationCapitalPair) => {
  const total = createCapitalSignals(initial);
  const reserved = createCapitalSignals({ Money: 0, Stock: 0 });
  const free = {
    Money: createMemo(() => total.value.Money() - reserved.value.Money()),
    Stock: createMemo(() => total.value.Stock() - reserved.value.Stock()),
  };

  const addCapital = (signals: CapitalSignals, amount: SimulationCapitalPair): void => {
    signals.addMoney(amount.Money);
    signals.addStock(amount.Stock);
  };

  const reserveLimitOrder = (order: RestingOrder): void => {
    addCapital(reserved, reserveAmount(order));
  };

  const recoverLimitOrder = (order: RestingOrder): void => {
    const amount = reserveAmount(order);
    addCapital(reserved, { Money: -amount.Money, Stock: -amount.Stock });
  };

  const applyMakerFill = (side: OrderSide, size: number, cost: number): void => {
    if (side === "buy") {
      total.addMoney(-cost);
      total.addStock(size);
      reserved.addMoney(-cost);
      return;
    }

    total.addMoney(cost);
    total.addStock(-size);
    reserved.addStock(-size);
  };

  const applySimulatedMarketFill = (side: OrderSide, size: number, cost: number): void => {
    if (side === "buy") {
      total.addMoney(-cost);
      total.addStock(size);
      return;
    }

    total.addMoney(cost);
    total.addStock(-size);
  };

  const applyOwnedOrderChange = (change: OrderBookChange): void => {
    if (change.kind === "partial-fill") {
      const filled = change.prevSize - change.order.size;
      applyMakerFill(change.side, filled, change.order.price * filled);
      return;
    }

    applyMakerFill(change.side, change.order.size, change.order.price * change.order.size);
  };

  const freeFraction = (side: OrderSide): number => {
    if (side === "buy") return total.value.Money() <= 0 ? 0 : free.Money() / total.value.Money();
    return total.value.Stock() <= 0 ? 0 : free.Stock() / total.value.Stock();
  };

  const limitOrderSize = (side: OrderSide, price: number, size: number): number => {
    if (side === "buy") return Math.min(size, free.Money() / price);
    return Math.min(size, free.Stock());
  };

  const snapshot = (): SimulationCapitalSnapshot => ({
    total: total.snapshot(),
    reserved: reserved.snapshot(),
  });

  const restore = (snapshot: SimulationCapitalSnapshot): void => {
    total.restore(snapshot.total);
    reserved.restore(snapshot.reserved);
  };

  return {
    total: total.value,
    reserved: reserved.value,
    free,
    applyOwnedOrderChange,
    applySimulatedMarketFill,
    freeFraction,
    limitOrderSize,
    recoverLimitOrder,
    reserveLimitOrder,
    restore,
    snapshot,
  };
};

export type SimulationCapitalState = ReturnType<typeof createSimulationCapitalState>;
