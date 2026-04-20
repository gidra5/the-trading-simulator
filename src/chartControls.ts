import type { ChartViewport } from "./Chart";
import { clamp } from "./utils";

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

const zoomIntensity = 0.0015;

const scaleRange = (range: readonly [number, number], anchor: number, scale: number): [number, number] => {
  const span = range[1] - range[0];
  const nextSpan = span * scale;
  const anchorValue = range[0] + span * anchor;

  return [anchorValue - nextSpan * anchor, anchorValue + nextSpan * (1 - anchor)];
};

export const createChartControls = (
  options: ChartControlsOptions,
): ChartControls => {
  let dragState: DragState | undefined;

  const clearDragState = (pointerId?: number): void => {
    if (
      !dragState ||
      (pointerId !== undefined && dragState.pointerId !== pointerId)
    ) {
      return;
    }

    dragState = undefined;
    options.setDragging(false);
  };

  const getPointerCoordinates = (
    event: PointerEvent | WheelEvent,
  ): PointerCoordinates | null => {
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

  const handlePointerDown = (event: PointerEvent): void => {
    const canvas = options.getCanvas();
    if (event.button !== 0 || !canvas) {
      return;
    }

    const viewport = options.getViewport();
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
    const timeSpan = dragState.viewport.time[1] - dragState.viewport.time[0];
    const priceSpan = dragState.viewport.price[1] - dragState.viewport.price[0];
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    const timeOffset = (deltaX / width) * timeSpan;
    const priceOffset = (deltaY / height) * priceSpan;

    options.updateViewport({
      time: [
        dragState.viewport.time[0] - timeOffset,
        dragState.viewport.time[1] - timeOffset,
      ],
      price: [
        dragState.viewport.price[0] + priceOffset,
        dragState.viewport.price[1] + priceOffset,
      ],
    });

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
    const zoomFactor = Math.exp(event.deltaY * zoomIntensity);
    const anchorX = pointer.x / pointer.width;
    const anchorY = pointer.y / pointer.height;
    const priceAnchor = 1 - anchorY;
    const scaleTime = event.ctrlKey || !event.shiftKey;
    const scalePrice = event.ctrlKey || event.shiftKey;

    options.updateViewport({
      time: scaleTime ? scaleRange(viewport.time, anchorX, zoomFactor) : viewport.time,
      price: scalePrice ? scaleRange(viewport.price, priceAnchor, zoomFactor) : viewport.price,
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
