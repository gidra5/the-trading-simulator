import { createMemo, createSignal, onCleanup, onMount, type Component } from "solid-js";
import {
  getOrderBookHistogram,
  getOrderBookRegion,
  marketPriceSpread,
  PriceCandle,
  priceHistoryCandle,
} from "./market";
import { run } from "./simulation";
import { Chart, type ChartViewport } from "./Chart";

const pollingInterval = 200;
const startDate = Date.now();
const showFrameRate = true;
const formatCandleIntervalSeconds = (interval: number): string => String(interval / 1_000);

export const MarketChart: Component = () => {
  const [priceSpread, setPriceSpread] = createSignal(marketPriceSpread());
  const [candleInterval, setCandleInterval] = createSignal(1_000);
  const [candleIntervalInput, setCandleIntervalInput] = createSignal(formatCandleIntervalSeconds(1_000));
  const [candles, setCandles] = createSignal<PriceCandle[]>([]);
  const [isHeatmapEnabled, setIsHeatmapEnabled] = createSignal(false);
  const [isHistogramEnabled, setIsHistogramEnabled] = createSignal(false);
  const [viewport, setViewport] = createSignal<ChartViewport>({
    time: [startDate, startDate + 1 * 60 * 1000],
    price: [0.7, 1.3],
    resolution: [1, 1],
  });

  const heatmap = createMemo(() => {
    if (!isHeatmapEnabled()) return null;
    return getOrderBookRegion({
      timestamp: viewport().time,
      price: viewport().price,
      resolution: viewport().resolution,
    });
  });

  const histogram = createMemo(() => {
    if (!isHistogramEnabled()) return null;
    return getOrderBookHistogram({
      price: viewport().price,
      resolution: viewport().resolution[1],
    });
  });

  const rebuildCandles = (interval: number, now = Date.now()): PriceCandle[] => {
    const alignedStart = Math.floor(startDate / interval) * interval;
    const rebuiltCandles: PriceCandle[] = [];

    for (let candleStart = alignedStart; candleStart <= now; candleStart += interval) {
      rebuiltCandles.push(priceHistoryCandle(candleStart, Math.min(candleStart + interval, now), "buy"));
    }

    return rebuiltCandles;
  };

  const updateCandleInterval = (nextInterval: number): void => {
    setCandleInterval(nextInterval);
    setCandleIntervalInput(formatCandleIntervalSeconds(nextInterval));
    setCandles(rebuildCandles(nextInterval));
  };

  const handleCandleIntervalInput = (value: string): void => {
    setCandleIntervalInput(value);

    const nextIntervalSeconds = Number(value);
    if (!Number.isFinite(nextIntervalSeconds) || nextIntervalSeconds <= 0) {
      return;
    }

    updateCandleInterval(Math.round(nextIntervalSeconds * 1_000));
  };

  const poll = () => {
    const spread = marketPriceSpread();
    setPriceSpread(spread);

    const now = Date.now();
    const interval = candleInterval();
    const candleStart = Math.floor(now / interval) * interval;
    const candle = priceHistoryCandle(candleStart, now, "buy");

    setCandles((candles) => {
      const latestCandle = candles[candles.length - 1];
      if (!latestCandle) {
        return [candle];
      }

      if (latestCandle.time === candle.time) {
        return [...candles.slice(0, -1), candle];
      }

      if (latestCandle.time > candle.time) {
        return candles;
      }

      const missingCandles: PriceCandle[] = [];
      for (let missingStart = latestCandle.time + interval; missingStart < candle.time; missingStart += interval) {
        missingCandles.push(priceHistoryCandle(missingStart, missingStart + interval, "buy"));
      }

      return [...candles, ...missingCandles, candle];
    });
  };

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
    poll();

    const stopSimulation = run();
    const intervalId = setInterval(poll, pollingInterval);

    onCleanup(() => {
      clearInterval(intervalId);
      stopSimulation();
    });
  });

  return (
    <div class="flex h-full w-full flex-col gap-4 bg-slate-950 p-4 text-slate-100">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-xl tracking-[0.3em] text-slate-400">Market Sim</p>
          <p class="font-mono text-xs">
            {priceSpread().buy.toFixed(6)} / {priceSpread().sell.toFixed(6)}
          </p>
        </div>
        <div class="max-w-xl rounded border border-slate-800 bg-slate-900/80 px-3 py-2 font-mono text-[11px] leading-5 text-slate-300">
          <p class="mb-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">Controls</p>
          <p>Drag: pan viewport. Wheel: scale time. Shift + wheel: scale price. Ctrl + wheel: zoom both axes.</p>
          <label class="mt-2 flex items-center gap-2 text-slate-200">
            <span>Candle interval, s</span>
            <input
              class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
              type="number"
              step="0.1"
              value={candleIntervalInput()}
              onInput={(event) => handleCandleIntervalInput(event.currentTarget.value)}
              onBlur={() => setCandleIntervalInput(formatCandleIntervalSeconds(candleInterval()))}
            />
          </label>
          <label class="mt-2 flex items-center gap-2 text-slate-200">
            <input
              type="checkbox"
              checked={isHeatmapEnabled()}
              onInput={(event) => {
                const enabled = event.currentTarget.checked;
                setIsHeatmapEnabled(enabled);
              }}
            />
            <span>Show heatmap</span>
          </label>
        </div>
      </div>
      <div class="flex-1 min-h-0">
        <Chart
          class="h-full w-full"
          candleInterval={candleInterval()}
          priceCandles={candles()}
          orderBookHeatmap={heatmap()}
          viewport={viewport()}
          onViewportChange={handleViewportChange}
          showFrameRate={showFrameRate}
        />
      </div>
    </div>
  );
};
