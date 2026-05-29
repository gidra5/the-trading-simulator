import {
  ChartCandlestick,
  ChartLine,
  ChartSpline,
  CircleDot,
  CircleGauge,
  Flame,
  Grid3X3,
  TrendingDown,
  TrendingUp,
  ZoomIn,
  type LucideIcon,
} from "lucide-solid";
import { createEffect, createSignal, For, type Component } from "solid-js";
import { quotePriceKinds, type PriceScaleKind, type QuotePriceKind } from "../market";
import { Button } from "../ui-kit/Button";
import { TextInput } from "../ui-kit/TextInput";
import { t } from "../i18n/game";
import type { ChartViewport } from "./Chart";

export type ChartOverlayControls = {
  candleInterval: number;
  heatmapNormalization: PriceScaleKind;
  isFrameRateVisible: boolean;
  isHeatmapEnabled: boolean;
  priceScale: PriceScaleKind;
  quotePriceKind: QuotePriceKind;
  onCandleIntervalChange: (interval: number) => void;
  onFrameRateVisibilityChange: (visible: boolean) => void;
  onHeatmapEnabledChange: (enabled: boolean) => void;
  onHeatmapNormalizationChange: (normalization: PriceScaleKind) => void;
  onPriceScaleChange: (scale: PriceScaleKind) => void;
  onQuotePriceKindChange: (kind: QuotePriceKind) => void;
};

type ChartControlsOverlayProps = {
  controls: ChartOverlayControls;
  frameRate: number | null;
  viewport: ChartViewport;
  onViewportChange: (viewport: ChartViewport) => void;
};

const quotePriceKindIcons: Record<QuotePriceKind, LucideIcon> = {
  buy: TrendingDown,
  mid: CircleDot,
  sell: TrendingUp,
};

const oppositeScale = (scale: PriceScaleKind): PriceScaleKind => (scale === "linear" ? "logarithmic" : "linear");

const formatCandleInterval = (interval: number): string => String(interval / 1_000);

const formatVisibleCandles = (viewport: ChartViewport, candleInterval: number): string => {
  const visibleCandles = (viewport.time[1] - viewport.time[0]) / candleInterval;

  return visibleCandles >= 10 ? String(Math.round(visibleCandles)) : visibleCandles.toFixed(1);
};

const scaleLabel = (scale: PriceScaleKind): string => t(`settings.scale.${scale}` as const);
const quotePriceKindLabel = (kind: QuotePriceKind): string => t(`settings.quotePriceKind.${kind}` as const);

export const ChartControlsOverlay: Component<ChartControlsOverlayProps> = (props) => {
  const [candleIntervalInput, setCandleIntervalInput] = createSignal(
    formatCandleInterval(props.controls.candleInterval),
  );
  const [visibleCandlesInput, setVisibleCandlesInput] = createSignal(
    formatVisibleCandles(props.viewport, props.controls.candleInterval),
  );

  createEffect(() => {
    setCandleIntervalInput(formatCandleInterval(props.controls.candleInterval));
  });

  createEffect(() => {
    setVisibleCandlesInput(formatVisibleCandles(props.viewport, props.controls.candleInterval));
  });

  const handleCandleIntervalInput = (value: string): void => {
    setCandleIntervalInput(value);

    const nextIntervalSeconds = Number(value);
    if (!Number.isFinite(nextIntervalSeconds) || nextIntervalSeconds <= 0) return;

    props.controls.onCandleIntervalChange(Math.round(nextIntervalSeconds * 1_000));
  };

  const handleVisibleCandlesInput = (value: string): void => {
    setVisibleCandlesInput(value);

    const nextVisibleCandles = Number(value);
    if (!Number.isFinite(nextVisibleCandles) || nextVisibleCandles <= 0) return;

    const nextTimeSpan = nextVisibleCandles * props.controls.candleInterval;
    const timeCenter = (props.viewport.time[0] + props.viewport.time[1]) / 2;

    props.onViewportChange({
      ...props.viewport,
      time: [timeCenter - nextTimeSpan / 2, timeCenter + nextTimeSpan / 2],
    });
  };

  const priceScaleTitle = (): string => t("chart.controls.priceScale", { mode: scaleLabel(props.controls.priceScale) });
  const heatmapNormalizationTitle = (): string =>
    t("chart.controls.heatmapNormalization", { mode: scaleLabel(props.controls.heatmapNormalization) });
  const quotePriceKindTitle = (kind: QuotePriceKind): string =>
    t("chart.controls.quotePriceKind", { kind: quotePriceKindLabel(kind) });

  return (
    <div class="flex max-w-[34rem] flex-wrap items-center justify-end gap-1 rounded border border-border bg-surface-body/88 p-1 shadow-lg backdrop-blur">
      <label
        class="flex items-center gap-1 rounded border border-border bg-surface-secondary/80 px-1 py-0.5"
        title={t("chart.controls.currentZoom")}
      >
        <ZoomIn aria-hidden="true" class="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.8} />
        <TextInput
          aria-label={t("chart.controls.currentZoom")}
          class="h-6! w-14! px-1.5! py-0! text-right font-mono-primary-xs-rg!"
          inputMode="decimal"
          value={visibleCandlesInput()}
          onBlur={() => setVisibleCandlesInput(formatVisibleCandles(props.viewport, props.controls.candleInterval))}
          onInput={(event) => handleVisibleCandlesInput(event.currentTarget.value)}
        />
      </label>

      <label
        class="flex items-center gap-1 rounded border border-border bg-surface-secondary/80 px-1 py-0.5"
        title={t("chart.controls.candleInterval")}
      >
        <ChartCandlestick aria-hidden="true" class="h-3.5 w-3.5 text-text-secondary" strokeWidth={1.8} />
        <TextInput
          aria-label={t("chart.controls.candleInterval")}
          class="h-6! w-12! px-1.5! py-0! text-right font-mono-primary-xs-rg!"
          inputMode="decimal"
          value={candleIntervalInput()}
          onBlur={() => setCandleIntervalInput(formatCandleInterval(props.controls.candleInterval))}
          onInput={(event) => handleCandleIntervalInput(event.currentTarget.value)}
        />
      </label>

      <Button
        active={props.controls.isHeatmapEnabled}
        aria-label={t("chart.controls.heatmap")}
        aria-pressed={props.controls.isHeatmapEnabled}
        size="sm"
        title={t("chart.controls.heatmap")}
        type="button"
        variant="icon"
        onClick={() => props.controls.onHeatmapEnabledChange(!props.controls.isHeatmapEnabled)}
      >
        <Grid3X3 aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
      </Button>

      <Button
        active={props.controls.isFrameRateVisible}
        aria-label={t("chart.controls.fps")}
        aria-pressed={props.controls.isFrameRateVisible}
        size="sm"
        title={t("chart.controls.fps")}
        type="button"
        variant="icon"
        onClick={() => props.controls.onFrameRateVisibilityChange(!props.controls.isFrameRateVisible)}
      >
        <CircleGauge aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
      </Button>

      <TextInput
        aria-label={t("chart.controls.fps")}
        class="h-6! w-14! px-1.5! py-0! text-right font-mono-primary-xs-rg!"
        readOnly
        tabIndex={-1}
        value={props.controls.isFrameRateVisible && props.frameRate !== null ? props.frameRate.toFixed(1) : ""}
      />

      <Button
        active={props.controls.heatmapNormalization === "logarithmic"}
        aria-label={heatmapNormalizationTitle()}
        aria-pressed={props.controls.heatmapNormalization === "logarithmic"}
        size="sm"
        title={heatmapNormalizationTitle()}
        type="button"
        variant="icon"
        onClick={() => props.controls.onHeatmapNormalizationChange(oppositeScale(props.controls.heatmapNormalization))}
      >
        <Flame aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
      </Button>

      <Button
        active={props.controls.priceScale === "logarithmic"}
        aria-label={t("chart.controls.priceScale", { mode: scaleLabel(props.controls.priceScale) })}
        aria-pressed={props.controls.priceScale === "logarithmic"}
        size="sm"
        title={priceScaleTitle()}
        type="button"
        variant="icon"
        onClick={() => props.controls.onPriceScaleChange(oppositeScale(props.controls.priceScale))}
      >
        {props.controls.priceScale === "linear" ? (
          <ChartLine aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
        ) : (
          <ChartSpline aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
        )}
      </Button>

      <For each={quotePriceKinds}>
        {(kind) => {
          const Icon = quotePriceKindIcons[kind];

          return (
            <Button
              active={props.controls.quotePriceKind === kind}
              aria-label={quotePriceKindTitle(kind)}
              aria-pressed={props.controls.quotePriceKind === kind}
              size="sm"
              title={quotePriceKindTitle(kind)}
              type="button"
              variant="icon"
              onClick={() => props.controls.onQuotePriceKindChange(kind)}
            >
              <Icon aria-hidden="true" class="h-3.5 w-3.5" strokeWidth={1.8} />
            </Button>
          );
        }}
      </For>
    </div>
  );
};
