import { afterAll, expect, test, vi } from "vitest";

type MarketModule = typeof import("../src/market/index");

const loadMarket = async (): Promise<MarketModule> => {
  vi.restoreAllMocks();
  vi.resetModules();

  return import("../src/market/index");
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
