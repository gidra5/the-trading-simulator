import { Show, type Component } from "solid-js";
import { t } from "../../i18n/game";
import type { OrderBookHeatmapEntry, OrderBookHistogramEntry, PriceCandle } from "../../market";
import { Panel } from "../../ui-kit/Panel";
import { Chart, type ChartViewport } from "../Chart";
import { OrderBookHistogram } from "../OrderBookHistogram";
import { gameSettings } from "./settings";

type MarketBodyProps = {
  histogram: OrderBookHistogramEntry[] | null;
  onViewportChange: (viewport: ChartViewport) => void;
  orderBookHeatmap: OrderBookHeatmapEntry[] | null;
  priceCandles: PriceCandle[];
  viewport: ChartViewport;
};

export const MarketBody: Component<MarketBodyProps> = (props) => {
  return (
    <div class="h-full p-3">
      <div class="flex h-full min-h-0 gap-3">
        <Panel bodyClass="min-h-0 flex-1 p-0" class="min-w-0 flex-1">
          <Chart
            candleInterval={gameSettings.candleInterval()}
            class="h-full w-full bg-surface-primary"
            orderBookHeatmap={props.orderBookHeatmap}
            priceCandles={props.priceCandles}
            showFrameRate={gameSettings.showFrameRate()}
            viewport={props.viewport}
            onViewportChange={props.onViewportChange}
          />
        </Panel>
        <Show when={props.histogram}>
          {(histogramData) => (
            <Panel bodyClass="min-h-0 flex-1 p-0" class="w-48 shrink-0" title={t("market.depth.title")}>
              <OrderBookHistogram
                class="block h-full w-full"
                cumulative={gameSettings.isHistogramCumulative()}
                data={histogramData()}
                normalization={gameSettings.histogramNormalization()}
                windowFraction={gameSettings.histogramWindowFraction()}
              />
            </Panel>
          )}
        </Show>
      </div>
    </div>
  );
};
