import type { ChartViewport } from "./Chart";
import { clamp } from "../utils";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  viewport: ChartViewport;
};

type PointerCoordinates = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type ViewportBounds = Pick<ChartViewport, "time" | "price">;

type StickyStart = {
  time: boolean;
  price: boolean;
};

type ResolvedRangeStart = {
  range: [number, number];
  sticky: boolean;
};

type ChartControlsOptions = {
  getCanvas: () => HTMLCanvasElement | undefined;
  getViewport: () => ChartViewport;
  setDragging: (dragging: boolean) => void;
  updateViewport: (viewport: ViewportBounds) => void;
};

type ChartControls = {
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerUp: (event: PointerEvent) => void;
  handlePointerCancel: (event: PointerEvent) => void;
  handleWheel: (event: WheelEvent) => void;
  dispose: () => void;
};

// todo: move constants into settings
// todo: review slop
const zoomIntensity = 0.0015;
const minTimeSpanMs = 1_000;
const minPriceSpan = 0.000_001;
const minViewportValue = 0;

const resolveRangeStart = (
  range: readonly [number, number],
  minimumSpan: number,
  forceSticky: boolean,
): ResolvedRangeStart => {
  const span = Math.max(range[1] - range[0], minimumSpan);
  if (forceSticky || range[0] <= minViewportValue) {
    return { range: [minViewportValue, minViewportValue + span], sticky: true };
  }

  if (range[1] - range[0] >= minimumSpan) return { range: [range[0], range[1]], sticky: false };

  return { range: [range[0], range[0] + span], sticky: false };
};

const resolvePannedViewportStart = (
  viewport: ViewportBounds,
): { viewport: ViewportBounds; stickyStart: StickyStart } => {
  const time = resolveRangeStart(viewport.time, minTimeSpanMs, false);
  const price = resolveRangeStart(viewport.price, minPriceSpan, false);

  return {
    viewport: { time: time.range, price: price.range },
    stickyStart: { time: time.sticky, price: price.sticky },
  };
};

const scaleRange = (
  range: readonly [number, number],
  anchor: number,
  scale: number,
  minimumSpan: number,
): [number, number] => {
  const span = Math.max(range[1] - range[0], minimumSpan);
  const nextSpan = Math.max(minimumSpan, span * scale);
  const anchorValue = range[0] + span * anchor;

  return [anchorValue - nextSpan * anchor, anchorValue + nextSpan * (1 - anchor)];
};

export const createChartControls = (options: ChartControlsOptions): ChartControls => {
  let dragState: DragState | undefined;
  const stickyStart: StickyStart = {
    time: false,
    price: false,
  };

  const clearDragState = (pointerId?: number): void => {
    if (!dragState || (pointerId !== undefined && dragState.pointerId !== pointerId)) {
      return;
    }

    dragState = undefined;
    options.setDragging(false);
  };

  const getPointerCoordinates = (event: PointerEvent | WheelEvent): PointerCoordinates | null => {
    const canvas = options.getCanvas();
    if (!canvas) {
      return null;
    }

    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    return {
      x: clamp(event.clientX - rect.left, 0, rect.width),
      y: clamp(event.clientY - rect.top, 0, rect.height),
      width: rect.width,
      height: rect.height,
    };
  };

  const syncStickyStart = (viewport: ChartViewport): void => {
    if (viewport.time[0] > minViewportValue) stickyStart.time = false;
    if (viewport.price[0] > minViewportValue) stickyStart.price = false;
  };

  const handlePointerDown = (event: PointerEvent): void => {
    const canvas = options.getCanvas();
    if (event.button !== 0 || !canvas) {
      return;
    }

    const viewport = options.getViewport();
    syncStickyStart(viewport);
    dragState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      viewport: {
        time: [...viewport.time],
        price: [...viewport.price],
        resolution: [...viewport.resolution],
      },
    };
    options.setDragging(true);
    canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event: PointerEvent): void => {
    const canvas = options.getCanvas();
    if (!dragState || dragState.pointerId !== event.pointerId || !canvas) {
      return;
    }

    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const timeSpan = Math.max(dragState.viewport.time[1] - dragState.viewport.time[0], minTimeSpanMs);
    const priceSpan = Math.max(dragState.viewport.price[1] - dragState.viewport.price[0], minPriceSpan);
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const timeOffset = (deltaX / width) * timeSpan;
    const priceOffset = (deltaY / height) * priceSpan;

    const next = resolvePannedViewportStart({
      time: [dragState.viewport.time[0] - timeOffset, dragState.viewport.time[1] - timeOffset],
      price: [dragState.viewport.price[0] + priceOffset, dragState.viewport.price[1] + priceOffset],
    });

    stickyStart.time = next.stickyStart.time;
    stickyStart.price = next.stickyStart.price;
    options.updateViewport(next.viewport);

    event.preventDefault();
  };

  const handlePointerUp = (event: PointerEvent): void => {
    const canvas = options.getCanvas();
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    clearDragState(event.pointerId);
  };

  const handlePointerCancel = (event: PointerEvent): void => {
    clearDragState(event.pointerId);
  };

  const handleWheel = (event: WheelEvent): void => {
    const pointer = getPointerCoordinates(event);
    if (!pointer) {
      return;
    }

    const viewport = options.getViewport();
    syncStickyStart(viewport);
    const zoomFactor = Math.exp(event.deltaY * zoomIntensity);
    const anchorX = pointer.x / pointer.width;
    const anchorY = pointer.y / pointer.height;
    const priceAnchor = 1 - anchorY;
    const scaleTime = event.ctrlKey || !event.shiftKey;
    const scalePrice = event.ctrlKey || event.shiftKey;

    const nextTime = scaleTime
      ? resolveRangeStart(
          scaleRange(viewport.time, anchorX, zoomFactor, minTimeSpanMs),
          minTimeSpanMs,
          stickyStart.time,
        )
      : { range: viewport.time, sticky: stickyStart.time };
    const nextPrice = scalePrice
      ? resolveRangeStart(
          scaleRange(viewport.price, priceAnchor, zoomFactor, minPriceSpan),
          minPriceSpan,
          stickyStart.price,
        )
      : { range: viewport.price, sticky: stickyStart.price };

    stickyStart.time = nextTime.sticky;
    stickyStart.price = nextPrice.sticky;
    options.updateViewport({
      time: nextTime.range,
      price: nextPrice.range,
    });

    event.preventDefault();
  };

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    handleWheel,
    dispose: () => {
      clearDragState();
    },
  };
};
