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
  OrderBookHeatmapEntry,
  OrderBookHistogramEntry,
  PriceCandle,
} from "./market";
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

export type ChartViewport = {
  time: [from: number, to: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};

export type ChartProps = {
  priceCandles: PriceCandle[];
  orderBookHeatmap: OrderBookHeatmapEntry[];
  orderBookHistogram: OrderBookHistogramEntry[];
  viewport: ChartViewport;
  candleInterval: number;
  onViewportChange?: (viewport: ChartViewport) => void;
  class?: string;
  style?: JSX.CSSProperties;
};

export const Chart: Component<ChartProps> = (props) => {
  let container: HTMLDivElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let renderer: RendererState | undefined;
  let animationFrame = 0;
  let configuredWidth = 0;
  let configuredHeight = 0;

  const [status, setStatus] = createSignal<string | null>(null);

  const reportViewport = () => {
    if (!canvas) {
      return;
    }

    props.onViewportChange?.({
      time: props.viewport.time,
      price: props.viewport.price,
      resolution: [canvas.width, canvas.height],
    });
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

    reportViewport();
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
    writeHeatmapTexture(renderer, props.orderBookHeatmap);
    const candleInstanceCount = writeCandleInstances(
      renderer,
      props.viewport,
      props.priceCandles,
      props.candleInterval,
    );
    drawFrame(renderer, candleInstanceCount);
  };

  onMount(() => {
    reportViewport();

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

        const renderFrame = () => {
          draw();
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
      renderer = undefined;
      configuredWidth = 0;
      configuredHeight = 0;
    });
  });

  return (
    <div
      ref={container}
      class={clsx(`relative overflow-hidden`, props.class ?? "")}
      style={props.style}
    >
      <canvas ref={canvas} class="block h-full w-full" />
      <Show when={status()}>
        {(message) => (
          <div class="pointer-events-none absolute inset-x-4 bottom-4 rounded border border-amber-300/30 bg-black/40 px-3 py-2 font-mono text-xs text-amber-100 backdrop-blur">
            {message()}
          </div>
        )}
      </Show>
    </div>
  );
};
