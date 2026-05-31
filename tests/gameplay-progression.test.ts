import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";
import { createActor } from "../src/economy/actor";
import { createAccount } from "../src/economy/account";
import { Resource } from "../src/economy/inventory";
import { createMarketState, type MarketState } from "../src/market";
import { progressionGraph, ProgressionMetric, ProgressionNode, type ProgressionMetrics } from "../src/progression/data";
import type { ProgressionState } from "../src/progression/interface";
import { createSimulationTimeState } from "../src/simulation/time";

const createTestMarket = (time: ReturnType<typeof createSimulationTimeState>) =>
  createMarketState({
    time: time.time,
    deltaSnapshotInterval: () => 100,
    histogramFanout: () => 5,
    histogramPriceReference: () => 1,
    orderBookFanout: () => 5,
    orderBookLevels: () => 5,
  });

const addBuyLiquidity = (market: MarketState, size = 1): void => {
  market.makeOrder("buy", { price: 0.5, size });
};

const addSellLiquidity = (market: MarketState, size = 1): void => {
  market.makeOrder("sell", { price: 1, size });
};

const createTestAccount = (options?: { completedNodes?: ProgressionNode[] }) => {
  return createRoot(() => {
    const time = createSimulationTimeState();
    const market = createTestMarket(time);
    const { progression, setNodeComplete } = createTestProgression(options?.completedNodes);
    const account = createAccount({
      progression,
      market,
      time,
      debtCapitalizationRate: () => 0,
      feeRate: () => 0,
      maintenanceMargin: () => 0.05,
    });

    return { account, market, progression, setNodeComplete, time };
  });
};

const createTestProgression = (completedNodes: ProgressionNode[] = []) => {
  const [completed, setCompleted] = createSignal(new Set(completedNodes));
  const [metrics, setMetrics] = createSignal<ProgressionMetrics>({
    [ProgressionMetric.Handwork]: 0,
    [ProgressionMetric.LeveragedTime]: 0,
    [ProgressionMetric.Trades]: 0,
  });
  const setNodeComplete = (node: ProgressionNode, isComplete: boolean): void => {
    setCompleted((current) => {
      const next = new Set(current);
      if (isComplete) next.add(node);
      else next.delete(node);
      return next;
    });
  };
  const progression = {
    graph: progressionGraph,
    frontier: () => [],
    metrics,
    scheduler: {
      nodes: () => [],
      getNodeOrder: () => undefined,
      move: () => {},
      scheduleFirst: () => {},
      scheduleLast: () => {},
      toggle: () => {},
    },
    addMetric: (metric, value) => setMetrics((current) => ({ ...current, [metric]: current[metric] + value })),
    tierList: () => [],
    advanceFrontier: (node) => setNodeComplete(node, true),
    getStatus: (node) => (completed().has(node) ? "complete" : "inaccessible"),
    isComplete: (node) => completed().has(node),
  } satisfies ProgressionState;

  return { progression, setNodeComplete };
};

test("actor progression spends inventory money", () => {
  const actor = createRoot(() => {
    const time = createSimulationTimeState();
    const market = createTestMarket(time);
    addSellLiquidity(market);

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

  const handworkPrice = progressionGraph[ProgressionNode.Handwork].prices[Resource.Money]!;
  actor.inventory.addResource(Resource.Money, handworkPrice);
  actor.progression.addMetric(ProgressionMetric.Handwork, 3);

  expect(actor.progression.metrics().Handwork).toBe(3);
  expect(actor.inventory.resources().Money).toBe(handworkPrice);

  actor.progression.advanceFrontier(ProgressionNode.Handwork);

  expect(actor.account.netWorth()).toBe(0);
  expect(actor.inventory.resources().Money).toBe(0);
});

test("account cannot borrow before debt is enabled", () => {
  const { account, market } = createTestAccount();
  addSellLiquidity(market);

  account.placeMarketOrder("buy", 1);

  expect(account.portfolio().Money).toBe(0);
  expect(account.portfolio().Stock).toBe(0);
});

test("account can borrow after debt is enabled", () => {
  const { account, market } = createTestAccount({ completedNodes: [ProgressionNode.TradingLeverage] });
  addSellLiquidity(market);
  account.addMoney(0.5);

  account.placeMarketOrder("buy", 1);

  expect(account.portfolio().Money).toBeLessThan(0);
  expect(account.portfolio().Stock).toBe(1);
});

test("account only tracks order history after journaling is enabled", () => {
  const { account, market, progression, setNodeComplete } = createTestAccount();
  addSellLiquidity(market, 2);
  account.addMoney(3);

  account.placeMarketOrder("buy", 1);
  setNodeComplete(ProgressionNode.Journaling, true);
  account.placeMarketOrder("buy", 1);

  expect(progression.metrics().Trades).toBe(2);
  expect(account.orderHistory()).toHaveLength(1);
  expect(account.orderHistory()[0]?.kind).toBe("filled");
});

test("account only places limit orders after advanced trading is enabled", () => {
  const { account, setNodeComplete } = createTestAccount();
  account.addMoney(2);

  account.placeLimitOrder("buy", 0.5, 1);
  setNodeComplete(ProgressionNode.TradingAdvanced, true);
  account.placeLimitOrder("buy", 0.5, 1);

  expect(account.activeOrders()).toHaveLength(1);
});

test("account only tracks liquidation history after liquidation journaling is enabled", () => {
  const { account, market, setNodeComplete, time } = createTestAccount({
    completedNodes: [ProgressionNode.TradingLeverage],
  });
  addBuyLiquidity(market, 2);
  addSellLiquidity(market, 2);
  account.addMoney(0.5);
  account.placeMarketOrder("buy", 1);
  setNodeComplete(ProgressionNode.TradingLeverage, false);
  time.advance(1);

  expect(account.orderHistory().filter((entry) => entry.kind === "liquidation")).toHaveLength(0);

  account.addMoney(0.5);
  setNodeComplete(ProgressionNode.TradingLeverage, true);
  account.placeMarketOrder("buy", 1);
  setNodeComplete(ProgressionNode.LiquidationJournaling, true);
  setNodeComplete(ProgressionNode.TradingLeverage, false);
  time.advance(1);

  expect(account.orderHistory().filter((entry) => entry.kind === "liquidation")).toHaveLength(1);
});
