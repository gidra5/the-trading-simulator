import { createRoot, createSignal } from "solid-js";
import { HistogramNormalization } from "../OrderBookHistogram";

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

  return {
    advancedOrdersEnabled,
    autosaveEnabled,
    candleInterval,
    histogramNormalization,
    histogramWindowFraction,
    isHeatmapEnabled,
    isHistogramCumulative,
    isHistogramEnabled,
    newsEventsEnabled,
    setAdvancedOrdersEnabled,
    setAutosaveEnabled,
    setCandleInterval,
    setHistogramNormalization,
    setHistogramWindowFraction,
    setIsHeatmapEnabled,
    setIsHistogramCumulative,
    setIsHistogramEnabled,
    setNewsEventsEnabled,
    setShowFrameRate,
    showFrameRate,
  };
};

export const gameSettings = createRoot(createSettingsState);
