import {
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from "solid-js";
import type {
  OrderBookHeatmap,
  OrderBookHeatmapProfile,
  OrderBookHistogramEntry,
  PriceCandle,
} from "./market";
import clsx from "clsx";
import {
  drawFrame,
  getCanvasResolution,
  initializeRenderer,
  type HeatmapTextureUploadStats,
  type RendererState,
  writeCandleInstances,
  writeChartUniforms,
  writeHeatmapTexture,
} from "./chartUtils";
import { createChartControls } from "./chartControls";

export type ChartViewport = {
  time: [from: number, to: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};

export type ChartProps = {
  priceCandles: PriceCandle[];
  orderBookHeatmap: OrderBookHeatmap;
  orderBookHistogram: OrderBookHistogramEntry[];
  viewport: ChartViewport;
  candleInterval: number;
  onViewportChange?: (viewport: ChartViewport) => void;
  showFrameRate?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
};

type TimingAccumulator = {
  last: number;
  total: number;
  count: number;
  max: number;
};

type TimingMetric = {
  last: number;
  avg: number;
  max: number;
  count: number;
};

export type HeatmapDiagnostics = {
  heatmap: OrderBookHeatmapProfile;
  frame: TimingMetric;
  heatmapUpload: TimingMetric;
  candleUpload: TimingMetric;
  drawSubmit: TimingMetric;
  heatmapUploadBytes: number;
};

export type ChartProfileSnapshot = {
  timestamp: number;
  status: string | null;
  frameRate: number | null;
  viewport: ChartViewport;
  canvasResolution: [width: number, height: number] | null;
  canvasCssSize: [width: number, height: number] | null;
  devicePixelRatio: number;
  diagnostics: HeatmapDiagnostics | null;
};

declare global {
  interface Window {
    __chartProfile?: {
      getSnapshot: () => ChartProfileSnapshot;
    };
  }
}

const viewportMatches = (left: ChartViewport, right: ChartViewport): boolean =>
  left.time[0] === right.time[0] &&
  left.time[1] === right.time[1] &&
  left.price[0] === right.price[0] &&
  left.price[1] === right.price[1] &&
  left.resolution[0] === right.resolution[0] &&
  left.resolution[1] === right.resolution[1];

const createTimingAccumulator = (): TimingAccumulator => ({
  last: 0,
  total: 0,
  count: 0,
  max: 0,
});

const recordTiming = (
  accumulator: TimingAccumulator,
  durationMs: number,
): void => {
  accumulator.last = durationMs;
  accumulator.total += durationMs;
  accumulator.count += 1;
  accumulator.max = Math.max(accumulator.max, durationMs);
};

const summarizeTiming = (accumulator: TimingAccumulator): TimingMetric => ({
  last: accumulator.last,
  avg: accumulator.count > 0 ? accumulator.total / accumulator.count : 0,
  max: accumulator.max,
  count: accumulator.count,
});

const formatMs = (value: number): string => `${value.toFixed(2)}ms`;
const formatBytes = (value: number): string =>
  value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(2)}MB`
    : `${(value / 1024).toFixed(1)}KB`;

// todo: micro and macro candles to smoothly transition between scales
// todo: side panel with order book histogram
export const Chart: Component<ChartProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: RendererState | undefined;
  let animationFrame = 0;
  let configuredWidth = 0;
  let configuredHeight = 0;
  let lastReportedViewport: ChartViewport | undefined;
  let uploadedHeatmap: OrderBookHeatmap | undefined;
  let frameRateWindowStart = 0;
  let frameCount = 0;
  let latestHeatmapProfile = props.orderBookHeatmap.profile;
  let latestHeatmapUploadStats: HeatmapTextureUploadStats | null = null;
  const frameTiming = createTimingAccumulator();
  const heatmapUploadTiming = createTimingAccumulator();
  const candleUploadTiming = createTimingAccumulator();
  const drawSubmitTiming = createTimingAccumulator();

  const [status, setStatus] = createSignal<string | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [frameRate, setFrameRate] = createSignal<number | null>(null);
  const [heatmapDiagnostics, setHeatmapDiagnostics] =
    createSignal<HeatmapDiagnostics | null>(null);
  const chartProfileHandle =
    typeof window === "undefined"
      ? undefined
      : {
          getSnapshot: (): ChartProfileSnapshot => ({
            timestamp: Date.now(),
            status: status(),
            frameRate: frameRate(),
            viewport: {
              time: [...props.viewport.time] as [number, number],
              price: [...props.viewport.price] as [number, number],
              resolution: [...props.viewport.resolution] as [number, number],
            },
            canvasResolution: canvas ? getCanvasResolution(canvas) : null,
            canvasCssSize: canvas
              ? ([canvas.clientWidth, canvas.clientHeight] as [number, number])
              : null,
            devicePixelRatio: window.devicePixelRatio || 1,
            diagnostics: heatmapDiagnostics(),
          }),
        };

  const reportViewport = (viewport: Pick<ChartViewport, "time" | "price">) => {
    if (!canvas) {
      return;
    }

    const nextViewport: ChartViewport = {
      time: viewport.time,
      price: viewport.price,
      resolution: getCanvasResolution(canvas),
    };

    if (
      lastReportedViewport &&
      viewportMatches(lastReportedViewport, nextViewport)
    ) {
      return;
    }

    lastReportedViewport = nextViewport;
    props.onViewportChange?.(nextViewport);
  };

  const updateViewport = (
    viewport: Pick<ChartViewport, "time" | "price">,
  ): void => {
    reportViewport(viewport);
  };
  const controls = createChartControls({
    getCanvas: () => canvas,
    getViewport: () => props.viewport,
    setDragging: setIsDragging,
    updateViewport,
  });

  const syncCanvasSize = () => {
    if (!canvas || !renderer) {
      return false;
    }

    const [width, height] = getCanvasResolution(canvas);

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    if (configuredWidth !== width || configuredHeight !== height) {
      renderer.context.configure({
        device: renderer.device,
        format: renderer.format,
        alphaMode: "opaque",
      });
      configuredWidth = width;
      configuredHeight = height;
    }

    reportViewport(props.viewport);
    return true;
  };

  const draw = () => {
    if (!canvas || !renderer) {
      return;
    }

    if (!syncCanvasSize()) {
      return;
    }

    const frameStart = performance.now();
    writeChartUniforms(renderer, props.viewport, props.candleInterval);
    if (uploadedHeatmap !== props.orderBookHeatmap) {
      latestHeatmapProfile = props.orderBookHeatmap.profile;
      const heatmapUploadStart = performance.now();
      latestHeatmapUploadStats = writeHeatmapTexture(
        renderer,
        props.orderBookHeatmap,
      );
      recordTiming(
        heatmapUploadTiming,
        performance.now() - heatmapUploadStart,
      );
      uploadedHeatmap = props.orderBookHeatmap;
    }
    const candleUploadStart = performance.now();
    const candleInstanceCount = writeCandleInstances(
      renderer,
      props.viewport,
      props.priceCandles,
      props.candleInterval,
    );
    recordTiming(candleUploadTiming, performance.now() - candleUploadStart);
    const drawSubmitStart = performance.now();
    drawFrame(renderer, candleInstanceCount);
    recordTiming(drawSubmitTiming, performance.now() - drawSubmitStart);
    recordTiming(frameTiming, performance.now() - frameStart);
  };

  onMount(() => {
    if (chartProfileHandle) {
      window.__chartProfile = chartProfileHandle;
    }

    reportViewport(props.viewport);

    void (async () => {
      if (!canvas) {
        return;
      }

      try {
        renderer = await initializeRenderer(canvas);
        setStatus(null);
        void renderer.device.lost.then((info: GPUDeviceLostInfo) => {
          setStatus(
            `WebGPU device was lost${info.message ? `: ${info.message}` : "."}`,
          );
        });

        const renderFrame = (timestamp: number) => {
          if (frameRateWindowStart === 0) {
            frameRateWindowStart = timestamp;
          }

          draw();
          frameCount += 1;

          const elapsed = timestamp - frameRateWindowStart;
          if (elapsed >= 500) {
            setFrameRate((frameCount * 1000) / elapsed);
            setHeatmapDiagnostics({
              heatmap: latestHeatmapProfile,
              frame: summarizeTiming(frameTiming),
              heatmapUpload: summarizeTiming(heatmapUploadTiming),
              candleUpload: summarizeTiming(candleUploadTiming),
              drawSubmit: summarizeTiming(drawSubmitTiming),
              heatmapUploadBytes: latestHeatmapUploadStats?.totalBytes ?? 0,
            });
            frameCount = 0;
            frameRateWindowStart = timestamp;
          }

          animationFrame = window.requestAnimationFrame(renderFrame);
        };

        animationFrame = window.requestAnimationFrame(renderFrame);
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "Failed to initialize WebGPU.",
        );
      }
    })();

    onCleanup(() => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
      controls.dispose();
      renderer = undefined;
      configuredWidth = 0;
      configuredHeight = 0;
      lastReportedViewport = undefined;
      uploadedHeatmap = undefined;
      frameRateWindowStart = 0;
      frameCount = 0;
      setFrameRate(null);
      if (chartProfileHandle && window.__chartProfile === chartProfileHandle) {
        delete window.__chartProfile;
      }
    });
  });

  return (
    <div
      ref={container}
      class={clsx(`relative overflow-hidden`, props.class ?? "")}
      style={props.style}
    >
      <canvas
        ref={canvas}
        class={clsx(
          "block h-full w-full touch-none",
          isDragging() && "cursor-grabbing",
          !isDragging() && "cursor-grab",
        )}
        onPointerDown={controls.handlePointerDown}
        onPointerMove={controls.handlePointerMove}
        onPointerUp={controls.handlePointerUp}
        onPointerCancel={controls.handlePointerCancel}
        onWheel={controls.handleWheel}
      />
      <Show when={status()}>
        {(message) => (
          <div class="pointer-events-none absolute inset-x-4 bottom-4 rounded border border-amber-300/30 bg-black/40 px-3 py-2 font-mono text-xs text-amber-100 backdrop-blur">
            {message()}
          </div>
        )}
      </Show>
      <Show when={props.showFrameRate && frameRate() !== null}>
        <div class="pointer-events-none absolute right-4 top-4 rounded border border-cyan-300/20 bg-slate-950/75 px-2 py-1 font-mono text-[11px] text-cyan-100 backdrop-blur">
          {frameRate()!.toFixed(1)} FPS
        </div>
      </Show>
      <Show when={props.showFrameRate ? heatmapDiagnostics() : null}>
        {(diagnostics) => (
          <div class="pointer-events-none absolute left-4 top-4 rounded border border-lime-300/20 bg-slate-950/75 px-3 py-2 font-mono text-[11px] leading-5 text-lime-100 backdrop-blur">
            <div>
              heatmap {diagnostics().heatmap.width}x{diagnostics().heatmap.height} (
              {diagnostics().heatmap.cellCount.toLocaleString()} cells)
            </div>
            <div>
              build {formatMs(diagnostics().heatmap.computeMs)} | upload{" "}
              {formatMs(diagnostics().heatmapUpload.last)} (
              {formatBytes(diagnostics().heatmapUploadBytes)})
            </div>
            <div>
              checkpoints {diagnostics().heatmap.checkpointCount} | seed{" "}
              {diagnostics().heatmap.checkpointDeltaIndex} | replay{" "}
              {diagnostics().heatmap.replayedDeltaCount} | range{" "}
              {diagnostics().heatmap.inRangeDeltaCount}
            </div>
            <div>
              columns {diagnostics().heatmap.columnsAccumulated} | level visits{" "}
              {diagnostics().heatmap.accumulatedLevelCount.toLocaleString()}
            </div>
            <Show when={diagnostics().heatmap.cacheLevel}>
              {(cacheLevel) => (
                <div>
                  cache {cacheLevel()[0]}/{cacheLevel()[1]} | tiles{" "}
                  {diagnostics().heatmap.cacheTileCount ?? 0} (
                  {diagnostics().heatmap.cacheTilesBuilt ?? 0} built /{" "}
                  {diagnostics().heatmap.cacheTilesReused ?? 0} reused)
                </div>
              )}
            </Show>
            <div>
              submit {formatMs(diagnostics().drawSubmit.last)} | candle{" "}
              {formatMs(diagnostics().candleUpload.last)} | frame{" "}
              {formatMs(diagnostics().frame.last)}
            </div>
          </div>
        )}
      </Show>
    </div>
  );
};
