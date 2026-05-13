import { createMemo, type Component } from "solid-js";
import { locales, locale, setLocale, t, type Locale } from "../../i18n/game";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { SelectField } from "../../ui-kit/SelectField";
import { TextInput } from "../../ui-kit/TextInput";
import { ToggleField } from "../../ui-kit/ToggleField";
import { HistogramNormalization } from "../OrderBookHistogram";

const isLocale = (value: string): value is Locale => locales.includes(value as Locale);

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
  onLevelsInputChange: (value: string) => void;
  onNewsEventsEnabledChange: (enabled: boolean) => void;
  onShowFrameRateChange: (enabled: boolean) => void;
  showFrameRate: boolean;
};

export const SettingsBody: Component<SettingsBodyProps> = (props) => {
  const languageOptions = createMemo(() => locales.map((value) => ({ value, label: t(`settings.language.${value}`) })));
  const normalizationOptions = createMemo(() => [
    { value: HistogramNormalization.Linear, label: t("settings.normalization.linear") },
    { value: HistogramNormalization.Logarithmic, label: t("settings.normalization.logarithmic") },
  ]);

  return (
    <div class="h-full overflow-auto p-4">
      <div class="grid grid-cols-2 gap-4">
        <Panel title={t("settings.panels.marketDisplay")}>
          <div class="grid gap-3">
            <ToggleField
              checked={props.isHeatmapEnabled}
              label={t("settings.display.heatmap")}
              onChange={props.onHeatmapEnabledChange}
            />
            <ToggleField
              checked={props.isHistogramEnabled}
              label={t("settings.display.histogram")}
              onChange={props.onHistogramEnabledChange}
            />
            <ToggleField
              checked={props.isHistogramCumulative}
              label={t("settings.display.cumulativeHistogram")}
              onChange={props.onHistogramCumulativeChange}
            />
            <SelectField
              label={t("settings.display.histogramNormalization")}
              options={normalizationOptions()}
              value={props.histogramNormalization}
              onChange={(value) => props.onHistogramNormalizationChange(value as HistogramNormalization)}
            />
            <Field label={t("settings.display.candleInterval")}>
              <TextInput
                inputMode="decimal"
                value={props.candleIntervalInput}
                onInput={(event) => props.onCandleIntervalInputChange(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.display.histogramWindowFraction")}>
              <TextInput
                disabled={props.isHistogramCumulative}
                inputMode="decimal"
                value={props.histogramWindowInput}
                onInput={(event) => props.onHistogramWindowInputChange(event.currentTarget.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t("settings.panels.performance")}>
          <div class="grid gap-3">
            <ToggleField
              checked={props.showFrameRate}
              label={t("settings.performance.fpsCounter")}
              onChange={props.onShowFrameRateChange}
            />
            <Field label={t("settings.performance.deltaSnapshotInterval")}>
              <TextInput
                inputMode="numeric"
                value={props.deltaSnapshotInput}
                onInput={(event) => props.onDeltaSnapshotInputChange(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.performance.deltaSnapshotFanout")}>
              <TextInput
                inputMode="numeric"
                value={props.fanoutInput}
                onInput={(event) => props.onFanoutInputChange(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.performance.deltaSnapshotLevels")}>
              <TextInput
                inputMode="numeric"
                value={props.levelsInput}
                onInput={(event) => props.onLevelsInputChange(event.currentTarget.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t("settings.panels.featureFlags")}>
          <div class="grid gap-3">
            <ToggleField
              checked={props.advancedOrdersEnabled}
              label={t("settings.features.advancedOrders")}
              onChange={props.onAdvancedOrdersEnabledChange}
            />
            <ToggleField
              checked={props.newsEventsEnabled}
              label={t("settings.features.newsEvents")}
              onChange={props.onNewsEventsEnabledChange}
            />
            <ToggleField
              checked={props.autosaveEnabled}
              label={t("settings.features.autosave")}
              onChange={props.onAutosaveEnabledChange}
            />
          </div>
        </Panel>

        <Panel title={t("settings.panels.localization")}>
          <SelectField
            label={t("settings.language.label")}
            options={languageOptions()}
            value={locale()}
            onChange={(value) => {
              if (isLocale(value)) {
                setLocale(value);
              }
            }}
          />
        </Panel>
      </div>
    </div>
  );
};
