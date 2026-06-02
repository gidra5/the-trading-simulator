import { batch, createMemo, createRoot, createSignal } from "solid-js";
import { createDistributions } from "../../distributions";
import { createMarketState, type MarketSnapshot } from "../../market";
import { createRng, createRngSeed, type RngSnapshot } from "../../rng";
import { createTradingSimulationState, type TradingSimulationSnapshot } from "../../simulation";
import { createOrchestrator, type SimulationOrchestratorSnapshot } from "../../simulation/orchestrator";
import { createSimulationTimeState, type SimulationTimeSnapshot } from "../../simulation/time";

type SimulationSettingsSnapshot = {
  deltaSnapshotInterval: number;
  orderBookFanout: number;
  orderBookLevels: number;
  seed: number;
};

export type SimulationPageSnapshot = {
  market: MarketSnapshot;
  orchestrator: SimulationOrchestratorSnapshot;
  rng: RngSnapshot;
  settings: SimulationSettingsSnapshot;
  simulation: TradingSimulationSnapshot;
  time: SimulationTimeSnapshot;
};

const createSimulationSettings = () => {
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [orderBookFanout, setOrderBookFanout] = createSignal(5);
  const [orderBookLevels, setOrderBookLevels] = createSignal(5);
  const [seed, setSeed] = createSignal(createRngSeed());

  const snapshot = (): SimulationSettingsSnapshot => ({
    deltaSnapshotInterval: deltaSnapshotInterval(),
    orderBookFanout: orderBookFanout(),
    orderBookLevels: orderBookLevels(),
    seed: seed(),
  });

  const restore = (snapshot: SimulationSettingsSnapshot): void => {
    batch(() => {
      setDeltaSnapshotInterval(snapshot.deltaSnapshotInterval);
      setOrderBookFanout(snapshot.orderBookFanout);
      setOrderBookLevels(snapshot.orderBookLevels);
      setSeed(snapshot.seed);
    });
  };

  return {
    cancellationCandidatesCount: () => 64,
    deltaSnapshotInterval,
    histogramFanout: () => 5,
    histogramPriceReference: () => 1,
    orderBookFanout,
    orderBookLevels,
    seed,
    restore,
    setDeltaSnapshotInterval,
    setOrderBookFanout,
    setOrderBookLevels,
    setSeed,
    snapshot,
  };
};

export const { market, marketModelController, orchestrator, restore, settings, simulation, snapshot, time } =
  createRoot(() => {
    const settings = createSimulationSettings();
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
    const { controller: marketModelController, orchestrator } = createOrchestrator({ distributions });
    const simulation = createTradingSimulationState({
      cancellation: { ...orchestrator.cancellation, candidatesCount: settings.cancellationCandidatesCount },
      eventStream: orchestrator.eventStream,
      initialCapital: { Money: 100_000, Stock: 100_000 },
      market,
      orderPlacement: orchestrator.orderPlacement,
      time,
    });

    const snapshot = (): SimulationPageSnapshot => ({
      market: market.snapshot(),
      orchestrator: marketModelController.snapshot(),
      rng: currentRng().snapshot(),
      settings: settings.snapshot(),
      simulation: simulation.snapshot(),
      time: time.snapshot(),
    });

    const restore = (snapshot: SimulationPageSnapshot): void => {
      settings.restore(snapshot.settings);
      currentRng().restore(snapshot.rng);
      marketModelController.restore(snapshot.orchestrator);
      time.restore(snapshot.time);
      market.restore(snapshot.market);
      simulation.restore(snapshot.simulation);
    };

    return { market, marketModelController, orchestrator, restore, settings, simulation, snapshot, time };
  });
