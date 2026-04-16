import { createSignal, onCleanup, onMount, type Component } from "solid-js";
import { run } from "./simulation";
import { TimeChart } from "@dschz/solid-lightweight-charts";
import type { CandlestickData, UTCTimestamp } from "lightweight-charts";
import { marketPriceSpread, priceHistoryCandle } from "./market";

const pollingInterval = 200;
const candleInterval = 5_000;

export const Chart: Component = () => {
  const [priceSpread, setPriceSpread] = createSignal(marketPriceSpread());
  const [candles, setCandles] = createSignal<CandlestickData[]>([]);

  const poll = () => {
    setPriceSpread(marketPriceSpread());

    const now = Date.now();
    const candleStart = Math.floor(now / candleInterval) * candleInterval;
    const utcTimestamp = Math.floor(candleStart / 1000) as UTCTimestamp;
    const candle = {
      time: utcTimestamp,
      ...priceHistoryCandle(candleStart, now, "buy"),
    };

    setCandles((candles) => {
      const latestCandle = candles[candles.length - 1];

      const candleChanged = latestCandle?.time !== candle.time;
      if (candleChanged) {
        return [...candles, candle];
      } else {
        return [...candles.slice(0, -1), candle];
      }
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
    <div class="flex h-screen flex-col gap-4 bg-slate-950 p-4 text-slate-100">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-xl uppercase tracking-[0.3em] text-slate-400">
            Market Sim
          </p>
          <p class="font-mono text-xs">
            {priceSpread().buy.toFixed(6)} / {priceSpread().sell.toFixed(6)}
          </p>
        </div>
      </div>
      <TimeChart
        class="h-96 w-full overflow-hidden rounded-xl border border-slate-800"
        rightPriceScale={{ borderVisible: false }}
        timeScale={{ timeVisible: true, secondsVisible: true }}
      >
        <TimeChart.Series
          type="Candlestick"
          data={candles()}
          priceFormat={{ type: "price", precision: 6, minMove: 1e-6 }}
        />
      </TimeChart>
    </div>
  );
};
