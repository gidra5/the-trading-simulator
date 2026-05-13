import { afterAll, expect, test, vi } from "vitest";
import { createRoot } from "solid-js";
import type { MarketState } from "../src/market/index";

const loadMarket = async (): Promise<MarketState> => {
  vi.restoreAllMocks();
  vi.resetModules();

  const [{ createMarketState }, { createSimulationTimeState }] = await Promise.all([
    import("../src/market/index"),
    import("../src/simulation/time"),
  ]);
  const clock = createSimulationTimeState();
  return createRoot(() => createMarketState({ time: clock.time }));
};

afterAll(() => {
  vi.restoreAllMocks();
});

test("subscribeToOrder notifies for matching order changes until unsubscribed", async () => {
  const market = await loadMarket();
  const result = market.makeOrder("buy", { price: 0.5, size: 10 });
  const changes: ReturnType<typeof market.latestOrderBookChange>["changes"] = [];
  const unsubscribe = market.subscribeToOrder(result.order.id, (change) => changes.push(change));

  market.cancelOrder(result.order.id, "buy");
  expect(changes).toHaveLength(1);
  expect(changes[0]?.kind).toBe("remove");
  expect(changes[0]?.order.id).toBe(result.order.id);

  unsubscribe();
  market.makeOrder("buy", { price: 0.5, size: 10 });
  expect(changes).toHaveLength(1);
});
