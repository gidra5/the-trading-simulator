import { createSignal, type Accessor, type Component, type Setter } from "solid-js";
import { HistogramNormalization } from "./OrderBookHistogram";

const formatCandleIntervalSeconds = (interval: number): string => String(interval / 1_000);
const formatHistogramWindowFraction = (windowFraction: number): string => String(windowFraction);

type ChartSettingsProps = {
  candleInterval: Accessor<number>;
  onCandleIntervalChange: (interval: number) => void;
  isHeatmapEnabled: Accessor<boolean>;
  setIsHeatmapEnabled: Setter<boolean>;
  isHistogramEnabled: Accessor<boolean>;
  setIsHistogramEnabled: Setter<boolean>;
  isHistogramCumulative: Accessor<boolean>;
  setIsHistogramCumulative: Setter<boolean>;
  histogramNormalization: Accessor<HistogramNormalization>;
  setHistogramNormalization: Setter<HistogramNormalization>;
  histogramWindowFraction: Accessor<number>;
  setHistogramWindowFraction: Setter<number>;
};

export const ChartSettings: Component<ChartSettingsProps> = (props) => {
  const [candleIntervalInput, setCandleIntervalInput] = createSignal(
    formatCandleIntervalSeconds(props.candleInterval()),
  );
  const [histogramWindowFractionInput, setHistogramWindowFractionInput] = createSignal(
    formatHistogramWindowFraction(props.histogramWindowFraction()),
  );

  const handleCandleIntervalInput = (value: string): void => {
    setCandleIntervalInput(value);

    const nextIntervalSeconds = Number(value);
    if (!Number.isFinite(nextIntervalSeconds) || nextIntervalSeconds <= 0) return;

    props.onCandleIntervalChange(Math.round(nextIntervalSeconds * 1_000));
  };

  const handleHistogramWindowFractionInput = (value: string): void => {
    setHistogramWindowFractionInput(value);

    const nextWindowFraction = Number(value);
    if (!Number.isFinite(nextWindowFraction) || nextWindowFraction < 0) return;

    props.setHistogramWindowFraction(nextWindowFraction);
  };

  return (
    <>
      <p>
        Drag: pan viewport. Wheel: scale time. Shift + wheel: scale price. Ctrl + wheel: zoom both axes.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <label class="flex items-center gap-2 text-slate-200">
          <span>Candle interval, s</span>
          <input
            class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
            type="number"
            step="0.1"
            value={candleIntervalInput()}
            onInput={(event) => handleCandleIntervalInput(event.currentTarget.value)}
            onBlur={() => setCandleIntervalInput(formatCandleIntervalSeconds(props.candleInterval()))}
          />
        </label>
        <label class="flex items-center gap-2 text-slate-200">
          <input
            type="checkbox"
            checked={props.isHeatmapEnabled()}
            onInput={(event) => props.setIsHeatmapEnabled(event.currentTarget.checked)}
          />
          <span>Show heatmap</span>
        </label>
        <label class="flex items-center gap-2 text-slate-200">
          <input
            type="checkbox"
            checked={props.isHistogramEnabled()}
            onInput={(event) => props.setIsHistogramEnabled(event.currentTarget.checked)}
          />
          <span>Show histogram</span>
        </label>
        <label class="flex items-center gap-2 text-slate-200">
          <input
            type="checkbox"
            checked={props.isHistogramCumulative()}
            onInput={(event) => props.setIsHistogramCumulative(event.currentTarget.checked)}
          />
          <span>Cumulative histogram</span>
        </label>
        <label class="flex items-center gap-2 text-slate-200">
          <input
            type="checkbox"
            checked={props.histogramNormalization() === HistogramNormalization.Logarithmic}
            onInput={(event) => {
              props.setHistogramNormalization(
                event.currentTarget.checked ? HistogramNormalization.Logarithmic : HistogramNormalization.Linear,
              );
            }}
          />
          <span>Log histogram normalization</span>
        </label>
        <label class="flex items-center gap-2 text-slate-200">
          <span>Histogram window fraction</span>
          <input
            class="w-20 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            type="number"
            min="0"
            step="0.001"
            value={histogramWindowFractionInput()}
            onInput={(event) => handleHistogramWindowFractionInput(event.currentTarget.value)}
            onBlur={() =>
              setHistogramWindowFractionInput(formatHistogramWindowFraction(props.histogramWindowFraction()))
            }
            disabled={props.isHistogramCumulative()}
          />
        </label>
      </div>
    </>
  );
};
