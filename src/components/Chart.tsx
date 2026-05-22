import { createMemo, createSignal, For, onCleanup, onMount, Show, type Component, type JSX } from "solid-js";
import type { OrderBookHeatmapEntry, PriceCandle } from "../market/index";
import clsx from "clsx";
import {
  drawFrame,
  getCanvasResolution,
  initializeRenderer,
  type RendererState,
  writeCandleInstances,
  writeChartUniforms,
  writeHeatmapTexture,
} from "./chartUtils";
import { createChartControls } from "./chartControls";
import { formatNumber } from "../utils";

export type ChartViewport = {
  time: [from: number, to: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};

export type ChartProps = {
  priceCandles: PriceCandle[];
  orderBookHeatmap: OrderBookHeatmapEntry[] | null;
  viewport: ChartViewport;
  candleInterval: number;
  onViewportChange?: (viewport: ChartViewport) => void;
  showFrameRate: boolean;
  class?: string;
  style?: JSX.CSSProperties;
};

const viewportMatches = (left: ChartViewport, right: ChartViewport): boolean =>
  left.time[0] === right.time[0] &&
  left.time[1] === right.time[1] &&
  left.price[0] === right.price[0] &&
  left.price[1] === right.price[1] &&
  left.resolution[0] === right.resolution[0] &&
  left.resolution[1] === right.resolution[1];

// TODO: fixed candle interval relative to viewport
// TODO: micro and macro candles to smoothly transition between scales
// TODO: side panel with order book histogram
// todo: crosshair
// todo: drawing tools?
type ChartMark = {
  label: string;
  position: number;
};

const markCount = 5;

const buildLinearMarks = (range: [number, number], formatLabel: (value: number) => string): ChartMark[] => {
  const span = range[1] - range[0];
  if (!Number.isFinite(span) || span <= 0) return [];

  return Array.from({ length: markCount }, (_, index) => {
    const ratio = index / (markCount - 1);
    const value = range[0] + span * ratio;

    return {
      label: formatLabel(value),
      position: ratio,
    };
  });
};

const formatPriceMark = (value: number): string => {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 100 ? 2 : magnitude >= 10 ? 3 : 4;
  return formatNumber(value, digits);
};

const formatDuration = (milliseconds: number): string => {
  const sign = milliseconds < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(milliseconds) / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
};

export const Chart: Component<ChartProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: RendererState | undefined;
  let animationFrame = 0;
  let configuredWidth = 0;
  let configuredHeight = 0;
  let lastReportedViewport: ChartViewport | undefined;
  let lastWrittenHeatmap: OrderBookHeatmapEntry[] | undefined;
  let frameRateWindowStart = 0;
  let frameCount = 0;

  const [status, setStatus] = createSignal<string | null>(null);
  const [isDragging, setIsDragging] = createSignal(false);
  const [frameRate, setFrameRate] = createSignal<number | null>(null);
  const priceMarks = createMemo(() => buildLinearMarks(props.viewport.price, formatPriceMark));
  const timeMarks = createMemo(() => buildLinearMarks(props.viewport.time, formatDuration));
  const latestPriceMark = createMemo(() => {
    const latestCandle = props.priceCandles[props.priceCandles.length - 1];
    if (!latestCandle) return null;

    const priceSpan = props.viewport.price[1] - props.viewport.price[0];
    if (!Number.isFinite(priceSpan) || priceSpan <= 0) return null;

    const position = 1 - (latestCandle.close - props.viewport.price[0]) / priceSpan;
    if (position < 0 || position > 1) return null;

    return {
      label: formatPriceMark(latestCandle.close),
      position,
    };
  });

  const reportViewport = (viewport: Pick<ChartViewport, "time" | "price">) => {
    if (!canvas) {
      return;
    }

    const nextViewport: ChartViewport = {
      time: viewport.time,
      price: viewport.price,
      resolution: getCanvasResolution(canvas),
    };

    if (lastReportedViewport && viewportMatches(lastReportedViewport, nextViewport)) {
      return;
    }

    lastReportedViewport = nextViewport;
    props.onViewportChange?.(nextViewport);
  };

  const updateViewport = (viewport: Pick<ChartViewport, "time" | "price">): void => {
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

    writeChartUniforms(renderer, props.viewport, props.candleInterval);
    if (props.orderBookHeatmap && props.orderBookHeatmap !== lastWrittenHeatmap) {
      writeHeatmapTexture(renderer, props.orderBookHeatmap);
      lastWrittenHeatmap = props.orderBookHeatmap;
    } else if (!props.orderBookHeatmap) {
      lastWrittenHeatmap = undefined;
    }
    const candleInstanceCount = writeCandleInstances(
      renderer,
      props.viewport,
      props.priceCandles,
      props.candleInterval,
    );
    drawFrame(renderer, candleInstanceCount, props.orderBookHeatmap !== null);
  };

  onMount(() => {
    reportViewport(props.viewport);

    void (async () => {
      if (!canvas) {
        return;
      }

      try {
        renderer = await initializeRenderer(canvas);
        setStatus(null);

        const renderFrame = (timestamp: number) => {
          if (frameRateWindowStart === 0) {
            frameRateWindowStart = timestamp;
          }

          draw();
          frameCount += 1;

          const elapsed = timestamp - frameRateWindowStart;
          if (elapsed >= 500) {
            setFrameRate((frameCount * 1000) / elapsed);
            frameCount = 0;
            frameRateWindowStart = timestamp;
          }

          animationFrame = window.requestAnimationFrame(renderFrame);
        };

        animationFrame = window.requestAnimationFrame(renderFrame);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Failed to initialize WebGPU.");
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
      lastWrittenHeatmap = undefined;
      frameRateWindowStart = 0;
      frameCount = 0;
      setFrameRate(null);
    });
  });

  return (
    <div ref={container} class={clsx(`relative overflow-hidden`, props.class ?? "")} style={props.style}>
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
      <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <For each={priceMarks()}>
          {(mark) => {
            const y = `${(1 - mark.position) * 100}%`;

            return (
              <g>
                <line x1="0" x2="100%" y1={y} y2={y} stroke="rgba(148, 163, 184, 0.16)" stroke-width="1" />
                <text x="99%" y={y} dy="-4" text-anchor="end" class="fill-slate-400 font-mono text-[10px]">
                  {mark.label}
                </text>
              </g>
            );
          }}
        </For>
        <For each={timeMarks()}>
          {(mark) => {
            const x = `${mark.position * 100}%`;

            return (
              <g>
                <line x1={x} x2={x} y1="0" y2="100%" stroke="rgba(148, 163, 184, 0.12)" stroke-width="1" />
                <text x={x} y="98%" text-anchor="middle" class="fill-slate-500 font-mono text-[10px]">
                  {mark.label}
                </text>
              </g>
            );
          }}
        </For>
        <Show when={latestPriceMark()}>
          {(mark) => {
            const y = `${mark().position * 100}%`;

            return (
              <g>
                <line x1="0" x2="100%" y1={y} y2={y} stroke="rgba(34, 211, 238, 0.58)" stroke-width="1" />
                <text x="99%" y={y} dy="13" text-anchor="end" class="fill-cyan-200 font-mono text-[10px]">
                  {mark().label}
                </text>
              </g>
            );
          }}
        </Show>
      </svg>
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
    </div>
  );
};
