import {
  createSignal,
  onCleanup,
  onMount,
  Show,
  type Component,
  type JSX,
} from "solid-js";
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

// TODO: price/time marks
// TODO: fixed candle interval relative to viewport
// TODO: micro and macro candles to smoothly transition between scales
// TODO: side panel with order book histogram
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
      lastWrittenHeatmap = undefined;
      frameRateWindowStart = 0;
      frameCount = 0;
      setFrameRate(null);
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
    </div>
  );
};
