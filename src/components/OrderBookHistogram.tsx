import { createEffect, createSignal, onCleanup, onMount, type Component, type JSX } from "solid-js";
import type { OrderBookHistogramEntry } from "../market/index";

export const enum HistogramNormalization {
  Linear = "linear",
  Logarithmic = "logarithmic",
}

type OrderBookHistogramProps = {
  data: OrderBookHistogramEntry[];
  class?: string;
  style?: JSX.CSSProperties;
  cumulative: boolean;
  normalization: HistogramNormalization;
  windowFraction: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null => {
  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.floor(width * dpr) + 2;
  const nextHeight = Math.floor(height * dpr) + 2;

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, nextWidth, nextHeight);
  context.imageSmoothingEnabled = false;
  context.lineCap = "round";
  context.lineJoin = "round";
  return context;
};;

const normalizeLogarithmic = (value: number, maxValue: number): number => {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  return Math.log1p(value) / Math.log1p(maxValue);
};

const normalizeLinear = (value: number, maxValue: number): number => {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  return value / maxValue;
};

const normalize = (value: number, maxValue: number, mode: HistogramNormalization): number => {
  return mode === HistogramNormalization.Logarithmic
    ? normalizeLogarithmic(value, maxValue)
    : normalizeLinear(value, maxValue);
};

const getAveragingWindowSize = (rowCount: number, windowFraction: number): number => {
  if (rowCount <= 1) {
    return 1;
  }

  const baseWindowSize = Math.round(rowCount * windowFraction);
  const cappedWindowSize = Math.min(rowCount, baseWindowSize);
  return cappedWindowSize;
};

const averageSeriesOverWindow = (series: number[], windowSize: number, direction: boolean): number[] => {
  if (series.length <= 1 || windowSize <= 1) {
    return [...series];
  }

  const prefixSums = new Array<number>(series.length + 1).fill(0);
  for (let index = 0; index < series.length; index += 1) {
    prefixSums[index + 1] = prefixSums[index] + (series[index] ?? 0);
  }

  return series.map((_, index) => {
    const start = direction ? Math.max(0, index - windowSize) : index;
    const end = direction ? index : Math.min(series.length - 1, index + windowSize);
    const size = end - start + 1;
    return size > 0 ? (prefixSums[end + 1] - prefixSums[start]) / size : 0;
  });
};

const getMaxSeriesValue = (series: number[]): number => {
  return series.reduce((maxValue, value) => Math.max(maxValue, value), 0);
};

const buildCumulativeSeries = (data: OrderBookHistogramEntry[]) => {
  const rowCount = data.reduce((current, entry) => Math.max(current, entry.y), -1) + 1;
  const buySizes = new Array<number>(Math.max(rowCount, 0)).fill(0);
  const sellSizes = new Array<number>(Math.max(rowCount, 0)).fill(0);
  let maxSize = 0;

  for (const entry of data) {
    if (entry.kind !== "buy") {
      sellSizes[entry.y] = (sellSizes[entry.y - 1] ?? 0) + entry.size;
      maxSize = Math.max(maxSize, sellSizes[entry.y]);
    }
  }

  for (let index = data.length - 1; index >= 0; index -= 1) {
    const entry = data[index];
    if (!entry) continue;

    if (entry.kind === "buy") {
      buySizes[entry.y] = (buySizes[entry.y + 1] ?? 0) + entry.size;
      maxSize = Math.max(maxSize, buySizes[entry.y]);
    }
  }

  return { buySizes, sellSizes, maxSize, rowCount };
};

const buildSeries = (data: OrderBookHistogramEntry[], windowFraction: number) => {
  const rowCount = data.reduce((current, entry) => Math.max(current, entry.y), -1) + 1;
  const buySizes = new Array<number>(Math.max(rowCount, 0)).fill(0);
  const sellSizes = new Array<number>(Math.max(rowCount, 0)).fill(0);

  for (const entry of data) {
    if (entry.kind === "buy") {
      buySizes[entry.y] = entry.size;
    } else {
      sellSizes[entry.y] = entry.size;
    }
  }
  const windowSize = getAveragingWindowSize(rowCount, windowFraction);
  const averagedBuy = averageSeriesOverWindow(buySizes, windowSize, false);
  const averagedSell = averageSeriesOverWindow(sellSizes, windowSize, true);
  const maxSize = Math.max(getMaxSeriesValue(averagedBuy), getMaxSeriesValue(averagedSell));

  return { buySizes: averagedBuy, sellSizes: averagedSell, maxSize, rowCount };
};

const drawArea = (
  context: CanvasRenderingContext2D,
  series: number[],
  options: {
    baselineX: number;
    connectEndToBaseline: boolean;
    connectStartToBaseline: boolean;
    fill: string;
    graphWidth: number;
    height: number;
    maxSize: number;
    normalization: HistogramNormalization;
    rowCount: number;
    stroke: string;
  },
): void => {
  if (options.maxSize <= 0 || options.rowCount <= 0) {
    return;
  }

  const rowHeight = options.height / options.rowCount;
  const segments: Array<
    Array<{
      x: number;
      y: number;
      row: number;
    }>
  > = [];
  let currentSegment: Array<{ x: number; y: number; row: number }> = [];

  for (let y = 0; y < options.rowCount; y += 1) {
    const pointWidth = normalize(series[y] ?? 0, options.maxSize, options.normalization) * options.graphWidth;

    if (pointWidth <= 0) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    const pointY = options.height - (y + 0.5) * rowHeight;
    currentSegment.push({
      x: options.baselineX + pointWidth,
      y: pointY,
      row: y,
    });
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  context.fillStyle = options.fill;
  context.strokeStyle = options.stroke;
  context.lineWidth = 2;

  for (const segment of segments) {
    const firstPoint = segment[0];
    const lastPoint = segment[segment.length - 1];
    if (!firstPoint || !lastPoint) continue;

    const startY = options.height - firstPoint.row * rowHeight;
    const endY = options.height - (lastPoint.row + 1) * rowHeight;

    context.beginPath();
    context.moveTo(options.baselineX, startY);
    context.lineTo(firstPoint.x, firstPoint.y);
    for (let index = 1; index < segment.length; index += 1) {
      const point = segment[index];
      if (!point) continue;

      context.lineTo(point.x, point.y);
    }
    context.lineTo(options.baselineX, endY);
    context.closePath();
    context.fill();

    context.beginPath();
    if (options.connectStartToBaseline) {
      context.moveTo(options.baselineX, startY);
      context.lineTo(firstPoint.x, firstPoint.y);
    } else {
      context.moveTo(firstPoint.x, firstPoint.y);
    }

    for (let index = 1; index < segment.length; index += 1) {
      const point = segment[index];
      if (!point) continue;

      context.lineTo(point.x, point.y);
    }

    if (options.connectEndToBaseline) {
      context.lineTo(options.baselineX, endY);
    }

    context.stroke();
  }
};

// todo: when cursor is on chart, intersect with histogram and show another mark showing the exact volume at that price
// TODO: resize bug on first page load, after reload disappears
export const OrderBookHistogram: Component<OrderBookHistogramProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;
  const [size, setSize] = createSignal<CanvasSize>({ width: 0, height: 0 });

  onMount(() => {
    if (!canvas) return;

    const updateSize = () => {
      if (!canvas) return;

      setSize({ width: canvas.clientWidth, height: canvas.clientHeight });
    };

    updateSize();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        updateSize();
        return;
      }

      setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });

    observer.observe(canvas);

    onCleanup(() => {
      observer.disconnect();
    });
  });

  createEffect(() => {
    if (!canvas) return;

    const { width, height } = size();
    const context = resizeCanvas(canvas, width, height);
    if (!context) return;

    const { buySizes, sellSizes, maxSize, rowCount } = props.cumulative
      ? buildCumulativeSeries(props.data)
      : buildSeries(props.data, props.windowFraction);
    const baselineX = 0;
    const graphWidth = width;

    drawArea(context, buySizes, {
      baselineX,
      connectEndToBaseline: true,
      connectStartToBaseline: !props.cumulative,
      fill: "rgba(34, 197, 94, 0.2)",
      graphWidth,
      height,
      maxSize,
      normalization: props.normalization,
      rowCount,
      stroke: "rgba(74, 222, 128, 0.82)",
    });
    drawArea(context, sellSizes, {
      baselineX,
      connectEndToBaseline: !props.cumulative,
      connectStartToBaseline: true,
      fill: "rgba(248, 113, 113, 0.2)",
      graphWidth,
      height,
      maxSize,
      normalization: props.normalization,
      rowCount,
      stroke: "rgba(251, 146, 60, 0.82)",
    });

    context.font = '11px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
    context.fillStyle = "rgba(148, 163, 184, 0.72)";
    context.textBaseline = "top";
    context.textAlign = "right";
    context.fillText(props.normalization === "logarithmic" ? "LOG" : "LIN", width - 8, 8);
  });

  return <canvas ref={canvas} class={props.class} style={props.style} />;
};
