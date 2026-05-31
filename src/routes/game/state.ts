import { createMemo, createRoot } from "solid-js";
import { createMarketState, type MarketSnapshot } from "../../market";
import { createTradingSimulationState, type TradingSimulationSnapshot } from "../../simulation";
import { createSimulationTimeState, type SimulationTimeSnapshot } from "../../simulation/time";
import { createSettings, type SettingsSnapshot } from "../../settings/settings";
import { createActor, type ActorSnapshot } from "../../economy/actor";
import { progressionGraph } from "../../progression/data";
import { createOrchestrator, type SimulationOrchestratorSnapshot } from "../../simulation/orchestrator";
import { createRng, type RngSnapshot } from "../../rng";
import { createDistributions } from "../../distributions";

export type GameSnapshot = {
  actor: ActorSnapshot;
  market: MarketSnapshot;
  orchestrator: SimulationOrchestratorSnapshot;
  rng: RngSnapshot;
  settings: SettingsSnapshot;
  simulation: TradingSimulationSnapshot;
  time: SimulationTimeSnapshot;
};

// todo: economic simulation
// TODO: an simulation orchestrator (simulate initial interest)
export const { actor, distributions, market, restore, settings, simulation, snapshot, time } = createRoot(() => {
  const settings = createSettings();
  const currentRng = createMemo(() => createRng(settings.seed()));
  const rng = (): number => currentRng().sample();
  const distributions = createDistributions(rng);
  const time = createSimulationTimeState();
  const market = createMarketState({
    time: time.time,
    deltaSnapshotInterval: settings.deltaSnapshotInterval,
    orderBookFanout: settings.orderBookFanout,
    orderBookLevels: settings.orderBookLevels,
    histogramPriceReference: settings.histogramPriceReference,
    histogramFanout: settings.histogramFanout,
  });
  const { controller: orchestratorController, orchestrator } = createOrchestrator({ distributions });
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

  const snapshot = (): GameSnapshot => ({
    actor: actor.snapshot(),
    market: market.snapshot(),
    orchestrator: orchestratorController.snapshot(),
    rng: currentRng().snapshot(),
    settings: settings.snapshot(),
    simulation: simulation.snapshot(),
    time: time.snapshot(),
  });

  const restore = (snapshot: GameSnapshot): void => {
    settings.restore(snapshot.settings);
    currentRng().restore(snapshot.rng);
    orchestratorController.restore(snapshot.orchestrator);
    time.restore(snapshot.time);
    market.restore(snapshot.market);
    simulation.restore(snapshot.simulation);
    actor.restore(snapshot.actor);
  };

  return { actor, distributions, market, restore, settings, simulation, snapshot, time };
});
