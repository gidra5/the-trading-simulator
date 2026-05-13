import { Show, type Component } from "solid-js";
import { t } from "../../i18n/game";
import type { OrderBookHeatmapEntry, OrderBookHistogramEntry, PriceCandle } from "../../market";
import { Panel } from "../../ui-kit/Panel";
import { Chart, type ChartViewport } from "../Chart";
import { HistogramNormalization, OrderBookHistogram } from "../OrderBookHistogram";

type MarketBodyProps = {
  candleInterval: number;
  histogram: OrderBookHistogramEntry[] | null;
  histogramNormalization: HistogramNormalization;
  histogramWindowFraction: number;
  isHistogramCumulative: boolean;
  onViewportChange: (viewport: ChartViewport) => void;
  orderBookHeatmap: OrderBookHeatmapEntry[] | null;
  priceCandles: PriceCandle[];
  showFrameRate: boolean;
  viewport: ChartViewport;
};

export const MarketBody: Component<MarketBodyProps> = (props) => {
  return (
    <div class="h-full p-3">
      <div class="flex h-full min-h-0 gap-3">
        <Panel bodyClass="min-h-0 flex-1 p-0" class="min-w-0 flex-1">
          <Chart
            candleInterval={props.candleInterval}
            class="h-full w-full bg-surface-primary"
            orderBookHeatmap={props.orderBookHeatmap}
            priceCandles={props.priceCandles}
            showFrameRate={props.showFrameRate}
            viewport={props.viewport}
            onViewportChange={props.onViewportChange}
          />
        </Panel>
        <Show when={props.histogram}>
          {(histogramData) => (
            <Panel bodyClass="min-h-0 flex-1 p-0" class="w-48 shrink-0" title={t("market.depth.title")}>
              <OrderBookHistogram
                class="block h-full w-full"
                cumulative={props.isHistogramCumulative}
                data={histogramData()}
                normalization={props.histogramNormalization}
                windowFraction={props.histogramWindowFraction}
              />
            </Panel>
          )}
        </Show>
      </div>
    </div>
  );
};
