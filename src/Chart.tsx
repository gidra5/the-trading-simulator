import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  type Component,
} from "solid-js";
import { TimeChart } from "@dschz/solid-lightweight-charts";
import type {
  CandlestickData,
  IChartApi,
  ISeriesApi,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { OrderBookHeatmap, OrderBookHistogram } from "./OrderBookHeatmap";
import {
  getOrderBookHistogram,
  getOrderBookRegion,
  marketPriceSpread,
  priceHistoryCandle,
  type OrderBookHeatmapEntry,
  type OrderBookHeatmapRegion,
  type OrderBookHistogramEntry,
} from "./market";
import { run } from "./simulation";

const pollingInterval = 200;
const candleInterval = 5_000;
const histogramWidth = 128;
const heatmapViewportBleedCells = 1;
const heatmapViewportResolution: [time: number, price: number] = [320, 72];
const heatmapRenderResolution: [time: number, price: number] = [
  heatmapViewportResolution[0] + heatmapViewportBleedCells * 2,
  heatmapViewportResolution[1],
];
const defaultPlotArea = {
  width: 0,
  height: 340,
  timeScaleHeight: 44,
};

const normalizeRange = (
  [start, end]: [number, number],
  fallbackSpan: number,
): [number, number] => {
  const safeStart = Number.isFinite(start) ? start : 0;
  const safeEnd = Number.isFinite(end) ? end : safeStart + fallbackSpan;

  if (safeStart === safeEnd) {
    const halfSpan = Math.max(fallbackSpan, Number.EPSILON) / 2;
    return [safeStart - halfSpan, safeEnd + halfSpan];
  }

  return safeStart < safeEnd ? [safeStart, safeEnd] : [safeEnd, safeStart];
};

const toUnixMilliseconds = (time: Time): number => {
  if (typeof time === "number") {
    return time * 1000;
  }

  if (typeof time === "string") {
    return Date.parse(time);
  }

  return Date.UTC(time.year, time.month - 1, time.day);
};

const candleTimeRange = (
  candles: CandlestickData[],
): [number, number] | null => {
  const firstCandle = candles[0];
  const lastCandle = candles[candles.length - 1];
  if (!firstCandle || !lastCandle) {
    return null;
  }

  return [
    Number(firstCandle.time) * 1000,
    Number(lastCandle.time) * 1000 + candleInterval,
  ];
};

const logicalTimeRange = (
  candles: CandlestickData[],
  logicalRange: { from: number; to: number },
): [number, number] | null => {
  const firstCandle = candles[0];
  if (!firstCandle) {
    return null;
  }

  const baseTimestamp = Number(firstCandle.time) * 1000;
  return [
    baseTimestamp + logicalRange.from * candleInterval,
    baseTimestamp + logicalRange.to * candleInterval,
  ];
};

const expandLogicalRangeByCells = (
  logicalRange: { from: number; to: number },
  resolution: number,
  bleedCells: number,
) => {
  if (resolution <= 0 || bleedCells <= 0) {
    return logicalRange;
  }

  const logicalUnitsPerCell =
    (logicalRange.to - logicalRange.from) / resolution;
  return {
    from: logicalRange.from - logicalUnitsPerCell * bleedCells,
    to: logicalRange.to + logicalUnitsPerCell * bleedCells,
  };
};

const expandTimeRangeByCells = (
  timestampRange: [number, number],
  resolution: number,
  bleedCells: number,
): [number, number] => {
  if (resolution <= 0 || bleedCells <= 0) {
    return timestampRange;
  }

  const cellDuration = (timestampRange[1] - timestampRange[0]) / resolution;
  return [
    timestampRange[0] - cellDuration * bleedCells,
    timestampRange[1] + cellDuration * bleedCells,
  ];
};

const heatmapBleedWidth = (plotWidth: number): number =>
  plotWidth <= 0
    ? 0
    : (plotWidth / heatmapViewportResolution[0]) * heatmapViewportBleedCells;

export const Chart: Component = () => {
  const [priceSpread, setPriceSpread] = createSignal(marketPriceSpread());
  const [candles, setCandles] = createSignal<CandlestickData[]>([]);
  const [chartApi, setChartApi] = createSignal<IChartApi | null>(null);
  const [candleSeries, setCandleSeries] =
    createSignal<ISeriesApi<"Candlestick"> | null>(null);
  const [heatmapData, setHeatmapData] = createSignal<OrderBookHeatmapEntry[]>(
    [],
  );
  const [histogramData, setHistogramData] = createSignal<
    OrderBookHistogramEntry[]
  >([]);
  const [plotArea, setPlotArea] = createSignal(defaultPlotArea);

  let syncFrame = 0;
  const scheduleOverlaySync = () => {
    if (syncFrame !== 0) {
      cancelAnimationFrame(syncFrame);
    }

    syncFrame = requestAnimationFrame(() => {
      syncFrame = 0;
      syncOverlays();
    });
  };

  const syncPlotArea = () => {
    const chart = chartApi();
    if (!chart) {
      return defaultPlotArea;
    }

    const chartElement = chart.chartElement();
    const nextPlotArea = {
      width: Math.max(
        chartElement.clientWidth - chart.priceScale("right").width(),
        0,
      ),
      height: Math.max(
        chartElement.clientHeight - chart.timeScale().height(),
        0,
      ),
      timeScaleHeight: chart.timeScale().height(),
    };

    setPlotArea(nextPlotArea);
    return nextPlotArea;
  };

  const syncOverlays = () => {
    const chart = chartApi();
    const series = candleSeries();
    if (!chart || !series) {
      return;
    }

    const nextPlotArea = syncPlotArea();
    const timeScale = chart.timeScale();
    const viewportLogicalRange = (() => {
      const from = timeScale.coordinateToLogical(0);
      const to = timeScale.coordinateToLogical(nextPlotArea.width);
      if (from !== null && to !== null) {
        return expandLogicalRangeByCells(
          { from, to },
          heatmapViewportResolution[0],
          heatmapViewportBleedCells,
        );
      }

      const visibleLogicalRange = timeScale.getVisibleLogicalRange();
      return visibleLogicalRange
        ? expandLogicalRangeByCells(
            visibleLogicalRange,
            heatmapViewportResolution[0],
            heatmapViewportBleedCells,
          )
        : null;
    })();
    const logicalViewportTimeRange = viewportLogicalRange
      ? logicalTimeRange(candles(), viewportLogicalRange)
      : null;

    const fallbackVisibleTimeRange =
      timeScale.getVisibleRange() ?? candleTimeRange(candles());
    const visiblePriceRange = series.priceScale().getVisibleRange();
    if (
      (!logicalViewportTimeRange && !fallbackVisibleTimeRange) ||
      !visiblePriceRange
    ) {
      return;
    }

    const timestampRange = logicalViewportTimeRange
      ? normalizeRange(logicalViewportTimeRange, candleInterval)
      : expandTimeRangeByCells(
          normalizeRange(
            Array.isArray(fallbackVisibleTimeRange)
              ? fallbackVisibleTimeRange
              : ([
                  toUnixMilliseconds(fallbackVisibleTimeRange.from),
                  toUnixMilliseconds(fallbackVisibleTimeRange.to),
                ] as [number, number]),
            candleInterval,
          ),
          heatmapViewportResolution[0],
          heatmapViewportBleedCells,
        );
    const priceRange = normalizeRange(
      [visiblePriceRange.from, visiblePriceRange.to],
      Math.max(Math.abs(priceSpread().buy - priceSpread().sell) * 16, 0.02),
    );

    const region: OrderBookHeatmapRegion = {
      timestamp: timestampRange,
      price: priceRange,
      resolution: heatmapRenderResolution,
    };

    setHeatmapData(getOrderBookRegion(region));
    setHistogramData(
      getOrderBookHistogram({
        price: region.price,
        resolution: region.resolution[1],
      }),
    );
  };

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
      if (syncFrame !== 0) {
        cancelAnimationFrame(syncFrame);
      }
      clearInterval(intervalId);
      stopSimulation();
    });
  });

  createEffect(() => {
    candles();
    scheduleOverlaySync();
  });

  createEffect(() => {
    chartApi();
    candleSeries();
    scheduleOverlaySync();
  });

  createEffect(() => {
    const chart = chartApi();
    if (!chart) {
      return;
    }

    const handleChartChange = () => {
      scheduleOverlaySync();
    };
    const resizeObserver = new ResizeObserver(handleChartChange);

    chart.timeScale().subscribeVisibleTimeRangeChange(handleChartChange);
    chart.timeScale().subscribeVisibleLogicalRangeChange(handleChartChange);
    chart.timeScale().subscribeSizeChange(handleChartChange);
    resizeObserver.observe(chart.chartElement());

    onCleanup(() => {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(handleChartChange);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(handleChartChange);
      chart.timeScale().unsubscribeSizeChange(handleChartChange);
      resizeObserver.disconnect();
    });
  });

  return (
    <div class="flex h-screen flex-col gap-4 bg-slate-950 p-4 text-slate-100">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div class="flex flex-col gap-1">
          <p class="text-xl tracking-[0.3em] text-slate-400">Market Sim</p>
          <p class="font-mono text-xs">
            {priceSpread().buy.toFixed(6)} / {priceSpread().sell.toFixed(6)}
          </p>
        </div>
      </div>
      <div class="flex h-96 gap-3">
        <div class="relative min-w-0 flex-1">
          <TimeChart
            class="h-full w-full overflow-hidden rounded-xl border border-slate-800"
            rightPriceScale={{ borderVisible: false }}
            timeScale={{ timeVisible: true, secondsVisible: true }}
            onCreateChart={(chart) => {
              setChartApi(chart);
              scheduleOverlaySync();
            }}
          >
            <TimeChart.Series
              type="Candlestick"
              data={candles()}
              priceFormat={{ type: "price", precision: 6, minMove: 1e-6 }}
              onCreateSeries={(series) => {
                setCandleSeries(series);
                scheduleOverlaySync();
              }}
            />
          </TimeChart>
          <OrderBookHeatmap
            class="pointer-events-none absolute top-0 z-10 opacity-90"
            data={heatmapData()}
            resolution={heatmapRenderResolution}
            width={plotArea().width + heatmapBleedWidth(plotArea().width) * 2}
            height={plotArea().height}
            style={{ left: `-${heatmapBleedWidth(plotArea().width)}px` }}
          />
        </div>
        <div class="flex w-32 shrink-0 flex-col">
          <div
            class="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70"
            style={{ height: `${plotArea().height}px` }}
          >
            <OrderBookHistogram
              class="pointer-events-none absolute inset-0"
              data={histogramData()}
              width={histogramWidth}
              height={plotArea().height}
            />
          </div>
          <div
            class="flex items-center justify-center text-[10px] uppercase tracking-[0.28em] text-slate-500"
            style={{ height: `${plotArea().timeScaleHeight}px` }}
          >
            Depth
          </div>
        </div>
      </div>
    </div>
  );
};
