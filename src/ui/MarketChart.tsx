import { Show, createSignal, onCleanup, onMount, type Component } from "solid-js";
import {
  getOrderBookHistogram,
  getOrderBookRegion,
  marketPriceSpread,
  type PriceCandle,
  priceHistoryCandle,
} from "../market/index";
import { OrderBookHistogram, HistogramNormalization } from "./OrderBookHistogram";
import { simulationTickTime, TradingSimulation } from "../simulation/index";
import { Chart, type ChartViewport } from "./Chart";
import { ChartSettings } from "./ChartSettings";
import { MarketSettings } from "./MarketSettings";
import { createThrottledMemo, formatNumber } from "../utils";
import { digits, Order } from "./Order";
import { time } from "../simulation/time";

const pollingInterval = 200;
const showFrameRate = true;
type SettingsTab = "chart" | "market";

export const MarketChart: Component = () => {
  const simulation = new TradingSimulation();
  const startTime = time();
  const priceSpread = createThrottledMemo(marketPriceSpread, pollingInterval);
  const [activeSettingsTab, setActiveSettingsTab] = createSignal<SettingsTab>("chart");
  const [candleInterval, setCandleInterval] = createSignal(1_000);
  const [isHeatmapEnabled, setIsHeatmapEnabled] = createSignal(false);
  const [isHistogramEnabled, setIsHistogramEnabled] = createSignal(true);
  const [isHistogramCumulative, setIsHistogramCumulative] = createSignal(true);
  const [histogramNormalization, setHistogramNormalization] = createSignal<HistogramNormalization>(
    HistogramNormalization.Linear,
  );
  const [histogramWindowFraction, setHistogramWindowFraction] = createSignal(0.01);
  const [viewport, setViewport] = createSignal<ChartViewport>({
    time: [startTime, startTime + 1 * 60 * 1000],
    price: [0.7, 1.3],
    resolution: [1, 1],
  });
  let previousCandleInterval = candleInterval();

  const rebuildCandles = (interval: number): PriceCandle[] => {
    const alignedStart = Math.floor(startTime / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= time(); candleStart += interval) {
      const candle = priceHistoryCandle(candleStart, Math.min(candleStart + interval, time()), "buy");
      rebuiltCandles.push(candle);
    }

    return rebuiltCandles;
  };

  const updateCandleInterval = (nextInterval: number): void => {
    setCandleInterval(nextInterval);
  };

  const candles = createThrottledMemo<PriceCandle[]>((currentCandles = []) => {
    const interval = candleInterval();

    if (interval !== previousCandleInterval) {
      previousCandleInterval = interval;
      return rebuildCandles(interval);
    }

    const candleStart = Math.floor(time() / interval) * interval;
    const candle = priceHistoryCandle(candleStart, time(), "buy");
    const latestCandle = currentCandles[currentCandles.length - 1];

    if (!latestCandle) return [candle];
    if (latestCandle.time === candle.time) return [...currentCandles.slice(0, -1), candle];
    if (latestCandle.time > candle.time) return currentCandles;

    const finalizedLatestCandle = priceHistoryCandle(latestCandle.time, latestCandle.time + interval, "buy");
    const missingCandles: PriceCandle[] = [];
    for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
      const candle = priceHistoryCandle(missingStart, missingStart + interval, "buy");
      missingCandles.push(candle);
    }

    return [...currentCandles.slice(0, -1), finalizedLatestCandle, ...missingCandles, candle];
  }, pollingInterval);

  const heatmap = createThrottledMemo(() => {
    if (!isHeatmapEnabled()) return null;
    return getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      resolution: viewport().resolution,
    });
  }, pollingInterval);

  const histogram = createThrottledMemo(() => {
    if (!isHistogramEnabled()) return null;
    return getOrderBookHistogram({
      price: viewport().price,
      resolution: viewport().resolution[1],
    });
  }, pollingInterval);

  const handleViewportChange = (nextViewport: ChartViewport) => {
    setViewport((current) => {
      if (
        current.resolution[0] === nextViewport.resolution[0] &&
        current.resolution[1] === nextViewport.resolution[1] &&
        current.time[0] === nextViewport.time[0] &&
        current.time[1] === nextViewport.time[1] &&
        current.price[0] === nextViewport.price[0] &&
        current.price[1] === nextViewport.price[1]
      ) {
        return current;
      }
      return nextViewport;
    });
  };

  onMount(() => {
    // todo: frame dependant tick, not fixed interval
    const simulationIntervalId = setInterval(() => simulation.tick(simulationTickTime), simulationTickTime);

    onCleanup(() => {
      clearInterval(simulationIntervalId);
    });
  });

  return (
    <div class="flex h-full w-full flex-col gap-4 bg-slate-950 p-4 text-slate-100">
      <div class="flex items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-xl tracking-[0.3em] text-slate-400">Market Sim</p>
          <p class="font-mono text-xs">buy / sell</p>
          <p class="font-mono text-xs">
            {formatNumber(priceSpread().buy, digits)} / {formatNumber(priceSpread().sell, digits)}
          </p>
        </div>
        <Order />
        <div class="max-w-5xl rounded border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
          <div class="mb-2 flex items-center justify-between gap-3">
            <p class="text-[10px] uppercase tracking-[0.2em] text-slate-500">Controls</p>
            <div class="flex overflow-hidden rounded border border-slate-700">
              <button
                class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                classList={{
                  "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950": activeSettingsTab() === "chart",
                }}
                type="button"
                onClick={() => setActiveSettingsTab("chart")}
              >
                Chart
              </button>
              <button
                class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                classList={{
                  "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950": activeSettingsTab() === "market",
                }}
                type="button"
                onClick={() => setActiveSettingsTab("market")}
              >
                Market
              </button>
            </div>
          </div>
          <Show when={activeSettingsTab() === "chart"}>
            <ChartSettings
              candleInterval={candleInterval}
              onCandleIntervalChange={updateCandleInterval}
              isHeatmapEnabled={isHeatmapEnabled}
              setIsHeatmapEnabled={setIsHeatmapEnabled}
              isHistogramEnabled={isHistogramEnabled}
              setIsHistogramEnabled={setIsHistogramEnabled}
              isHistogramCumulative={isHistogramCumulative}
              setIsHistogramCumulative={setIsHistogramCumulative}
              histogramNormalization={histogramNormalization}
              setHistogramNormalization={setHistogramNormalization}
              histogramWindowFraction={histogramWindowFraction}
              setHistogramWindowFraction={setHistogramWindowFraction}
            />
          </Show>
          <Show when={activeSettingsTab() === "market"}>
            <MarketSettings simulation={simulation} />
          </Show>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <div class="flex h-full min-h-0 gap-4">
          <Chart
            class="h-full min-w-0 flex-1"
            candleInterval={candleInterval()}
            priceCandles={candles()}
            orderBookHeatmap={heatmap()}
            viewport={viewport()}
            onViewportChange={handleViewportChange}
            showFrameRate={showFrameRate}
          />
          <Show when={histogram()}>
            {(histogramData) => (
              <div class="flex h-full w-[220px] min-h-0 flex-col overflow-hidden rounded border border-slate-800 bg-slate-900/60">
                <div class="border-b border-slate-800 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  Depth Histogram
                </div>
                <OrderBookHistogram
                  class="block h-full w-full"
                  data={histogramData()}
                  cumulative={isHistogramCumulative()}
                  normalization={histogramNormalization()}
                  windowFraction={histogramWindowFraction()}
                />
              </div>
            )}
          </Show>
        </div>
      </div>
    </div>
  );
};
