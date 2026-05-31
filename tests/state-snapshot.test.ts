import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createMarketState } from "../src/market";
import { createSimulationTimeState } from "../src/simulation/time";

const createTestMarket = () =>
  createRoot(() => {
    const time = createSimulationTimeState();
    const market = createMarketState({
      time: time.time,
      deltaSnapshotInterval: () => 2,
      histogramFanout: () => 5,
      histogramPriceReference: () => 1,
      orderBookFanout: () => 2,
      orderBookLevels: () => 2,
    });

    return { market, time };
  });

test("market snapshot restores order history and next order id", () => {
  const { market, time } = createTestMarket();

  time.advance(100);
  market.makeOrder("buy", { price: 0.9, size: 10 });
  time.advance(100);
  market.makeOrder("sell", { price: 1.1, size: 5 });

  const snapshot = market.snapshot();
  const orderBook = structuredClone(market.orderBook());
  const stats = market.getOrderBookHistoryStats();

  market.takeOrder("sell", 4);
  market.makeOrder("buy", { price: 0.8, size: 1 });
  expect(market.orderBook()).not.toEqual(orderBook);

  market.restore(snapshot);

  expect(market.orderBook()).toEqual(orderBook);
  expect(market.getOrderBookHistoryStats().revision).toBe(stats.revision);
  expect(market.makeOrder("buy", { price: 0.7, size: 1 }).order.id).toBe(snapshot.nextOrderId);
});

test("market restore does not replay restored order changes to subscribers", () => {
  const source = createTestMarket();

  source.time.advance(100);
  const result = source.market.makeOrder("buy", { price: 0.9, size: 10 });
  const snapshot = source.market.snapshot();

  const target = createTestMarket();
  const changes: ReturnType<typeof target.market.latestOrderBookChange>["changes"] = [];
  target.market.subscribeToOrder(result.order.id, (change) => changes.push(change));

  target.market.restore(snapshot);

  expect(changes).toEqual([]);
  expect(target.market.orderBook()).toEqual(source.market.orderBook());
});
