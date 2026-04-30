import { afterAll, beforeEach, expect, test } from "vitest";
import {
  createMarket,
  resetMarketForTesting,
  setOrderBookDeltaSnapshotFanout,
  setOrderBookDeltaSnapshotInterval,
  setOrderBookDeltaSnapshotLevels,
} from "../src/market";

let now = 1_000;
const originalDateNow = Date.now;

Date.now = () => now;

const resetWithFrequentDeltaSnapshots = (): void => {
  now = 1_000;
  resetMarketForTesting(now);
  setOrderBookDeltaSnapshotInterval(2);
  setOrderBookDeltaSnapshotFanout(2);
  setOrderBookDeltaSnapshotLevels(3);
};

beforeEach(resetWithFrequentDeltaSnapshots);

afterAll(() => {
  Date.now = originalDateNow;
});

test.each([1, 2, 3, 4])(
  "constructed market reconstructs every recorded revision through snapshot interval with %i levels",
  (levelCount) => {
    now = 5_000;
    const market = createMarket(now);
    market.setOrderBookDeltaSnapshotInterval(2);
    market.setOrderBookDeltaSnapshotFanout(2);
    market.setOrderBookDeltaSnapshotLevels(levelCount);

    const recordedBooks = new Map<number, ReturnType<typeof market.orderBook>>();
    const targetRevision = market.getOrderBookHistoryStats().snapshotInterval;
    const buyOrderIds: number[] = [];
    const sellOrderIds: number[] = [];
    let step = 0;

    while (market.getOrderBookHistoryStats().revision < targetRevision) {
      step += 1;
      now += 100;

      switch (step % 6) {
        case 0: {
          const id = buyOrderIds.shift();
          if (id !== undefined && market.cancelOrder(id, "buy")) break;

          const order = market.makeOrder("buy", { price: 0.77 + step * 0.0001, size: 5 + (step % 3) });
          if (order.restingSize > 0) buyOrderIds.push(order.id);
          break;
        }
        case 1: {
          const order = market.makeOrder("buy", { price: 0.8 + step * 0.0001, size: 4 + (step % 4) });
          if (order.restingSize > 0) buyOrderIds.push(order.id);
          break;
        }
        case 2: {
          const order = market.makeOrder("sell", { price: 1.18 - step * 0.0001, size: 6 + (step % 5) });
          if (order.restingSize > 0) sellOrderIds.push(order.id);
          break;
        }
        case 3: {
          const id = sellOrderIds.shift();
          if (id !== undefined && market.cancelOrder(id, "sell")) break;

          const order = market.makeOrder("sell", { price: 1.2 - step * 0.0001, size: 3 + (step % 4) });
          if (order.restingSize > 0) sellOrderIds.push(order.id);
          break;
        }
        case 4:
          market.takeOrder("buy", 2 + (step % 3), 1.3);
          break;
        case 5:
          market.takeOrder("sell", 2 + (step % 2), 0.7);
          break;
      }

      const revision = market.getOrderBookHistoryStats().revision;
      recordedBooks.set(revision, structuredClone(market.orderBook()));
    }

    for (const [revision, recordedBook] of recordedBooks) {
      expect(market.reconstructOrderBookAtRevision(revision), `revision ${revision}`).toEqual(recordedBook);
    }
  },
);
