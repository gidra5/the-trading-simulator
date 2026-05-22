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
  priceRange: [min: number, max: number];
  windowFraction: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null => {
  const safeWidth = Math.max(0, Math.floor(width));
  const safeHeight = Math.max(0, Math.floor(height));

  canvas.style.width = `${safeWidth}px`;
  canvas.style.height = `${safeHeight}px`;

  if (safeWidth === 0 || safeHeight === 0) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }

  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.floor(safeWidth * dpr));
  const nextHeight = Math.max(1, Math.floor(safeHeight * dpr));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, safeWidth, safeHeight);
  context.imageSmoothingEnabled = false;
  context.lineCap = "round";
  context.lineJoin = "round";
  return context;
};

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

const formatPriceMark = (value: number): string => {
  const magnitude = Math.abs(value);
  const digits = magnitude >= 100 ? 2 : magnitude >= 10 ? 3 : 4;
  return value.toFixed(digits);
};

const formatSizeMark = (value: number): string => {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(2);
};

const denormalizeSize = (fraction: number, maxSize: number, normalization: HistogramNormalization): number => {
  if (normalization === HistogramNormalization.Logarithmic) {
    return Math.expm1(Math.log1p(maxSize) * fraction);
  }

  return maxSize * fraction;
};

const drawGridMarkings = (
  context: CanvasRenderingContext2D,
  options: {
    baselineX: number;
    graphWidth: number;
    height: number;
    priceRange: [min: number, max: number];
    width: number;
  },
): void => {
  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.12)";
  context.lineWidth = 1;

  for (const fraction of [0.25, 0.5, 0.75, 1]) {
    const x = options.baselineX + options.graphWidth * fraction;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, options.height);
    context.stroke();
  }

  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const y = options.height * (1 - fraction);
    context.beginPath();
    context.moveTo(options.baselineX, y);
    context.lineTo(options.width, y);
    context.stroke();
  }

  context.restore();
};

const drawMarkingLabels = (
  context: CanvasRenderingContext2D,
  options: {
    baselineX: number;
    graphWidth: number;
    height: number;
    maxSize: number;
    normalization: HistogramNormalization;
    priceRange: [min: number, max: number];
    width: number;
  },
): void => {
  context.save();
  context.font = '10px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
  context.fillStyle = "rgba(148, 163, 184, 0.72)";

  if (options.maxSize > 0) {
    context.textAlign = "center";
    context.textBaseline = "bottom";

    for (const fraction of [0.5, 1]) {
      const x = options.baselineX + options.graphWidth * fraction;
      const value = denormalizeSize(fraction, options.maxSize, options.normalization);
      context.fillText(formatSizeMark(value), x, options.height - 4);
    }
  }

  const [minPrice, maxPrice] = options.priceRange;
  const priceSpan = maxPrice - minPrice;

  context.textAlign = "right";
  context.textBaseline = "middle";
  const labelTop = Math.min(28, options.height / 2);
  const labelBottom = Math.max(labelTop, options.height - 24);

  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    const y = Math.min(Math.max(options.height * (1 - fraction), labelTop), labelBottom);
    const price = minPrice + priceSpan * fraction;
    context.fillText(formatPriceMark(price), options.width - 8, y);
  }

  context.restore();
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

    context.fillStyle = "rgba(2, 6, 23, 0.96)";
    context.fillRect(0, 0, width, height);

    const { buySizes, sellSizes, maxSize, rowCount } = props.cumulative
      ? buildCumulativeSeries(props.data)
      : buildSeries(props.data, props.windowFraction);
    const baselineX = 14.5;
    const graphWidth = Math.max(width - baselineX - 12, 0);

    drawGridMarkings(context, {
      baselineX,
      graphWidth,
      height,
      priceRange: props.priceRange,
      width,
    });

    drawArea(context, buySizes, {
      baselineX,
      connectEndToBaseline: true,
      connectStartToBaseline: !props.cumulative,
      fill: "rgba(34, 197, 94, 0.28)",
      graphWidth,
      height,
      maxSize,
      normalization: props.normalization,
      rowCount,
      stroke: "rgba(74, 222, 128, 0.94)",
    });
    drawArea(context, sellSizes, {
      baselineX,
      connectEndToBaseline: !props.cumulative,
      connectStartToBaseline: true,
      fill: "rgba(248, 113, 113, 0.28)",
      graphWidth,
      height,
      maxSize,
      normalization: props.normalization,
      rowCount,
      stroke: "rgba(251, 146, 60, 0.94)",
    });

    context.strokeStyle = "rgba(148, 163, 184, 0.16)";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(baselineX, 0);
    context.lineTo(baselineX, height);
    context.stroke();

    context.font = '11px "SFMono-Regular", Consolas, "Liberation Mono", monospace';
    context.textBaseline = "top";
    context.textAlign = "left";

    context.fillStyle = "rgba(74, 222, 128, 0.94)";
    context.fillText("BID", 20, 8);
    context.fillStyle = "rgba(251, 146, 60, 0.94)";
    context.fillText("ASK", 54, 8);
    context.fillStyle = "rgba(148, 163, 184, 0.72)";
    context.textAlign = "right";
    context.fillText(props.normalization === "logarithmic" ? "LOG" : "LIN", width - 8, 8);

    drawMarkingLabels(context, {
      baselineX,
      graphWidth,
      height,
      maxSize,
      normalization: props.normalization,
      priceRange: props.priceRange,
      width,
    });
  });

  return <canvas ref={canvas} class={props.class} style={props.style} />;
};
