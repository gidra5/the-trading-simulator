import { createEffect, type Component, type JSX } from "solid-js";
import type { OrderBookHeatmapEntry } from "../market/index";

type CanvasProps = {
  width: number;
  height: number;
  class?: string;
  style?: JSX.CSSProperties;
};

type OrderBookHeatmapProps = CanvasProps & {
  data: OrderBookHeatmapEntry[];
  resolution: [time: number, price: number];
};

const resizeCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): CanvasRenderingContext2D | null => {
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
  canvas.width = Math.floor(safeWidth * dpr);
  canvas.height = Math.floor(safeHeight * dpr);

  const context = canvas.getContext("2d");
  if (!context) {
    return null;
  }

  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, safeWidth, safeHeight);
  context.imageSmoothingEnabled = false;
  return context;
};

const normalizeLogarithmically = (value: number, maxValue: number): number => {
  if (value <= 0 || maxValue <= 0) {
    return 0;
  }

  return Math.log1p(value) / Math.log1p(maxValue);
};

const heatmapColor = (intensity: number): string => {
  const hue = 210 - intensity * 165;
  const saturation = 82;
  const lightness = 14 + intensity * 58;
  const alpha = 0.08 + intensity * 0.84;

  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`;
};

export const OrderBookHeatmap: Component<OrderBookHeatmapProps> = (props) => {
  let canvas: HTMLCanvasElement | undefined;

  createEffect(() => {
    if (!canvas) {
      return;
    }

    const context = resizeCanvas(canvas, props.width, props.height);
    if (!context) {
      return;
    }

    const maxSize = props.data.reduce(
      (current, entry) => Math.max(current, entry.size),
      0,
    );
    if (maxSize <= 0) {
      return;
    }

    const cellWidth = props.width / props.resolution[0];
    const cellHeight = props.height / props.resolution[1];

    for (const entry of props.data) {
      if (entry.size <= 0) {
        continue;
      }

      const intensity = normalizeLogarithmically(entry.size, maxSize);
      const x = entry.x * cellWidth;
      const y = props.height - (entry.y + 1) * cellHeight;

      context.fillStyle = heatmapColor(intensity);
      context.fillRect(
        x,
        y,
        Math.ceil(cellWidth) + 1,
        Math.ceil(cellHeight) + 1,
      );
    }
  });

  return <canvas ref={canvas} class={props.class} style={props.style} />;
};
