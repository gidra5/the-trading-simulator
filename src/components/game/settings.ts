import { createMemo, createRoot, createSignal } from "solid-js";
import { type StoreEncoding, type StoreKind } from "../../storage/interface";
import { createSaveFileStore } from "../../storage/persistence";
import { HistogramNormalization } from "../OrderBookHistogram";
import { resolveAutosaveStatus } from "./autosaveStatus";

type AutosaveStorePreference = Exclude<StoreKind, "manual"> | null;

// todo: lifetime for history - store at most last time interval of size N
export const createSettings = () => {
  const [candleInterval, setCandleInterval] = createSignal(1_000);
  const [isHeatmapEnabled, setIsHeatmapEnabled] = createSignal(false);
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
    isHeatmapEnabled,
    isHistogramCumulative,
    isHistogramEnabled,
    isSimulationPaused,
    masterVolume,
    musicVolume,
    newsEventsEnabled,
    setAdvancedOrdersEnabled,
    setAutosaveEncoding,
    setAutosaveEnabled,
    setAutosaveFileName,
    setAutosaveStorePreference,
    setCandleInterval,
    setEffectsVolume,
    setHistogramNormalization,
    setHistogramWindowFraction,
    setIsHeatmapEnabled,
    setIsHistogramCumulative,
    setIsHistogramEnabled,
    setIsSimulationPaused,
    setMasterVolume,
    setMusicVolume,
    setNewsEventsEnabled,
    setShowFrameRate,
    setSimulationSpeed,
    showFrameRate,
    simulationSpeed,
  };
};
