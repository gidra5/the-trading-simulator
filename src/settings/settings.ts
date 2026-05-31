import { batch, createMemo, createSignal } from "solid-js";
import type { PriceScaleKind, QuotePriceKind } from "../market";
import { createRngSeed } from "../rng";
import { type StoreEncoding, type StoreKind } from "../storage/interface";
import { createSaveFileStore } from "../storage/persistence";
import { resolveAutosaveStatus } from "./autosaveStatus";

export const enum HistogramNormalization {
  Linear = "linear",
  Logarithmic = "logarithmic",
}
type AutosaveStorePreference = Exclude<StoreKind, "manual"> | null;
export type SettingsSnapshot = {
  advancedOrdersEnabled: boolean;
  autosaveEncoding: StoreEncoding;
  autosaveEnabled: boolean;
  autosaveFileName: string;
  autosaveIntervalMinutes: number;
  autosaveStorePreference: AutosaveStorePreference;
  cancellationCandidatesCount: number;
  candleInterval: number;
  deltaSnapshotInterval: number;
  effectsVolume: number;
  frontierPickerSize: number;
  heatmapNormalization: PriceScaleKind;
  histogramFanout: number;
  histogramNormalization: HistogramNormalization;
  histogramPriceReference: number;
  histogramWindowFraction: number;
  isHeatmapEnabled: boolean;
  isHistogramCumulative: boolean;
  isHistogramEnabled: boolean;
  isSimulationPaused: boolean;
  lastSaveAt: string | null;
  masterVolume: number;
  musicVolume: number;
  newsEventsEnabled: boolean;
  orderBookFanout: number;
  orderBookLevels: number;
  priceScale: PriceScaleKind;
  quotePriceKind: QuotePriceKind;
  seed: number;
  showFrameRate: boolean;
  simulationSpeed: number;
};
// todo: lifetime for history - store at most last time interval of size N
export const createSettings = <SaveSnapshot = unknown>() => {
  const [cancellationCandidatesCount, setCancellationCandidatesCount] = createSignal(64);
  const [deltaSnapshotInterval, setDeltaSnapshotInterval] = createSignal(100);
  const [orderBookFanout, setOrderBookFanout] = createSignal(5);
  const [orderBookLevels, setOrderBookLevels] = createSignal(5);
  const [seed, setSeed] = createSignal(createRngSeed());
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
  const [autosaveIntervalMinutes, setAutosaveIntervalMinutes] = createSignal(5);
  const [autosaveStorePreference, setAutosaveStorePreference] = createSignal<AutosaveStorePreference>(null);
  const [lastSaveAt, setLastSaveAt] = createSignal<string | null>(null);
  const [simulationSpeed, setSimulationSpeed] = createSignal(1);
  const [isSimulationPaused, setIsSimulationPaused] = createSignal(false);
  const [masterVolume, setMasterVolume] = createSignal(70);
  const [musicVolume, setMusicVolume] = createSignal(70);
  const [effectsVolume, setEffectsVolume] = createSignal(70);
  const storePreference = createMemo<StoreKind | null>(() =>
    autosaveEnabled() ? autosaveStorePreference() : "manual",
  );
  const autosaveFileStore = createSaveFileStore<SaveSnapshot>({
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

  const snapshot = (): SettingsSnapshot => ({
    advancedOrdersEnabled: advancedOrdersEnabled(),
    autosaveEncoding: autosaveEncoding(),
    autosaveEnabled: autosaveEnabled(),
    autosaveFileName: autosaveFileName(),
    autosaveIntervalMinutes: autosaveIntervalMinutes(),
    autosaveStorePreference: autosaveStorePreference(),
    cancellationCandidatesCount: cancellationCandidatesCount(),
    candleInterval: candleInterval(),
    deltaSnapshotInterval: deltaSnapshotInterval(),
    effectsVolume: effectsVolume(),
    frontierPickerSize: frontierPickerSize(),
    heatmapNormalization: heatmapNormalization(),
    histogramFanout: histogramFanout(),
    histogramNormalization: histogramNormalization(),
    histogramPriceReference: histogramPriceReference(),
    histogramWindowFraction: histogramWindowFraction(),
    isHeatmapEnabled: isHeatmapEnabled(),
    isHistogramCumulative: isHistogramCumulative(),
    isHistogramEnabled: isHistogramEnabled(),
    isSimulationPaused: isSimulationPaused(),
    lastSaveAt: lastSaveAt(),
    masterVolume: masterVolume(),
    musicVolume: musicVolume(),
    newsEventsEnabled: newsEventsEnabled(),
    orderBookFanout: orderBookFanout(),
    orderBookLevels: orderBookLevels(),
    priceScale: priceScale(),
    quotePriceKind: quotePriceKind(),
    seed: seed(),
    showFrameRate: showFrameRate(),
    simulationSpeed: simulationSpeed(),
  });

  const restore = (snapshot: SettingsSnapshot): void => {
    batch(() => {
      setAdvancedOrdersEnabled(snapshot.advancedOrdersEnabled);
      setAutosaveEncoding(snapshot.autosaveEncoding);
      setAutosaveEnabled(snapshot.autosaveEnabled);
      setAutosaveFileName(snapshot.autosaveFileName);
      setAutosaveIntervalMinutes(snapshot.autosaveIntervalMinutes);
      setAutosaveStorePreference(snapshot.autosaveStorePreference);
      setCancellationCandidatesCount(snapshot.cancellationCandidatesCount);
      setCandleInterval(snapshot.candleInterval);
      setDeltaSnapshotInterval(snapshot.deltaSnapshotInterval);
      setEffectsVolume(snapshot.effectsVolume);
      setFrontierPickerSize(snapshot.frontierPickerSize);
      setHeatmapNormalization(snapshot.heatmapNormalization);
      setHistogramFanout(snapshot.histogramFanout);
      setHistogramNormalization(snapshot.histogramNormalization);
      setHistogramPriceReference(snapshot.histogramPriceReference);
      setHistogramWindowFraction(snapshot.histogramWindowFraction);
      setIsHeatmapEnabled(snapshot.isHeatmapEnabled);
      setIsHistogramCumulative(snapshot.isHistogramCumulative);
      setIsHistogramEnabled(snapshot.isHistogramEnabled);
      setIsSimulationPaused(snapshot.isSimulationPaused);
      setLastSaveAt(snapshot.lastSaveAt ?? null);
      setMasterVolume(snapshot.masterVolume);
      setMusicVolume(snapshot.musicVolume);
      setNewsEventsEnabled(snapshot.newsEventsEnabled);
      setOrderBookFanout(snapshot.orderBookFanout);
      setOrderBookLevels(snapshot.orderBookLevels);
      setPriceScale(snapshot.priceScale);
      setQuotePriceKind(snapshot.quotePriceKind);
      setSeed(snapshot.seed);
      setShowFrameRate(snapshot.showFrameRate);
      setSimulationSpeed(snapshot.simulationSpeed);
    });
  };

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
    autosaveIntervalMinutes,
    refreshAutosaveStorageUsage: autosaveFileStore.refreshStorageUsage,
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
    lastSaveAt,
    masterVolume,
    musicVolume,
    newsEventsEnabled,
    priceScale,
    quotePriceKind,
    showFrameRate,
    simulationSpeed,
    seed,
    cancellationCandidatesCount,
    restore,
    snapshot,

    setDeltaSnapshotInterval,
    setOrderBookFanout,
    setOrderBookLevels,
    setHistogramPriceReference,
    setHistogramFanout,
    setAdvancedOrdersEnabled,
    setAutosaveEncoding,
    setAutosaveEnabled,
    setAutosaveFileName,
    setAutosaveIntervalMinutes,
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
    setLastSaveAt,
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
