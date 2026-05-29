import { createMemo, type Component } from "solid-js";
import type { OrderBookHeatmapEntry, OrderBookHistogramEntry, PriceCandle } from "../../market";
import { Panel } from "../../ui-kit/Panel";
import { Chart, type ChartViewport } from "../Chart";
import { settings } from "../../routes/game/state";

type MarketBodyProps = {
  histogram: OrderBookHistogramEntry[] | null;
  onViewportChange: (viewport: ChartViewport) => void;
  orderBookHeatmap: OrderBookHeatmapEntry[] | null;
  priceCandles: PriceCandle[];
  viewport: ChartViewport;
};

export const MarketBody: Component<MarketBodyProps> = (props) => {
  const chartHistogram = createMemo(() => {
    if (!props.histogram) return null;

    return {
      cumulative: settings.isHistogramCumulative(),
      data: props.histogram,
      normalization: settings.histogramNormalization(),
      windowFraction: settings.histogramWindowFraction(),
    };
  });

  return (
    <div class="h-full p-3">
      <div class="flex h-full min-h-0">
        <Panel bodyClass="min-h-0 flex-1 p-0" class="min-w-0 flex-1">
          <Chart
            candleInterval={settings.candleInterval()}
            class="h-full w-full bg-surface-primary"
            isOrderBookHistogramVisible={settings.isHistogramEnabled()}
            orderBookHeatmap={props.orderBookHeatmap}
            orderBookHistogram={chartHistogram()}
            priceCandles={props.priceCandles}
            showFrameRate={settings.showFrameRate()}
            viewport={props.viewport}
            onViewportChange={props.onViewportChange}
            onOrderBookHistogramVisibilityChange={settings.setIsHistogramEnabled}
          />
        </Panel>
      </div>
    </div>
  );
};
