import { createMemo, createSignal } from "solid-js";
import type { PriceScaleKind, QuotePriceKind } from "../market";
import { type StoreEncoding, type StoreKind } from "../storage/interface";
import { createSaveFileStore } from "../storage/persistence";
import { resolveAutosaveStatus } from "./autosaveStatus";

export const enum HistogramNormalization {
  Linear = "linear",
  Logarithmic = "logarithmic",
}
type AutosaveStorePreference = Exclude<StoreKind, "manual"> | null;
export type Settings = ReturnType<typeof createSettings>;
// todo: lifetime for history - store at most last time interval of size N
export const createSettings = () => {
  const [cancellationCandidatesCount, setCancellationCandidatesCount] = createSignal(64);
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [orderBookFanout, setOrderBookFanout] = createSignal(5);
  const [orderBookLevels, setOrderBookLevels] = createSignal(5);
  const [seed, setSeed] = createSignal(Math.random());
  const [histogramPriceReference, setHistogramPriceReference] = createSignal(1);
  const [histogramFanout, setHistogramFanout] = createSignal(5);
  const [frontierPickerSize, setFrontierPickerSize] = createSignal(3);
  const [candleInterval, setCandleInterval] = createSignal(1_000);
  const [priceScale, setPriceScale] = createSignal<PriceScaleKind>("linear");
  const [quotePriceKind, setQuotePriceKind] = createSignal<QuotePriceKind>("buy");
  const [isHeatmapEnabled, setIsHeatmapEnabled] = createSignal(false);
  const [heatmapNormalization, setHeatmapNormalization] = createSignal<PriceScaleKind>("logarithmic");
  const [isHistogramEnabled, setIsHistogramEnabled] = createSignal(false);
  const [isHistogramCumulative, setIsHistogramCumulative] = createSignal(true);
  const [histogramNormalization, setHistogramNormalization] = createSignal<HistogramNormalization>(
    HistogramNormalization.Linear,
  );
  const [histogramWindowFraction, setHistogramWindowFraction] = createSignal(0.01);
  const [showFrameRate, setShowFrameRate] = createSignal(true);
  const [advancedOrdersEnabled, setAdvancedOrdersEnabled] = createSignal(false);
  const [newsEventsEnabled, setNewsEventsEnabled] = createSignal(false);
  const [autosaveEnabled, setAutosaveEnabled] = createSignal(true);
  const [autosaveEncoding, setAutosaveEncoding] = createSignal<StoreEncoding>("json");
  const [autosaveFileName, setAutosaveFileName] = createSignal("trading-simulator-autosave.json");
  const [autosaveStorePreference, setAutosaveStorePreference] = createSignal<AutosaveStorePreference>(null);
  const [simulationSpeed, setSimulationSpeed] = createSignal(1);
  const [isSimulationPaused, setIsSimulationPaused] = createSignal(false);
  const [masterVolume, setMasterVolume] = createSignal(70);
  const [musicVolume, setMusicVolume] = createSignal(70);
  const [effectsVolume, setEffectsVolume] = createSignal(70);
  const storePreference = createMemo<StoreKind | null>(() =>
    autosaveEnabled() ? autosaveStorePreference() : "manual",
  );
  const autosaveFileStore = createSaveFileStore<unknown>({
    encoding: autosaveEncoding,
    name: autosaveFileName,
    preference: storePreference,
  });
  const autosaveStatus = createMemo(() =>
    resolveAutosaveStatus({
      active: autosaveFileStore.active(),
      enabled: autosaveEnabled(),
      preference: storePreference(),
      stores: autosaveFileStore.stores(),
    }),
  );

  return {
    deltaSnapshotInterval,
    orderBookFanout,
    orderBookLevels,
    histogramPriceReference,
    histogramFanout,
    frontierPickerSize,
    advancedOrdersEnabled,
    autosaveActiveStore: autosaveFileStore.active,
    autosaveEncoding,
    autosaveEnabled,
    autosaveFileName,
    autosaveStatus,
    autosaveStorePreference,
    autosaveStores: autosaveFileStore.stores,
    candleInterval,
    effectsVolume,
    histogramNormalization,
    histogramWindowFraction,
    heatmapNormalization,
    isHeatmapEnabled,
    isHistogramCumulative,
    isHistogramEnabled,
    isSimulationPaused,
    masterVolume,
    musicVolume,
    newsEventsEnabled,
    priceScale,
    quotePriceKind,
    showFrameRate,
    simulationSpeed,
    seed,
    cancellationCandidatesCount,

    setDeltaSnapshotInterval,
    setOrderBookFanout,
    setOrderBookLevels,
    setHistogramPriceReference,
    setHistogramFanout,
    setAdvancedOrdersEnabled,
    setAutosaveEncoding,
    setAutosaveEnabled,
    setAutosaveFileName,
    setAutosaveStorePreference,
    setCandleInterval,
    setEffectsVolume,
    setHistogramNormalization,
    setHistogramWindowFraction,
    setHeatmapNormalization,
    setIsHeatmapEnabled,
    setIsHistogramCumulative,
    setIsHistogramEnabled,
    setIsSimulationPaused,
    setMasterVolume,
    setMusicVolume,
    setNewsEventsEnabled,
    setPriceScale,
    setQuotePriceKind,
    setShowFrameRate,
    setSimulationSpeed,
    setSeed,
    setFrontierPickerSize,
    setCancellationCandidatesCount,
  };
};
