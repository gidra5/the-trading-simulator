import { Show, createMemo, createSignal, onCleanup, onMount, type Component } from "solid-js";
import type { MarketState, PriceCandle, QuotePriceKind } from "../market/index";
import { HistogramNormalization } from "./OrderBookHistogram";
import { simulationTickTime, type TradingSimulation } from "../simulation/index";
import type { SimulationTimeState } from "../simulation/time";
import { Chart, type ChartViewport } from "./Chart";
import { ChartSettings, type OrderBookAccelerationSettings } from "./ChartSettings";
import { MarketSettings } from "./MarketSettings";
import { MarketPresets } from "./MarketPresets";
import { createThrottledMemo, formatNumber } from "../utils";
import { digits, Order } from "./Order";
import type { SimulationOrchestratorController } from "../simulation/orchestrator";

const pollingInterval = 200;
const showFrameRate = true;
type SettingsTab = "chart" | "market" | "presets";

export type MarketChartProps = {
  market: MarketState;
  marketModelController: SimulationOrchestratorController;
  orderBookAcceleration: OrderBookAccelerationSettings;
  simulation: TradingSimulation;
  time: SimulationTimeState;
};

export const MarketChart: Component<MarketChartProps> = (props) => {
  const startTime = props.time.time();
  const pricePoint: QuotePriceKind = "mid"; // todo: add to settings store
  const priceSpread = createThrottledMemo(props.market.marketPriceSpread, pollingInterval);
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
    price: [0, 1.3],
    resolution: [1, 1],
  });
  let previousCandleInterval = candleInterval();

  const rebuildCandles = (interval: number): PriceCandle[] => {
    const alignedStart = Math.floor(startTime / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= props.time.time(); candleStart += interval) {
      const candle = props.market.priceHistoryCandle(
        candleStart,
        Math.min(candleStart + interval, props.time.time()),
        pricePoint,
      );
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

    const candleStart = Math.floor(props.time.time() / interval) * interval;
    const candle = props.market.priceHistoryCandle(candleStart, props.time.time(), pricePoint);
    const latestCandle = currentCandles[currentCandles.length - 1];

    if (!latestCandle) return [candle];
    if (latestCandle.time === candle.time) return [...currentCandles.slice(0, -1), candle];
    if (latestCandle.time > candle.time) return currentCandles;

    const finalizedLatestCandle = props.market.priceHistoryCandle(
      latestCandle.time,
      latestCandle.time + interval,
      pricePoint,
    );
    const missingCandles: PriceCandle[] = [];
    for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
      const candle = props.market.priceHistoryCandle(missingStart, missingStart + interval, pricePoint);
      missingCandles.push(candle);
    }

    return [...currentCandles.slice(0, -1), finalizedLatestCandle, ...missingCandles, candle];
  }, pollingInterval);

  const heatmap = createThrottledMemo(() => {
    if (!isHeatmapEnabled()) return null;
    return props.market.getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      resolution: viewport().resolution,
    });
  }, pollingInterval);

  const histogram = createThrottledMemo(() => {
    if (!isHistogramEnabled()) return null;
    return props.market.getOrderBookHistogram({
      price: viewport().price,
      resolution: viewport().resolution[1],
    });
  }, pollingInterval);
  const chartHistogram = createMemo(() => {
    const data = histogram();
    if (!data) return null;

    return {
      cumulative: isHistogramCumulative(),
      data,
      normalization: histogramNormalization(),
      windowFraction: histogramWindowFraction(),
    };
  });

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
    const simulationIntervalId = setInterval(() => props.simulation.tick(simulationTickTime), simulationTickTime);

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
              <button
                class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                classList={{
                  "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950":
                    activeSettingsTab() === "presets",
                }}
                type="button"
                onClick={() => setActiveSettingsTab("presets")}
              >
                Presets
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
              orderBookAcceleration={props.orderBookAcceleration}
            />
          </Show>
          <Show when={activeSettingsTab() === "market"}>
            <MarketSettings controller={props.marketModelController} />
          </Show>
          <Show when={activeSettingsTab() === "presets"}>
            <MarketPresets controller={props.marketModelController} />
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
            orderBookHistogram={chartHistogram()}
            viewport={viewport()}
            onViewportChange={handleViewportChange}
            showFrameRate={showFrameRate}
          />
          <Order market={props.market} time={props.time} />
        </div>
      </div>
    </div>
  );
};
