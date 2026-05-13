import { afterAll, expect, test, vi } from "vitest";
import fc from "fast-check";
import { createRoot } from "solid-js";
import type { MarketState } from "../src/market/index";
import type { SimulationTimeState } from "../src/simulation/time";

type Operation =
  | {
      kind: "limit";
      side: "buy" | "sell";
      price: number;
      size: number;
    }
  | {
      kind: "cancel";
      side: "buy" | "sell";
      index: number;
    }
  | {
      kind: "take";
      side: "buy" | "sell";
      price: number;
      size: number;
    };

const loadMarket = async (settings: {
  interval?: number;
  fanout?: number;
  levels: number;
}): Promise<{ market: MarketState; clock: SimulationTimeState }> => {
  vi.restoreAllMocks();
  vi.resetModules();

  const [{ createMarketState }, { createSimulationTimeState }] = await Promise.all([
    import("../src/market/index"),
    import("../src/simulation/time"),
  ]);
  const clock = createSimulationTimeState();
  const market = createRoot(() => createMarketState({ time: clock.time }));
  market.setDeltaSnapshotInterval(settings.interval ?? 2);
  market.setFanout(settings.fanout ?? 2);
  market.setLevels(settings.levels);

  return { market, clock };
};

const operationArbitrary: fc.Arbitrary<Operation> = fc.oneof(
  fc.record({
    kind: fc.constant("limit"),
    side: fc.constantFrom("buy" as const, "sell" as const),
    price: fc.integer({ min: 70, max: 130 }).map((price) => price / 100),
    size: fc.integer({ min: 1, max: 12 }),
  }),
  fc.record({
    kind: fc.constant("cancel"),
    side: fc.constantFrom("buy" as const, "sell" as const),
    index: fc.nat({ max: 20 }),
  }),
  fc.record({
    kind: fc.constant("take"),
    side: fc.constantFrom("buy" as const, "sell" as const),
    price: fc.integer({ min: 70, max: 130 }).map((price) => price / 100),
    size: fc.integer({ min: 1, max: 120 }),
  }),
);

const arb = fc
  .record({
    interval: fc.integer({ min: 2, max: 4 }),
    fanout: fc.integer({ min: 2, max: 4 }),
    levels: fc.integer({ min: 1, max: 4 }),
  })
  .chain(({ interval, fanout, levels }) =>
    fc.record({
      interval: fc.constant(interval),
      fanout: fc.constant(fanout),
      levels: fc.constant(levels),
      operations: fc.array(operationArbitrary, {
        minLength: 2 * interval * fanout ** levels,
        maxLength: 2 * interval * fanout ** levels,
      }),
    }),
  );

const applyOperation = (
  market: MarketState,
  operation: Operation,
  restingOrderIds: Record<"buy" | "sell", number[]>,
): void => {
  switch (operation.kind) {
    case "limit": {
      const result = market.makeOrder(operation.side, {
        price: operation.price,
        size: operation.size,
      });
      if (result.order.size > 0) {
        restingOrderIds[operation.side].push(result.order.id);
      }
      return;
    }
    case "cancel": {
      const ids = restingOrderIds[operation.side];
      if (ids.length === 0) return;

      const index = operation.index % ids.length;
      const id = ids.splice(index, 1)[0];
      if (id !== undefined && !market.cancelOrder(id, operation.side)) {
        ids.push(id);
      }
      return;
    }
    case "take":
      market.takeOrder(operation.side, operation.size, operation.price);
      return;
  }
};

const replayMarket = (
  market: MarketState,
  clock: SimulationTimeState,
  operations: Operation[],
  onRevision?: (revision: number) => void,
): void => {
  const restingOrderIds: Record<"buy" | "sell", number[]> = {
    buy: [],
    sell: [],
  };

  for (const operation of operations) {
    clock.advance(100);
    const previousRevision = market.getOrderBookHistoryStats().revision;

    applyOperation(market, operation, restingOrderIds);

    const revision = market.getOrderBookHistoryStats().revision;
    if (revision !== previousRevision) {
      onRevision?.(revision);
    }
  }
};

afterAll(() => {
  vi.restoreAllMocks();
});

test("market reconstructs every recorded revision for fuzzed change sequences", { timeout: 30_000 }, async () => {
  await fc.assert(
    fc.asyncProperty(arb, async ({ interval, fanout, levels, operations }) => {
      const { market, clock } = await loadMarket({ interval, fanout, levels });
      const recordedBooks = new Map<number, ReturnType<typeof market.orderBook>>();

      replayMarket(market, clock, operations, (revision) => {
        recordedBooks.set(revision, structuredClone(market.orderBook()));
      });

      for (const [revision, recordedBook] of recordedBooks) {
        expect(market.reconstruct(revision), `revision ${revision}`).toEqual(recordedBook);
      }
    }),
  );
});

test("market reconstructs recorded revisions after delta hierarchy changes", async () => {
  const { market, clock } = await loadMarket({ interval: 2, fanout: 2, levels: 2 });
  const recordedBooks = new Map<number, ReturnType<typeof market.orderBook>>();

  for (let index = 0; index < 12; index += 1) {
    clock.advance(100);
    market.makeOrder("buy", {
      price: 0.8 + index / 1_000,
      size: index + 1,
    });
    recordedBooks.set(market.getOrderBookHistoryStats().revision, structuredClone(market.orderBook()));
  }

  market.setDeltaSnapshotInterval(3);
  market.setFanout(3);
  market.setLevels(3);

  for (const [revision, recordedBook] of recordedBooks) {
    expect(market.reconstruct(revision), `revision ${revision}`).toEqual(recordedBook);
  }
});

test("market builds heatmap regions for fuzzed change sequences", async () => {
  await fc.assert(
    fc.asyncProperty(arb, async ({ interval, fanout, levels, operations }) => {
      const { market, clock } = await loadMarket({ interval, fanout, levels });

      replayMarket(market, clock, operations);

      const lastTimestamp = clock.time();
      if (market.getOrderBookHistoryStats().revision === 0) return;

      expect(() =>
        market.getOrderBookRegion({
          timestamp: [0, lastTimestamp + 100],
          price: [0.7, 1.3],
          resolution: [Math.max(market.getOrderBookHistoryStats().revision + 1, 2), 601],
        }),
      ).not.toThrow();
    }),
  );
});
