import { createRoot } from "solid-js";
import { createMarketState } from "../../market";
import { createTradingSimulationState } from "../../simulation";
import { createSimulationTimeState } from "../../simulation/time";
import { createSettings } from "../../components/game/settings";
import { createActor } from "../../economy/actor";
import { progressionGraph } from "../../progression/data";
import { createOrchestrator } from "../../simulation/orchestrator";

// todo: economic simulation
// TODO: an simulation orchestrator (simulate initial interest)
// todo: snapshot/restore for all the state, including settings
export const { time, market, simulation, actor, settings } = createRoot(() => {
  const settings = createSettings();
  const time = createSimulationTimeState();
  const market = createMarketState({
    time: time.time,
    deltaSnapshotInterval: settings.deltaSnapshotInterval,
    orderBookFanout: settings.orderBookFanout,
    orderBookLevels: settings.orderBookLevels,
    histogramPriceReference: settings.histogramPriceReference,
    histogramFanout: settings.histogramFanout,
  });
  const { orchestrator } = createOrchestrator();
  const simulation = createTradingSimulationState({
    market,
    time,
    eventStream: orchestrator.eventStream,
    orderPlacement: orchestrator.orderPlacement,
    cancellation: { ...orchestrator.cancellation, candidatesCount: settings.cancellationCandidatesCount },
  });
  const actor = createActor({
    name: "Player",
    market,
    time,
    progressionGraph,
    feeRate: () => 0.0001,
    debtCapitalizationRate: () => 0.00001,
    maintenanceMargin: () => 0.05,

    needsBase: () => ({ Food: 100, Sleep: 100, Health: 100, Stress: 100 }),
    needsDecayRates: () => ({ Food: 0.001, Sleep: 0.001, Health: 0.001, Stress: 0.001 }),
  });

  return { time, market, simulation, actor, settings };
});
