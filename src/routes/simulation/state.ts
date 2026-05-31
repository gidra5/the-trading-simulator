import { createMemo, createRoot, createSignal } from "solid-js";
import { createDistributions } from "../../distributions";
import { createMarketState } from "../../market";
import { createRng, createRngSeed } from "../../rng";
import { createTradingSimulationState } from "../../simulation";
import { createOrchestrator } from "../../simulation/orchestrator";
import { createSimulationTimeState } from "../../simulation/time";

const createSimulationSettings = () => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [orderBookFanout, setOrderBookFanout] = createSignal(5);
  const [orderBookLevels, setOrderBookLevels] = createSignal(5);
  const [seed, setSeed] = createSignal(createRngSeed());

  return {
    cancellationCandidatesCount: () => 64,
    deltaSnapshotInterval,
    histogramFanout: () => 5,
    histogramPriceReference: () => 1,
    orderBookFanout,
    orderBookLevels,
    seed,
    setDeltaSnapshotInterval,
    setOrderBookFanout,
    setOrderBookLevels,
    setSeed,
  };
};

export const { market, marketModelController, orchestrator, settings, simulation, time } = createRoot(() => {
  const settings = createSimulationSettings();
  const currentRng = createMemo(() => createRng(settings.seed()));
  const rng = (): number => currentRng()();
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
  const { controller: marketModelController, orchestrator } = createOrchestrator({ distributions });
  const simulation = createTradingSimulationState({
    cancellation: { ...orchestrator.cancellation, candidatesCount: settings.cancellationCandidatesCount },
    eventStream: orchestrator.eventStream,
    market,
    orderPlacement: orchestrator.orderPlacement,
    time,
  });

  return { market, marketModelController, orchestrator, settings, simulation, time };
});
