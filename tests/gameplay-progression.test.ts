import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";
import { createActor } from "../src/economy/actor";
import { createAccount } from "../src/economy/account";
import { createMarketState } from "../src/market";
import { progressionGraph, ProgressionMetric, ProgressionNode } from "../src/progression/data";
import { createSimulationTimeState } from "../src/simulation/time";

const createTestAccount = (options?: {
  canTrackLiquidationHistory?: () => boolean;
  canTrackOrderHistory?: () => boolean;
  canUseDebt?: () => boolean;
  canUseLimitOrders?: () => boolean;
  onTrade?: () => void;
}) => {
  return createRoot(() => {
    const time = createSimulationTimeState();
    const market = createMarketState({ time: time.time });
    const account = createAccount({
      canTrackLiquidationHistory: options?.canTrackLiquidationHistory ?? (() => false),
      canTrackOrderHistory: options?.canTrackOrderHistory ?? (() => false),
      canUseDebt: options?.canUseDebt ?? (() => false),
      canUseLimitOrders: options?.canUseLimitOrders ?? (() => false),
      onTrade: options?.onTrade ?? (() => {}),
      market,
      time,
      debtCapitalizationRate: () => 0,
      feeRate: () => 0,
      maintenanceMargin: () => 0.05,
    });

    return { account, market, time };
  });
};

test("actor progression capital follows account net worth", () => {
  const actor = createRoot(() => {
    const time = createSimulationTimeState();
    const market = createMarketState({ time: time.time });

    return createActor({
      name: "Test",
      market,
      time,
      progressionGraph,
      debtCapitalizationRate: () => 0,
      feeRate: () => 0,
      maintenanceMargin: () => 0.05,
      needsBase: () => ({ Food: 100, Sleep: 100, Health: 100, Stress: 100 }),
      needsDecayRates: () => ({ Food: 0, Sleep: 0, Health: 0, Stress: 0 }),
    });
  });

  const handworkPrice = progressionGraph[ProgressionNode.Handwork].prices.Capital!;
  actor.account.addMoney(handworkPrice);
  actor.progression.addMetric(ProgressionMetric.Handwork, 3);

  expect(actor.progression.metrics().Handwork).toBe(3);
  expect(actor.progression.resources().Capital).toBe(handworkPrice);

  actor.progression.advanceFrontier(ProgressionNode.Handwork);

  expect(actor.account.netWorth()).toBe(0);
  expect(actor.progression.resources().Capital).toBe(0);
});

test("account cannot borrow before debt is enabled", () => {
  const { account } = createTestAccount();

  account.placeMarketOrder("buy", 1);

  expect(account.portfolio().Money).toBe(0);
  expect(account.portfolio().Stock).toBe(0);
});

test("account can borrow after debt is enabled", () => {
  const { account } = createTestAccount({ canUseDebt: () => true });
  account.addMoney(0.5);

  account.placeMarketOrder("buy", 1);

  expect(account.portfolio().Money).toBeLessThan(0);
  expect(account.portfolio().Stock).toBe(1);
});

test("account only tracks order history after journaling is enabled", () => {
  const [canTrackOrderHistory, setCanTrackOrderHistory] = createSignal(false);
  let trades = 0;
  const { account } = createTestAccount({
    canTrackOrderHistory,
    onTrade: () => {
      trades += 1;
    },
  });
  account.addMoney(3);

  account.placeMarketOrder("buy", 1);
  setCanTrackOrderHistory(true);
  account.placeMarketOrder("buy", 1);

  expect(trades).toBe(2);
  expect(account.orderHistory()).toHaveLength(1);
  expect(account.orderHistory()[0]?.kind).toBe("filled");
});

test("account only places limit orders after advanced trading is enabled", () => {
  const [canUseLimitOrders, setCanUseLimitOrders] = createSignal(false);
  const { account } = createTestAccount({ canUseLimitOrders });
  account.addMoney(2);

  account.placeLimitOrder("buy", 0.5, 1);
  setCanUseLimitOrders(true);
  account.placeLimitOrder("buy", 0.5, 1);

  expect(account.activeOrders()).toHaveLength(1);
});

test("account only tracks liquidation history after liquidation journaling is enabled", () => {
  const [canUseDebt, setCanUseDebt] = createSignal(true);
  const [canTrackLiquidationHistory, setCanTrackLiquidationHistory] = createSignal(false);
  const { account, time } = createTestAccount({
    canTrackLiquidationHistory,
    canUseDebt,
  });
  account.addMoney(0.5);
  account.placeMarketOrder("buy", 1);
  setCanUseDebt(false);
  time.advance(1);

  expect(account.orderHistory().filter((entry) => entry.kind === "liquidation")).toHaveLength(0);

  account.addMoney(0.5);
  setCanUseDebt(true);
  account.placeMarketOrder("buy", 1);
  setCanTrackLiquidationHistory(true);
  setCanUseDebt(false);
  time.advance(1);

  expect(account.orderHistory().filter((entry) => entry.kind === "liquidation")).toHaveLength(1);
});
