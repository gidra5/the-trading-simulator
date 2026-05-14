import { createMemo, createSignal, type Component } from "solid-js";
import { locales, locale, setLocale, t, type Locale } from "../../i18n/game";
import { market } from "../../routes/game/state";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { Select } from "../../ui-kit/Select";
import { TextInput } from "../../ui-kit/TextInput";
import { Checkbox } from "../../ui-kit/Checkbox";
import { HistogramNormalization } from "../OrderBookHistogram";
import { gameSettings } from "./settings";

const isLocale = (value: string): value is Locale => locales.includes(value as Locale);
const checkboxFieldClass = "flex items-center justify-between gap-3";

export const SettingsBody: Component = () => {
  const [candleIntervalInput, setCandleIntervalInput] = createSignal(String(gameSettings.candleInterval() / 1_000));
  const [histogramWindowInput, setHistogramWindowInput] = createSignal(String(gameSettings.histogramWindowFraction()));
  const [deltaSnapshotInput, setDeltaSnapshotInput] = createSignal(String(market.deltaSnapshotInterval()));
  const [fanoutInput, setFanoutInput] = createSignal(String(market.fanout()));
  const [levelsInput, setLevelsInput] = createSignal(String(market.levels()));
  const languageOptions = createMemo(() => locales.map((value) => ({ value, label: t(`settings.language.${value}`) })));
  const normalizationOptions = createMemo(() => [
    { value: HistogramNormalization.Linear, label: t("settings.normalization.linear") },
    { value: HistogramNormalization.Logarithmic, label: t("settings.normalization.logarithmic") },
  ]);

  const updatePositiveNumberInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    onValid(next);
  };

  const updateNonNegativeNumberInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isFinite(next) || next < 0) return;
    onValid(next);
  };

  const updatePositiveIntegerInput = (
    value: string,
    setInput: (value: string) => void,
    onValid: (value: number) => void,
  ): void => {
    setInput(value);
    const next = Number(value);
    if (!Number.isInteger(next) || next <= 0) return;
    onValid(next);
  };

  const updateCandleIntervalInput = (value: string): void => {
    updatePositiveNumberInput(value, setCandleIntervalInput, (next) =>
      gameSettings.setCandleInterval(Math.round(next * 1_000)),
    );
  };

  const updateDeltaSnapshotInput = (value: string): void => {
    updatePositiveIntegerInput(value, setDeltaSnapshotInput, market.setDeltaSnapshotInterval);
  };

  const updateFanoutInput = (value: string): void => {
    updatePositiveIntegerInput(value, setFanoutInput, market.setFanout);
  };

  const updateHistogramWindowInput = (value: string): void => {
    updateNonNegativeNumberInput(value, setHistogramWindowInput, gameSettings.setHistogramWindowFraction);
  };

  const updateLevelsInput = (value: string): void => {
    updatePositiveIntegerInput(value, setLevelsInput, market.setLevels);
  };

  return (
    <div class="h-full overflow-auto p-4">
      <div class="grid grid-cols-2 gap-4">
        <Panel title={t("settings.panels.marketDisplay")}>
          <div class="grid gap-3">
            <Field class={checkboxFieldClass} label={t("settings.display.heatmap")}>
              <Checkbox
                checked={gameSettings.isHeatmapEnabled()}
                onInput={(event) => gameSettings.setIsHeatmapEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.display.histogram")}>
              <Checkbox
                checked={gameSettings.isHistogramEnabled()}
                onInput={(event) => gameSettings.setIsHistogramEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.display.cumulativeHistogram")}>
              <Checkbox
                checked={gameSettings.isHistogramCumulative()}
                onInput={(event) => gameSettings.setIsHistogramCumulative(event.currentTarget.checked)}
              />
            </Field>
            <Field label={t("settings.display.histogramNormalization")}>
              <Select
                options={normalizationOptions()}
                value={gameSettings.histogramNormalization()}
                onChange={(event) =>
                  gameSettings.setHistogramNormalization(event.currentTarget.value as HistogramNormalization)
                }
              />
            </Field>
            <Field label={t("settings.display.candleInterval")}>
              <TextInput
                inputMode="decimal"
                value={candleIntervalInput()}
                onInput={(event) => updateCandleIntervalInput(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.display.histogramWindowFraction")}>
              <TextInput
                disabled={gameSettings.isHistogramCumulative()}
                inputMode="decimal"
                value={histogramWindowInput()}
                onInput={(event) => updateHistogramWindowInput(event.currentTarget.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t("settings.panels.performance")}>
          <div class="grid gap-3">
            <Field class={checkboxFieldClass} label={t("settings.performance.fpsCounter")}>
              <Checkbox
                checked={gameSettings.showFrameRate()}
                onInput={(event) => gameSettings.setShowFrameRate(event.currentTarget.checked)}
              />
            </Field>
            <Field label={t("settings.performance.deltaSnapshotInterval")}>
              <TextInput
                inputMode="numeric"
                value={deltaSnapshotInput()}
                onInput={(event) => updateDeltaSnapshotInput(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.performance.deltaSnapshotFanout")}>
              <TextInput
                inputMode="numeric"
                value={fanoutInput()}
                onInput={(event) => updateFanoutInput(event.currentTarget.value)}
              />
            </Field>
            <Field label={t("settings.performance.deltaSnapshotLevels")}>
              <TextInput
                inputMode="numeric"
                value={levelsInput()}
                onInput={(event) => updateLevelsInput(event.currentTarget.value)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t("settings.panels.featureFlags")}>
          <div class="grid gap-3">
            <Field class={checkboxFieldClass} label={t("settings.features.advancedOrders")}>
              <Checkbox
                checked={gameSettings.advancedOrdersEnabled()}
                onInput={(event) => gameSettings.setAdvancedOrdersEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.features.newsEvents")}>
              <Checkbox
                checked={gameSettings.newsEventsEnabled()}
                onInput={(event) => gameSettings.setNewsEventsEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.features.autosave")}>
              <Checkbox
                checked={gameSettings.autosaveEnabled()}
                onInput={(event) => gameSettings.setAutosaveEnabled(event.currentTarget.checked)}
              />
            </Field>
          </div>
        </Panel>

        <Panel title={t("settings.panels.localization")}>
          <Field label={t("settings.language.label")}>
            <Select
              options={languageOptions()}
              value={locale()}
              onChange={(event) => {
                if (isLocale(event.currentTarget.value)) {
                  setLocale(event.currentTarget.value);
                }
              }}
            />
          </Field>
        </Panel>
      </div>
    </div>
  );
};
