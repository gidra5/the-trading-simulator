import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createMarketState } from "../src/market";
import { createTradingSimulationState } from "../src/simulation";
import { createSimulationTimeState } from "../src/simulation/time";
import type { SimulationEventType } from "../src/simulation/types";

const eventIndex = (eventType: SimulationEventType): number =>
  ["market-buy", "market-sell", "order-buy", "order-sell", "cancel-buy", "cancel-sell"].indexOf(eventType);

const createTestMarket = (time: ReturnType<typeof createSimulationTimeState>) => {
  const market = createMarketState({
    time: time.time,
    deltaSnapshotInterval: () => 100,
    histogramFanout: () => 5,
    histogramPriceReference: () => 1,
    orderBookFanout: () => 5,
    orderBookLevels: () => 5,
  });

  market.makeOrder("buy", { price: 1, size: 100 });
  market.makeOrder("sell", { price: 2, size: 100 });
  return market;
};

const createTestSimulation = (eventType: SimulationEventType, sampleOrderSize = 10) =>
  createRoot((dispose) => {
    let currentEventType = eventType;
    let currentSampleOrderSize = sampleOrderSize;
    const time = createSimulationTimeState();
    const market = createTestMarket(time);
    const simulation = createTradingSimulationState({
      cancellation: {
        candidatesCount: () => 0,
        sampleOrderIndex: () => 0,
      },
      eventStream: {
        baselineActivity: () => [],
        excitationMatrix: () => [],
        excitementDecay: () => [],
        distributions: {
          sampleMultivariateHawkesProcessEventTypes: (_baseline, _matrix, _decay, _dt, _interest, onEvent) => {
            onEvent(eventIndex(currentEventType), 0);
          },
        },
      },
      initialCapital: { Money: 5, Stock: 5 },
      market,
      orderPlacement: {
        distributions: {
          sampleBernoulli: (probability) => probability > 0,
          sampleTruncatedExponential: () => 0,
        },
        inSpread: {
          max: () => 0,
          halfRateSize: () => 1,
          mean: () => 1,
        },
        sampleOrderDistance: () => 0,
        sampleOrderSize: () => currentSampleOrderSize,
      },
      time,
    });

    return {
      dispose,
      market,
      setEventType: (next: SimulationEventType) => (currentEventType = next),
      setSampleOrderSize: (next: number) => (currentSampleOrderSize = next),
      simulation,
    };
  });

test("simulated limit orders reserve only available capital", () => {
  const state = createTestSimulation("order-buy");

  try {
    state.simulation.tick(1);
    state.simulation.tick(1);

    expect(state.simulation.ownedOrders().buy).toHaveLength(1);
    expect(state.simulation.ownedOrders().buy[0]?.size).toBe(5);
    expect(state.simulation.capital.reserved.Money()).toBe(5);
    expect(state.simulation.capital.free.Money()).toBe(0);
  } finally {
    state.dispose();
  }
});

test("simulated cancels recover reserved capital", () => {
  const state = createTestSimulation("order-buy");

  try {
    state.simulation.tick(1);
    state.setEventType("cancel-buy");
    state.simulation.tick(1);

    expect(state.simulation.ownedOrders().buy).toHaveLength(0);
    expect(state.simulation.capital.reserved.Money()).toBe(0);
    expect(state.simulation.capital.free.Money()).toBe(5);
  } finally {
    state.dispose();
  }
});

test("external trades change total simulated market capital", () => {
  const state = createTestSimulation("order-sell");

  try {
    state.simulation.tick(1);
    state.market.takeOrder("buy", 2);

    expect(state.simulation.capital.total.Money()).toBe(9);
    expect(state.simulation.capital.total.Stock()).toBe(3);
    expect(state.simulation.capital.reserved.Stock()).toBe(3);
  } finally {
    state.dispose();
  }
});

test("simulated market trades conserve total simulated market capital", () => {
  const state = createTestSimulation("order-sell", 5);

  try {
    state.simulation.tick(1);

    state.setEventType("market-buy");
    state.setSampleOrderSize(2);
    state.simulation.tick(1);

    expect(state.simulation.capital.total.Money()).toBe(5);
    expect(state.simulation.capital.total.Stock()).toBe(5);
    expect(state.simulation.capital.reserved.Stock()).toBe(3);
  } finally {
    state.dispose();
  }
});
