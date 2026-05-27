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
// todo: drawing tools?
// todo: smooth transition between scales
// todo: move constants into settings
// todo: review slop
type ChartMark = {
  label: string;
  position: number;
};

type PointerPosition = {
  x: number;
  y: number;
};

const maxMarkGapPx = 160;
const priceMarkBaseInterval = 0.25;
const timeMarkBaseInterval = 25_000;

const getDivisibleIntervalAtOrBelow = (maximumInterval: number, baseInterval: number): number => {
  if (maximumInterval <= 0) return baseInterval;

  return baseInterval * 2 ** Math.floor(Math.log2(maximumInterval / baseInterval));
};

const getFixedMarkInterval = (range: [number, number], pixelSpan: number, baseInterval: number): number => {
  const span = range[1] - range[0];
  if (span <= 0 || pixelSpan <= 0) return baseInterval;

  return getDivisibleIntervalAtOrBelow((span * maxMarkGapPx) / pixelSpan, baseInterval);
};

const normalizeMarkValue = (value: number, interval: number): number =>
  Math.abs(value) < interval / 1_000 ? 0 : value;

const buildFixedMarks = (
  range: [number, number],
  interval: number,
  formatLabel: (value: number, interval: number) => string,
): ChartMark[] => {
  const span = range[1] - range[0];
  if (span <= 0 || interval <= 0) return [];

  const firstIndex = Math.ceil(range[0] / interval);
  const lastIndex = Math.floor(range[1] / interval);
  const marks: ChartMark[] = [];

  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const value = normalizeMarkValue(index * interval, interval);

    marks.push({
      label: formatLabel(value, interval),
      position: (value - range[0]) / span,
    });
  }

  return marks;
};

const trimFixed = (value: string): string => (value.includes(".") ? value.replace(/\.?0+$/, "") : value);

const getDecimalPlaces = (value: number): number => {
  let digits = 0;
  let scaledValue = value;

  while (digits < 8 && Math.abs(Math.round(scaledValue) - scaledValue) > 0.000_000_01) {
    scaledValue *= 10;
    digits += 1;
  }

  return digits;
};

const formatPriceMark = (value: number, interval: number): string => {
  const magnitude = Math.abs(value);
  const magnitudeDigits = magnitude >= 100 ? 2 : magnitude >= 10 ? 3 : 4;
  const digits = Math.max(magnitudeDigits, getDecimalPlaces(interval));
  return formatNumber(value, digits);
};

const formatDuration = (milliseconds: number, interval: number): string => {
  const sign = milliseconds < 0 ? "-" : "";
  const absoluteMilliseconds = Math.abs(milliseconds);

  if (interval < 60_000) {
    const digits = getDecimalPlaces(interval / 1_000);
    return `${sign}${trimFixed((absoluteMilliseconds / 1_000).toFixed(digits))}s`;
  }

  const totalSeconds = Math.floor(absoluteMilliseconds / 1_000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  if (hours > 0) {
    return `${sign}${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
};

const formatCursorDuration = (milliseconds: number, interval: number): string => {
  const sign = milliseconds < 0 ? "-" : "";
  const absoluteMilliseconds = Math.abs(milliseconds);

  if (interval < 60_000) {
    const digits = getDecimalPlaces(interval / 1_000);
    return `${sign}${(absoluteMilliseconds / 1_000).toFixed(digits)}s`;
  }

  return formatDuration(milliseconds, interval);
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
  const [pointerPosition, setPointerPosition] = createSignal<PointerPosition | null>(null);
  const priceMarkInterval = createMemo(() =>
    getFixedMarkInterval(props.viewport.price, props.viewport.resolution[1], priceMarkBaseInterval),
  );
  const timeMarkInterval = createMemo(() =>
    getFixedMarkInterval(props.viewport.time, props.viewport.resolution[0], timeMarkBaseInterval),
  );
  const priceMarks = createMemo(() => buildFixedMarks(props.viewport.price, priceMarkInterval(), formatPriceMark));
  const timeMarks = createMemo(() => buildFixedMarks(props.viewport.time, timeMarkInterval(), formatDuration));
  const latestPriceMark = createMemo(() => {
    const latestCandle = props.priceCandles[props.priceCandles.length - 1];
    if (!latestCandle) return null;

    const priceSpan = props.viewport.price[1] - props.viewport.price[0];
    if (priceSpan <= 0) return null;

    const position = (latestCandle.close - props.viewport.price[0]) / priceSpan;
    if (position < 0 || position > 1) return null;

    return {
      label: formatPriceMark(latestCandle.close, priceMarkInterval()),
      position,
    };
  });
  const pointerPriceMark = createMemo(() => {
    const pointer = pointerPosition();
    if (!pointer) return null;

    const priceSpan = props.viewport.price[1] - props.viewport.price[0];
    const price = props.viewport.price[0] + priceSpan * (1 - pointer.y);

    return {
      label: formatPriceMark(price, priceMarkInterval()),
      position: 1 - pointer.y,
    };
  });
  const pointerTimeMark = createMemo(() => {
    const pointer = pointerPosition();
    if (!pointer) return null;

    const timeSpan = props.viewport.time[1] - props.viewport.time[0];
    const time = props.viewport.time[0] + timeSpan * pointer.x;

    return {
      label: formatCursorDuration(time, timeMarkInterval()),
      position: pointer.x,
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

  const readPointerPosition = (event: PointerEvent | WheelEvent): PointerPosition | null => {
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;

    return {
      x: rect.width === 0 ? 0 : x / rect.width,
      y: rect.height === 0 ? 0 : y / rect.height,
    };
  };

  const updatePointerPosition = (event: PointerEvent | WheelEvent): void => {
    setPointerPosition(readPointerPosition(event));
  };

  const handlePointerDown = (event: PointerEvent): void => {
    updatePointerPosition(event);
    controls.handlePointerDown(event);
  };

  const handlePointerMove = (event: PointerEvent): void => {
    updatePointerPosition(event);
    controls.handlePointerMove(event);
  };

  const handlePointerUp = (event: PointerEvent): void => {
    updatePointerPosition(event);
    controls.handlePointerUp(event);
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    setPointerPosition(null);
    controls.handlePointerCancel(event);
  };

  const handleWheel = (event: WheelEvent): void => {
    updatePointerPosition(event);
    controls.handleWheel(event);
  };

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
        onPointerDown={handlePointerDown}
        onPointerEnter={handlePointerMove}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setPointerPosition(null)}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
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
            const y = () => `${(1 - mark().position) * 100}%`;

            return (
              <g>
                <line x1="0" x2="100%" y1={y()} y2={y()} stroke="rgba(34, 211, 238, 0.58)" stroke-width="1" />
                <text x="99%" y={y()} dy="13" text-anchor="end" class="fill-cyan-200 font-mono text-[10px]">
                  {mark().label}
                </text>
              </g>
            );
          }}
        </Show>
        <Show when={pointerPriceMark()}>
          {(mark) => {
            const y = () => `${(1 - mark().position) * 100}%`;
            const dy = () => (mark().position > 0.92 ? "13" : "-4");

            return (
              <g>
                <line x1="0" x2="100%" y1={y()} y2={y()} stroke="rgba(251, 191, 36, 0.58)" stroke-width="1" />
                <text x="99%" y={y()} dy={dy()} text-anchor="end" class="fill-amber-200 font-mono text-[10px]">
                  {mark().label}
                </text>
              </g>
            );
          }}
        </Show>
        <Show when={pointerTimeMark()}>
          {(mark) => {
            const x = () => `${mark().position * 100}%`;
            const textAnchor = () => (mark().position < 0.08 ? "start" : mark().position > 0.92 ? "end" : "middle");
            const dx = () => (mark().position < 0.08 ? "4" : mark().position > 0.92 ? "-4" : "0");

            return (
              <g>
                <line x1={x()} x2={x()} y1="0" y2="100%" stroke="rgba(251, 191, 36, 0.52)" stroke-width="1" />
                <text x={x()} dx={dx()} y="98%" text-anchor={textAnchor()} class="fill-amber-200 font-mono text-[10px]">
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
