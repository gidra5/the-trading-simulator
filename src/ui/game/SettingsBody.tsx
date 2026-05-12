import type { Component } from "solid-js";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { SelectField } from "../../ui-kit/SelectField";
import { TextInput } from "../../ui-kit/TextInput";
import { ToggleField } from "../../ui-kit/ToggleField";
import { HistogramNormalization } from "../OrderBookHistogram";

const languageOptions = [
  { value: "en", label: "English" },
  { value: "uk", label: "Ukrainian" },
  { value: "de", label: "German" },
  { value: "pl", label: "Polish" },
] as const;

const normalizationOptions = [
  { value: HistogramNormalization.Linear, label: "Linear" },
  { value: HistogramNormalization.Logarithmic, label: "Logarithmic" },
] as const;

type SettingsBodyProps = {
  advancedOrdersEnabled: boolean;
  autosaveEnabled: boolean;
  candleIntervalInput: string;
  deltaSnapshotInput: string;
  fanoutInput: string;
  histogramNormalization: HistogramNormalization;
  histogramWindowInput: string;
  isHeatmapEnabled: boolean;
  isHistogramCumulative: boolean;
  isHistogramEnabled: boolean;
  language: string;
  levelsInput: string;
  newsEventsEnabled: boolean;
  onAdvancedOrdersEnabledChange: (enabled: boolean) => void;
  onAutosaveEnabledChange: (enabled: boolean) => void;
  onCandleIntervalInputChange: (value: string) => void;
  onDeltaSnapshotInputChange: (value: string) => void;
  onFanoutInputChange: (value: string) => void;
  onHeatmapEnabledChange: (enabled: boolean) => void;
  onHistogramCumulativeChange: (enabled: boolean) => void;
  onHistogramEnabledChange: (enabled: boolean) => void;
  onHistogramNormalizationChange: (value: HistogramNormalization) => void;
  onHistogramWindowInputChange: (value: string) => void;
  onLanguageChange: (language: string) => void;
  onLevelsInputChange: (value: string) => void;
  onNewsEventsEnabledChange: (enabled: boolean) => void;
  onShowFrameRateChange: (enabled: boolean) => void;
  showFrameRate: boolean;
};

export const SettingsBody: Component<SettingsBodyProps> = (props) => (
  <div class="h-full overflow-auto p-4">
    <div class="grid grid-cols-2 gap-4">
      <Panel title="Market Display">
        <div class="grid gap-3">
          <ToggleField checked={props.isHeatmapEnabled} label="Heatmap" onChange={props.onHeatmapEnabledChange} />
          <ToggleField checked={props.isHistogramEnabled} label="Histogram" onChange={props.onHistogramEnabledChange} />
          <ToggleField
            checked={props.isHistogramCumulative}
            label="Cumulative histogram"
            onChange={props.onHistogramCumulativeChange}
          />
          <SelectField
            label="Histogram normalization"
            options={normalizationOptions}
            value={props.histogramNormalization}
            onChange={(value) => props.onHistogramNormalizationChange(value as HistogramNormalization)}
          />
          <Field label="Candle interval, seconds">
            <TextInput
              inputMode="decimal"
              value={props.candleIntervalInput}
              onInput={(event) => props.onCandleIntervalInputChange(event.currentTarget.value)}
            />
          </Field>
          <Field label="Histogram window fraction">
            <TextInput
              disabled={props.isHistogramCumulative}
              inputMode="decimal"
              value={props.histogramWindowInput}
              onInput={(event) => props.onHistogramWindowInputChange(event.currentTarget.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Performance">
        <div class="grid gap-3">
          <ToggleField checked={props.showFrameRate} label="FPS counter" onChange={props.onShowFrameRateChange} />
          <Field label="Delta snapshot interval">
            <TextInput
              inputMode="numeric"
              value={props.deltaSnapshotInput}
              onInput={(event) => props.onDeltaSnapshotInputChange(event.currentTarget.value)}
            />
          </Field>
          <Field label="Delta snapshot fanout">
            <TextInput
              inputMode="numeric"
              value={props.fanoutInput}
              onInput={(event) => props.onFanoutInputChange(event.currentTarget.value)}
            />
          </Field>
          <Field label="Delta snapshot levels">
            <TextInput
              inputMode="numeric"
              value={props.levelsInput}
              onInput={(event) => props.onLevelsInputChange(event.currentTarget.value)}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Feature Flags">
        <div class="grid gap-3">
          <ToggleField
            checked={props.advancedOrdersEnabled}
            label="Advanced orders"
            onChange={props.onAdvancedOrdersEnabledChange}
          />
          <ToggleField checked={props.newsEventsEnabled} label="News events" onChange={props.onNewsEventsEnabledChange} />
          <ToggleField checked={props.autosaveEnabled} label="Autosave" onChange={props.onAutosaveEnabledChange} />
        </div>
      </Panel>

      <Panel title="Localization">
        <SelectField label="Language" options={languageOptions} value={props.language} onChange={props.onLanguageChange} />
      </Panel>
    </div>
  </div>
);
