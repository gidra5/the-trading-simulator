import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { sampleMultivariateHawkesProcessEventTypes } from "../src/distributions";
import { createMarketState } from "../src/market";
import { createTradingSimulationState } from "../src/simulation";
import { createOrchestrator } from "../src/simulation/orchestrator";
import { createSimulationTimeState } from "../src/simulation/time";
import { cloneMarketModelSettings, defaultMarketModelSettings, simulationEventTypes } from "../src/simulation/types";

afterEach(() => {
  vi.restoreAllMocks();
});

test("multivariate Hawkes event callback receives millisecond gaps", () => {
  const firstGapRandom = 1 - Math.exp(-0.5);
  const secondGapRandom = 1 - Math.exp(-0.6);
  const randomValues = [firstGapRandom, 0.5, 0.5, secondGapRandom];
  vi.spyOn(Math, "random").mockImplementation(() => randomValues.shift() ?? 0.999_999);
  const eventGaps: number[] = [];

  sampleMultivariateHawkesProcessEventTypes([1], [[0]], [0], 1_000, [0], (_eventType, dt) => {
    eventGaps.push(dt);
  });

  expect(eventGaps).toHaveLength(1);
  expect(eventGaps[0]).toBeCloseTo(500);
});

test("simulation ticks advance through quiet intervals", () => {
  const state = createRoot((dispose) => {
    const time = createSimulationTimeState();
    const market = createMarketState({
      time: time.time,
      deltaSnapshotInterval: () => 100,
      histogramFanout: () => 5,
      histogramPriceReference: () => 1,
      orderBookFanout: () => 5,
      orderBookLevels: () => 5,
    });
    const orchestrator = createOrchestrator();
    const settings = cloneMarketModelSettings(defaultMarketModelSettings);
    for (const eventType of simulationEventTypes) settings.publicInterest[eventType] = 0;
    orchestrator.setMarketModelSettings(settings);
    const simulation = createTradingSimulationState({
      cancellation: orchestrator.cancellation,
      eventStream: orchestrator.eventStream,
      market,
      orderPlacement: orchestrator.orderPlacement,
      time,
    });

    return { dispose, simulation, time };
  });

  try {
    state.simulation.tick(250);
    expect(state.time.time()).toBe(250);

    state.simulation.tick(750);
    expect(state.time.time()).toBe(1_000);
  } finally {
    state.dispose();
  }
});
