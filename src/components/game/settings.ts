import { createRoot, createSignal } from "solid-js";
import { HistogramNormalization } from "../OrderBookHistogram";

// todo: lifetime for history - store at most last time interval of size N
const createSettingsState = () => {
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
  const [simulationSpeed, setSimulationSpeed] = createSignal(1);
  const [isSimulationPaused, setIsSimulationPaused] = createSignal(false);
  const [masterVolume, setMasterVolume] = createSignal(70);
  const [musicVolume, setMusicVolume] = createSignal(70);
  const [effectsVolume, setEffectsVolume] = createSignal(70);

  return {
    advancedOrdersEnabled,
    autosaveEnabled,
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
    setAutosaveEnabled,
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

export const gameSettings = createRoot(createSettingsState);
