import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from "solid-js";
import type { OrderBookHeatmapEntry, OrderBookHistogramEntry, PriceCandle } from "../market/index";
import clsx from "clsx";
import { ChartNoAxesColumn, ChevronLeft, ChevronRight } from "lucide-solid";
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
import { OrderBookHistogram, type HistogramNormalization } from "./OrderBookHistogram";
import { formatNumber } from "../utils";
import { themeColors } from "../ui-kit/theme";
import { Button } from "../ui-kit/Button";

export type ChartViewport = {
  time: [from: number, to: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};

type ChartHistogram = {
  cumulative: boolean;
  data: OrderBookHistogramEntry[];
  normalization: HistogramNormalization;
  windowFraction: number;
};

type ChartProps = {
  priceCandles: PriceCandle[];
  orderBookHeatmap: OrderBookHeatmapEntry[] | null;
  orderBookHistogram: ChartHistogram | null;
  isOrderBookHistogramVisible: boolean;
  onOrderBookHistogramVisibilityChange: (visible: boolean) => void;
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

type ChartSize = {
  width: number;
  height: number;
};

type ActiveMarkLabelProps = {
  backgroundClass: string;
  backgroundY: number;
  dominantBaseline?: "middle";
  dy: string;
  label: string;
  textAnchor: "end" | "middle";
  textClass: string;
  x: number;
  y: number;
};

// todo: review slop
const maxMarkGapPx = 160;
const markLabelPaddingPx = 8;
const markLabelCornerFadeStartPx = -4;
const priceMarkLabelFadePx = 20;
const timeMarkLabelFadePx = 16;
const priceMarkLabelBandWidthPx = 72;
const orderBookHistogramWidthPx = 220;
const timeMarkLabelBandHeightPx = 28;
const timeMarkLabelOverflowPx = 56;
const activeMarkLabelBackgroundHeightPx = 16;
const activeMarkLabelBackgroundHorizontalPaddingPx = 4;
const activeMarkLabelBackgroundRadiusPx = 3;
const markLabelBackgroundColor = themeColors.surface.body;
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

const ActiveMarkLabel: Component<ActiveMarkLabelProps> = (props) => {
  let text: SVGTextElement | undefined;
  const [textWidth, setTextWidth] = createSignal(0);
  const backgroundWidth = () => textWidth() + activeMarkLabelBackgroundHorizontalPaddingPx * 2;
  const backgroundX = () =>
    props.textAnchor === "middle"
      ? props.x - backgroundWidth() / 2
      : props.x - textWidth() - activeMarkLabelBackgroundHorizontalPaddingPx;

  createEffect(() => {
    props.label;
    if (!text) return;

    setTextWidth(text.getComputedTextLength());
  });

  return (
    <g>
      <rect
        x={backgroundX()}
        y={props.backgroundY}
        width={backgroundWidth()}
        height={activeMarkLabelBackgroundHeightPx}
        rx={activeMarkLabelBackgroundRadiusPx}
        class={props.backgroundClass}
      />
      <text
        ref={text}
        x={props.x}
        y={props.y}
        dy={props.dy}
        dominant-baseline={props.dominantBaseline}
        text-anchor={props.textAnchor}
        class={props.textClass}
      >
        {props.label}
      </text>
    </g>
  );
};

const buildFixedMarks = (
  range: [number, number],
  interval: number,
  positionRange: [number, number],
  formatLabel: (value: number, interval: number) => string,
): ChartMark[] => {
  const span = range[1] - range[0];
  if (span <= 0 || interval <= 0) return [];

  const firstValue = range[0] + span * positionRange[0];
  const lastValue = range[0] + span * positionRange[1];
  const firstIndex = Math.ceil(firstValue / interval);
  const lastIndex = Math.floor(lastValue / interval);
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
  const [plotSize, setPlotSize] = createSignal<ChartSize>({ width: 1, height: 1 });
  const [surfaceSize, setSurfaceSize] = createSignal<ChartSize>({ width: 1, height: 1 });
  const [renderedOrderBookHistogram, setRenderedOrderBookHistogram] = createSignal<ChartHistogram | null>(
    props.orderBookHistogram,
  );
  const timeMarkPositionOverflow = (): number => timeMarkLabelOverflowPx / plotSize().width;
  const timeMarkPositionRange = (): [number, number] => [-timeMarkPositionOverflow(), 1 + timeMarkPositionOverflow()];
  const overlayId = createUniqueId();
  const priceLabelClipId = `${overlayId}-price-label-clip`;
  const timeLabelClipId = `${overlayId}-time-label-clip`;
  const priceLabelGradientId = `${overlayId}-price-label-gradient`;
  const timeLabelGradientId = `${overlayId}-time-label-gradient`;
  const priceLabelMaskId = `${overlayId}-price-label-mask`;
  const timeLabelMaskId = `${overlayId}-time-label-mask`;
  const priceLabelMaskGradientId = `${overlayId}-price-label-mask-gradient`;
  const timeLabelMaskGradientId = `${overlayId}-time-label-mask-gradient`;
  const priceMarkInterval = createMemo(() =>
    getFixedMarkInterval(props.viewport.price, props.viewport.resolution[1], priceMarkBaseInterval),
  );
  const timeMarkInterval = createMemo(() =>
    getFixedMarkInterval(props.viewport.time, props.viewport.resolution[0], timeMarkBaseInterval),
  );
  const priceMarks = createMemo(() =>
    buildFixedMarks(props.viewport.price, priceMarkInterval(), [0, 1], formatPriceMark),
  );
  const timeMarks = createMemo(() =>
    buildFixedMarks(props.viewport.time, timeMarkInterval(), timeMarkPositionRange(), formatDuration),
  );
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

  const syncChartSize = (): void => {
    if (!canvas || !container) return;

    const plotWidth = Math.max(1, canvas.clientWidth);
    const plotHeight = Math.max(1, canvas.clientHeight);
    const surfaceWidth = Math.max(1, container.clientWidth);
    const surfaceHeight = Math.max(1, container.clientHeight);

    setPlotSize((current) => {
      if (current.width === plotWidth && current.height === plotHeight) return current;
      return { width: plotWidth, height: plotHeight };
    });
    setSurfaceSize((current) => {
      if (current.width === surfaceWidth && current.height === surfaceHeight) return current;
      return { width: surfaceWidth, height: surfaceHeight };
    });
  };

  const markX = (position: number): number => position * plotSize().width;
  const markY = (position: number): number => (1 - position) * plotSize().height;
  const priceLabelBandWidth = (): number => Math.min(priceMarkLabelBandWidthPx, surfaceSize().width);
  const timeLabelBandHeight = (): number => Math.min(timeMarkLabelBandHeightPx, surfaceSize().height);
  const priceLabelBandX = (): number => surfaceSize().width - priceLabelBandWidth();
  const priceLabelBandHeight = (): number => surfaceSize().height - timeLabelBandHeight();
  const timeLabelBandY = (): number => surfaceSize().height - timeLabelBandHeight();
  const hasOrderBookHistogram = (): boolean => renderedOrderBookHistogram() !== null;
  const isOrderBookHistogramOpen = (): boolean =>
    props.isOrderBookHistogramVisible && renderedOrderBookHistogram() !== null;
  const timeLabelBandWidth = (): number =>
    hasOrderBookHistogram() ? plotSize().width : surfaceSize().width - priceLabelBandWidth();
  const timeLabelBackgroundWidth = (): number => (hasOrderBookHistogram() ? plotSize().width : surfaceSize().width);
  const priceLabelX = (): number => surfaceSize().width - markLabelPaddingPx;
  const timeLabelY = (): number => surfaceSize().height - markLabelPaddingPx;
  const labelFadeStartAfterBand = (): number => -markLabelCornerFadeStartPx;
  const priceLabelClipHeight = (): number =>
    Math.min(surfaceSize().height, priceLabelBandHeight() + labelFadeStartAfterBand() + priceMarkLabelFadePx);
  const timeLabelClipWidth = (): number =>
    hasOrderBookHistogram()
      ? timeLabelBandWidth()
      : Math.min(surfaceSize().width, timeLabelBandWidth() + labelFadeStartAfterBand() + timeMarkLabelFadePx);
  const histogramToggleLabel = (): string =>
    props.isOrderBookHistogramVisible ? "Hide order book histogram" : "Show order book histogram";
  const histogramToggleRight = (): string => (isOrderBookHistogramOpen() ? `${orderBookHistogramWidthPx - 1}px` : "0");
  const histogramPanelWidth = (): string => (isOrderBookHistogramOpen() ? `${orderBookHistogramWidthPx}px` : "0");
  const histogramPanelStyle = (): JSX.CSSProperties => ({
    opacity: isOrderBookHistogramOpen() ? 1 : 0,
    width: histogramPanelWidth(),
  });
  const histogramToggleStyle = (): JSX.CSSProperties => ({
    right: histogramToggleRight(),
    transition: "right 180ms ease, background-color 160ms ease, border-color 160ms ease, color 160ms ease",
  });
  const labelFadeOffset = (position: number, span: number): string =>
    `${Math.min(100, Math.max(0, (position / Math.max(span, 1)) * 100))}%`;
  const priceLabelFadeOffset = (): string => labelFadeOffset(priceMarkLabelFadePx, priceLabelClipHeight());
  const timeLabelFadeOffset = (): string => labelFadeOffset(timeMarkLabelFadePx, timeLabelClipWidth());
  const priceLabelFadeEndOffset = (): string =>
    labelFadeOffset(
      priceLabelBandHeight() + labelFadeStartAfterBand() + priceMarkLabelFadePx - 8,
      priceLabelClipHeight(),
    );
  const timeLabelFadeEndOffset = (): string =>
    labelFadeOffset(
      hasOrderBookHistogram()
        ? timeLabelBandWidth()
        : timeLabelBandWidth() + labelFadeStartAfterBand() + timeMarkLabelFadePx,
      timeLabelClipWidth(),
    );
  const priceLabelFadeStartOffset = (): string =>
    labelFadeOffset(priceLabelBandHeight() + labelFadeStartAfterBand() - 8, priceLabelClipHeight());
  const timeLabelFadeStartOffset = (): string =>
    labelFadeOffset(
      hasOrderBookHistogram()
        ? timeLabelBandWidth() - timeMarkLabelFadePx
        : timeLabelBandWidth() + labelFadeStartAfterBand(),
      timeLabelClipWidth(),
    );

  const controls = createChartControls({
    getCanvas: () => canvas,
    getViewport: () => props.viewport,
    setDragging: setIsDragging,
    updateViewport,
  });

  createEffect(() => {
    const histogram = props.orderBookHistogram;
    if (histogram) setRenderedOrderBookHistogram(histogram);
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

  const clearPointerPosition = (): void => {
    setPointerPosition(null);
  };

  const handleWheel = (event: WheelEvent): void => {
    updatePointerPosition(event);
    controls.handleWheel(event);
  };

  const syncCanvasSize = () => {
    if (!canvas || !renderer) {
      return false;
    }

    syncChartSize();
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
    syncChartSize();
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
    <div ref={container} class={clsx("relative flex overflow-hidden", props.class ?? "")} style={props.style}>
      <div class="h-full min-w-0 flex-1">
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
      </div>
      <Show when={renderedOrderBookHistogram()}>
        {(histogram) => (
          <div
            class="h-full shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out"
            aria-hidden={!isOrderBookHistogramOpen()}
            style={histogramPanelStyle()}
          >
            <OrderBookHistogram
              class={clsx(
                "pointer-events-none block h-full pr-16 transition-transform duration-200 ease-out",
                isOrderBookHistogramOpen() ? "translate-x-0" : "translate-x-full",
              )}
              cumulative={histogram().cumulative}
              data={histogram().data}
              normalization={histogram().normalization}
              style={{ width: `${orderBookHistogramWidthPx}px` }}
              windowFraction={histogram().windowFraction}
            />
          </div>
        )}
      </Show>
      <Button
        aria-label={histogramToggleLabel()}
        aria-pressed={props.isOrderBookHistogramVisible}
        class="absolute top-1/2 z-10 h-12! min-h-12! w-8! min-w-8! -translate-y-1/2 rounded-l-md! rounded-r-none! border-border! border-r-0! bg-surface-secondary/95! text-text-secondary shadow-lg backdrop-blur hover:border-accent-secondary! hover:bg-surface-primary! hover:text-text-primary"
        size="md"
        style={histogramToggleStyle()}
        title={histogramToggleLabel()}
        type="button"
        variant="icon"
        onClick={() => props.onOrderBookHistogramVisibilityChange(!props.isOrderBookHistogramVisible)}
        onPointerEnter={clearPointerPosition}
        onPointerMove={clearPointerPosition}
      >
        <span class="flex flex-col items-center gap-0.5">
          <ChartNoAxesColumn aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
          <Show
            fallback={<ChevronLeft aria-hidden="true" class="h-3 w-3" strokeWidth={2.2} />}
            when={props.isOrderBookHistogramVisible}
          >
            <ChevronRight aria-hidden="true" class="h-3 w-3" strokeWidth={2.2} />
          </Show>
        </span>
      </Button>
      <svg class="pointer-events-none absolute inset-0 h-full w-full overflow-hidden" aria-hidden="true">
        <defs>
          <linearGradient
            id={priceLabelGradientId}
            gradientUnits="userSpaceOnUse"
            x1={priceLabelBandX()}
            x2={surfaceSize().width}
            y1="0"
            y2="0"
          >
            <stop offset="0%" stop-color={markLabelBackgroundColor} stop-opacity="0" />
            <stop offset="55%" stop-color={markLabelBackgroundColor} stop-opacity="0.72" />
            <stop offset="100%" stop-color={markLabelBackgroundColor} stop-opacity="0.96" />
          </linearGradient>
          <linearGradient
            id={timeLabelGradientId}
            gradientUnits="userSpaceOnUse"
            x1="0"
            x2="0"
            y1={timeLabelBandY()}
            y2={surfaceSize().height}
          >
            <stop offset="0%" stop-color={markLabelBackgroundColor} stop-opacity="0" />
            <stop offset="55%" stop-color={markLabelBackgroundColor} stop-opacity="0.72" />
            <stop offset="100%" stop-color={markLabelBackgroundColor} stop-opacity="0.96" />
          </linearGradient>
          <linearGradient id={priceLabelMaskGradientId} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stop-color="black" />
            <stop offset={priceLabelFadeOffset()} stop-color="white" />
            <stop offset={priceLabelFadeStartOffset()} stop-color="white" />
            <stop offset={priceLabelFadeEndOffset()} stop-color="black" />
            <stop offset="100%" stop-color="black" />
          </linearGradient>
          <linearGradient id={timeLabelMaskGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stop-color="black" />
            <stop offset={timeLabelFadeOffset()} stop-color="white" />
            <stop offset={timeLabelFadeStartOffset()} stop-color="white" />
            <stop offset={timeLabelFadeEndOffset()} stop-color="black" />
            <stop offset="100%" stop-color="black" />
          </linearGradient>
          <clipPath id={priceLabelClipId} clipPathUnits="userSpaceOnUse">
            <rect x={priceLabelBandX()} y="0" width={priceLabelBandWidth()} height={priceLabelClipHeight()} />
          </clipPath>
          <clipPath id={timeLabelClipId} clipPathUnits="userSpaceOnUse">
            <rect x="0" y={timeLabelBandY()} width={timeLabelClipWidth()} height={timeLabelBandHeight()} />
          </clipPath>
          <mask
            id={priceLabelMaskId}
            maskUnits="userSpaceOnUse"
            x={priceLabelBandX()}
            y="0"
            width={priceLabelBandWidth()}
            height={priceLabelClipHeight()}
          >
            <rect
              x={priceLabelBandX()}
              y="0"
              width={priceLabelBandWidth()}
              height={priceLabelClipHeight()}
              fill={`url(#${priceLabelMaskGradientId})`}
            />
          </mask>
          <mask
            id={timeLabelMaskId}
            maskUnits="userSpaceOnUse"
            x="0"
            y={timeLabelBandY()}
            width={timeLabelClipWidth()}
            height={timeLabelBandHeight()}
          >
            <rect
              x="0"
              y={timeLabelBandY()}
              width={timeLabelClipWidth()}
              height={timeLabelBandHeight()}
              fill={`url(#${timeLabelMaskGradientId})`}
            />
          </mask>
        </defs>
        <For each={priceMarks()}>
          {(mark) => {
            const y = () => markY(mark.position);

            return <line x1="0" x2={surfaceSize().width} y1={y()} y2={y()} stroke="rgba(148, 163, 184, 0.16)" />;
          }}
        </For>
        <For each={timeMarks()}>
          {(mark) => {
            const x = () => markX(mark.position);

            return <line x1={x()} x2={x()} y1="0" y2={surfaceSize().height} stroke="rgba(148, 163, 184, 0.12)" />;
          }}
        </For>
        <Show when={latestPriceMark()}>
          {(mark) => {
            const y = () => markY(mark().position);

            return <line x1="0" x2={surfaceSize().width} y1={y()} y2={y()} stroke="rgba(34, 211, 238, 0.58)" />;
          }}
        </Show>
        <Show when={pointerPriceMark()}>
          {(mark) => {
            const y = () => markY(mark().position);

            return <line x1="0" x2={surfaceSize().width} y1={y()} y2={y()} stroke="rgba(251, 191, 36, 0.58)" />;
          }}
        </Show>
        <Show when={pointerTimeMark()}>
          {(mark) => {
            const x = () => markX(mark().position);

            return <line x1={x()} x2={x()} y1="0" y2={surfaceSize().height} stroke="rgba(251, 191, 36, 0.52)" />;
          }}
        </Show>
        <rect
          x={priceLabelBandX()}
          y="0"
          width={priceLabelBandWidth()}
          height={surfaceSize().height}
          fill={`url(#${priceLabelGradientId})`}
        />
        <rect
          x="0"
          y={timeLabelBandY()}
          width={timeLabelBackgroundWidth()}
          height={timeLabelBandHeight()}
          fill={`url(#${timeLabelGradientId})`}
        />
        <g clip-path={`url(#${priceLabelClipId})`} mask={`url(#${priceLabelMaskId})`}>
          <For each={priceMarks()}>
            {(mark) => (
              <text
                x={priceLabelX()}
                y={markY(mark.position)}
                dy="-4"
                text-anchor="end"
                class="fill-slate-400 font-mono text-[10px]"
              >
                {mark.label}
              </text>
            )}
          </For>
        </g>
        <g clip-path={`url(#${timeLabelClipId})`} mask={`url(#${timeLabelMaskId})`}>
          <For each={timeMarks()}>
            {(mark) => (
              <text
                x={markX(mark.position)}
                y={timeLabelY()}
                text-anchor="middle"
                class="fill-slate-500 font-mono text-[10px]"
              >
                {mark.label}
              </text>
            )}
          </For>
        </g>
        <Show when={latestPriceMark()}>
          {(mark) => {
            const y = () => markY(mark().position);
            const backgroundY = () => y() - activeMarkLabelBackgroundHeightPx / 2;

            return (
              <ActiveMarkLabel
                backgroundClass="fill-cyan-300 transition-none"
                backgroundY={backgroundY()}
                dominantBaseline="middle"
                dy="0"
                label={mark().label}
                textAnchor="end"
                textClass="fill-surface-body font-mono text-[10px]"
                x={priceLabelX()}
                y={y()}
              />
            );
          }}
        </Show>
        <Show when={pointerPriceMark()}>
          {(mark) => {
            const y = () => markY(mark().position);
            const backgroundY = () => y() - activeMarkLabelBackgroundHeightPx / 2;

            return (
              <ActiveMarkLabel
                backgroundClass="fill-amber-300 transition-none"
                backgroundY={backgroundY()}
                dominantBaseline="middle"
                dy="0"
                label={mark().label}
                textAnchor="end"
                textClass="fill-surface-body font-mono text-[10px]"
                x={priceLabelX()}
                y={y()}
              />
            );
          }}
        </Show>
        <Show when={pointerTimeMark()}>
          {(mark) => {
            const x = () => markX(mark().position);

            return (
              <ActiveMarkLabel
                backgroundClass="fill-amber-300 transition-none"
                backgroundY={timeLabelY() - 12}
                dy="0"
                label={mark().label}
                textAnchor="middle"
                textClass="fill-surface-body font-mono text-[10px]"
                x={x()}
                y={timeLabelY()}
              />
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
