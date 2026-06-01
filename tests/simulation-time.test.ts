import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createDistributions } from "../src/distributions";
import { createMarketState } from "../src/market";
import { createRng } from "../src/rng";
import { createTradingSimulationState } from "../src/simulation";
import { createOrchestrator } from "../src/simulation/orchestrator";
import { createSimulationTimeState, parseSimulationDuration } from "../src/simulation/time";
import { cloneMarketModelSettings, defaultMarketModelSettings, simulationEventTypes } from "../src/simulation/types";

test("simulation duration parser accepts compact time input", () => {
  expect(parseSimulationDuration("8h")).toBe(8 * 60 * 60 * 1_000);
  expect(parseSimulationDuration("1h 30m")).toBe(90 * 60 * 1_000);
  expect(parseSimulationDuration("2.5s")).toBe(2_500);
  expect(parseSimulationDuration("")).toBeNull();
  expect(parseSimulationDuration("8")).toBeNull();
});

test("multivariate Hawkes event callback receives millisecond gaps", () => {
  const firstGapRandom = 1 - Math.exp(-0.5);
  const secondGapRandom = 1 - Math.exp(-0.6);
  const randomValues = [firstGapRandom, 0.5, 0.5, secondGapRandom];
  const rng = (): number => randomValues.shift() ?? 0.999_999;
  const distributions = createDistributions(rng);
  const eventGaps: number[] = [];

  distributions.sampleMultivariateHawkesProcessEventTypes([1], [[0]], [0], 1_000, [0], (_eventType, dt) => {
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
    const { controller, orchestrator } = createOrchestrator({ distributions: createDistributions(createRng(0x5eed)) });
    const settings = cloneMarketModelSettings(defaultMarketModelSettings);
    for (const eventType of simulationEventTypes) settings.publicInterest[eventType] = 0;
    controller.setMarketModelSettings(settings);
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
