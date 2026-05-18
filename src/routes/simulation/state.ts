import { createRoot, createSignal } from "solid-js";
import { createMarketState } from "../../market";
import { createTradingSimulationState } from "../../simulation";
import { createOrchestrator } from "../../simulation/orchestrator";
import { createSimulationTimeState } from "../../simulation/time";

const createSimulationSettings = () => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [orderBookFanout, setOrderBookFanout] = createSignal(5);
  const [orderBookLevels, setOrderBookLevels] = createSignal(5);

  return {
    cancellationCandidatesCount: () => 64,
    deltaSnapshotInterval,
    histogramFanout: () => 5,
    histogramPriceReference: () => 1,
    orderBookFanout,
    orderBookLevels,
    setDeltaSnapshotInterval,
    setOrderBookFanout,
    setOrderBookLevels,
  };
};

export const { market, orchestrator, settings, simulation, time } = createRoot(() => {
  const settings = createSimulationSettings();
  const time = createSimulationTimeState();
  const market = createMarketState({
    time: time.time,
    deltaSnapshotInterval: settings.deltaSnapshotInterval,
    orderBookFanout: settings.orderBookFanout,
    orderBookLevels: settings.orderBookLevels,
    histogramPriceReference: settings.histogramPriceReference,
    histogramFanout: settings.histogramFanout,
  });
  const orchestrator = createOrchestrator();
  const simulation = createTradingSimulationState({
    cancellation: { ...orchestrator.cancellation, candidatesCount: settings.cancellationCandidatesCount },
    eventStream: orchestrator.eventStream,
    market,
    orderPlacement: orchestrator.orderPlacement,
    time,
  });

  return { market, orchestrator, settings, simulation, time };
});
