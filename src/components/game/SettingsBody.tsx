import clsx from "clsx";
import { Download, Upload } from "lucide-solid";
import { createMemo, createSignal, For, type Component } from "solid-js";
import { locales, locale, setLocale, t, type Locale } from "../../i18n/game";
import { market, settings } from "../../routes/game/state";
import { encodings, type StoreEncoding, type StoreKind } from "../../storage/interface";
import type { SaveFileStoreEntry, SaveFileStoreStatus } from "../../storage/persistence";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { Select } from "../../ui-kit/Select";
import { TextInput } from "../../ui-kit/TextInput";
import { formatStorageBytes } from "../../utils";
import type { AutosaveStatusReason } from "./autosaveStatus";
import { Checkbox } from "../../ui-kit/Checkbox";
import { HistogramNormalization } from "../OrderBookHistogram";

const isLocale = (value: string): value is Locale => locales.includes(value as Locale);
const checkboxFieldClass = "flex items-center justify-between gap-3";
const saveStoreStatusClasses: Record<SaveFileStoreStatus, string> = {
  available: "text-success",
  denied: "text-danger",
  error: "text-danger",
  "not-supported": "text-text-secondary",
  pending: "text-warning",
};

const isStoreEncoding = (value: string): value is StoreEncoding => encodings.includes(value as StoreEncoding);

const parseAutosavePreference = (value: string): Exclude<StoreKind, "manual"> | null => {
  if (value === "opfs" || value === "file-system") return value;

  return null;
};

const autosaveStoreLabel = (kind: StoreKind): string => {
  switch (kind) {
    case "file-system":
      return t("autosave.store.fileSystem");
    case "opfs":
      return t("autosave.store.opfs");
    case "manual":
      return t("autosave.store.manual");
  }
};

const autosaveStoreStatusLabel = (status: SaveFileStoreStatus): string => {
  switch (status) {
    case "available":
      return t("autosave.storeStatus.available");
    case "denied":
      return t("autosave.storeStatus.denied");
    case "error":
      return t("autosave.storeStatus.error");
    case "not-supported":
      return t("autosave.storeStatus.notSupported");
    case "pending":
      return t("autosave.storeStatus.pending");
  }
};

const autosaveStatusCopy = (
  reason: AutosaveStatusReason,
  store: string,
): { action: string; description: string; title: string } => {
  switch (reason) {
    case "automatic-ready":
      return {
        action: t("autosave.status.active.action"),
        description: t("autosave.status.active.description", { store }),
        title: t("autosave.status.active.title"),
      };
    case "automatic-unavailable":
      return {
        action: t("autosave.status.unavailable.action"),
        description: t("autosave.status.unavailable.description"),
        title: t("autosave.status.unavailable.title"),
      };
    case "autosave-disabled":
      return {
        action: t("autosave.status.disabled.action"),
        description: t("autosave.status.disabled.description"),
        title: t("autosave.status.disabled.title"),
      };
    case "file-system-pending":
      return {
        action: t("autosave.status.pending.action"),
        description: t("autosave.status.pending.description", { store }),
        title: t("autosave.status.pending.title"),
      };
    case "opfs-quota-low":
      return {
        action: t("autosave.status.quotaLow.action"),
        description: t("autosave.status.quotaLow.description"),
        title: t("autosave.status.quotaLow.title"),
      };
    case "storage-checking":
      return {
        action: t("autosave.status.checking.action"),
        description: t("autosave.status.checking.description"),
        title: t("autosave.status.checking.title"),
      };
    case "store-error":
      return {
        action: t("autosave.status.error.action"),
        description: t("autosave.status.error.description", { store }),
        title: t("autosave.status.error.title"),
      };
  }
};

const autosaveStatusToneClass = (reason: AutosaveStatusReason): string => {
  switch (reason) {
    case "automatic-ready":
      return "text-success";
    case "store-error":
      return "text-danger";
    case "file-system-pending":
    case "opfs-quota-low":
    case "storage-checking":
      return "text-warning";
    case "automatic-unavailable":
    case "autosave-disabled":
      return "text-text-secondary";
  }
};

const autosaveEntryStoreState = (entry: SaveFileStoreEntry<unknown>): string =>
  entry.store ? t("autosave.store.ready") : t("autosave.store.none");

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : "Unknown error");

export const SettingsBody: Component = () => {
  const [candleIntervalInput, setCandleIntervalInput] = createSignal(String(settings.candleInterval() / 1_000));
  const [histogramWindowInput, setHistogramWindowInput] = createSignal(String(settings.histogramWindowFraction()));
  const [deltaSnapshotInput, setDeltaSnapshotInput] = createSignal(String(market.deltaSnapshotInterval()));
  const [fanoutInput, setFanoutInput] = createSignal(String(market.fanout()));
  const [levelsInput, setLevelsInput] = createSignal(String(market.levels()));
  const [settingsTransferStatus, setSettingsTransferStatus] = createSignal("");
  const languageOptions = createMemo(() => locales.map((value) => ({ value, label: t(`settings.language.${value}`) })));
  const normalizationOptions = createMemo(() => [
    { value: HistogramNormalization.Linear, label: t("settings.normalization.linear") },
    { value: HistogramNormalization.Logarithmic, label: t("settings.normalization.logarithmic") },
  ]);
  const autosaveEncodingOptions = createMemo(() =>
    encodings.map((encoding) => ({ value: encoding, label: t(`storage.serializer.${encoding}` as const) })),
  );
  const autosaveStorageOptions = createMemo(() => [
    { value: "auto", label: t("settings.autosave.storage.auto") },
    { value: "opfs", label: t("autosave.store.opfs") },
    { value: "file-system", label: t("autosave.store.fileSystem") },
  ]);
  const autosaveStatusEntry = () => settings.autosaveStatus().entry;
  const autosaveStatusStore = () => {
    const entry = autosaveStatusEntry();

    return entry ? autosaveStoreLabel(entry.kind) : t("autosave.store.manual");
  };
  const autosaveStatusDetails = () => autosaveStatusCopy(settings.autosaveStatus().reason, autosaveStatusStore());
  const autosaveStatusClass = () => autosaveStatusToneClass(settings.autosaveStatus().reason);

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
      settings.setCandleInterval(Math.round(next * 1_000)),
    );
  };

  const updateDeltaSnapshotInput = (value: string): void => {
    updatePositiveIntegerInput(value, setDeltaSnapshotInput, market.setDeltaSnapshotInterval);
  };

  const updateFanoutInput = (value: string): void => {
    updatePositiveIntegerInput(value, setFanoutInput, market.setFanout);
  };

  const updateHistogramWindowInput = (value: string): void => {
    updateNonNegativeNumberInput(value, setHistogramWindowInput, settings.setHistogramWindowFraction);
  };

  const updateLevelsInput = (value: string): void => {
    updatePositiveIntegerInput(value, setLevelsInput, market.setLevels);
  };

  const exportSettings = async (): Promise<void> => {
    try {
      // todo: export current save file using gameSettings.stores.manual
      setSettingsTransferStatus(t("settings.importExport.exported"));
    } catch (error) {
      setSettingsTransferStatus(t("settings.importExport.exportFailed", { error: errorMessage(error) }));
    }
  };

  const importSettings = async (): Promise<void> => {
    try {
      // todo: use gameSettings.stores.manual
      // const snapshot = await settingsFileStore.load();
      // if (!snapshot) {
      //   setSettingsTransferStatus(t("settings.importExport.importCanceled"));
      //   return;
      // }

      // todo: import current save file
      // if (!applySettingsSnapshot(snapshot)) {
      //   setSettingsTransferStatus(t("settings.importExport.importInvalid"));
      //   return;
      // }

      setSettingsTransferStatus(t("settings.importExport.imported"));
    } catch (error) {
      setSettingsTransferStatus(t("settings.importExport.importFailed", { error: errorMessage(error) }));
    }
  };

  return (
    <div class="h-full overflow-auto p-4">
      <div class="grid grid-cols-2 gap-4">
        <Panel title={t("settings.panels.marketDisplay")}>
          <div class="grid gap-3">
            <Field class={checkboxFieldClass} label={t("settings.display.heatmap")}>
              <Checkbox
                checked={settings.isHeatmapEnabled()}
                onInput={(event) => settings.setIsHeatmapEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.display.histogram")}>
              <Checkbox
                checked={settings.isHistogramEnabled()}
                onInput={(event) => settings.setIsHistogramEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.display.cumulativeHistogram")}>
              <Checkbox
                checked={settings.isHistogramCumulative()}
                onInput={(event) => settings.setIsHistogramCumulative(event.currentTarget.checked)}
              />
            </Field>
            <Field label={t("settings.display.histogramNormalization")}>
              <Select
                options={normalizationOptions()}
                value={settings.histogramNormalization()}
                onChange={(event) =>
                  settings.setHistogramNormalization(event.currentTarget.value as HistogramNormalization)
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
                disabled={settings.isHistogramCumulative()}
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
                checked={settings.showFrameRate()}
                onInput={(event) => settings.setShowFrameRate(event.currentTarget.checked)}
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

        <Panel class="col-span-2" title={t("settings.panels.saveSettings")}>
          <div class="grid gap-3">
            <div class="grid grid-cols-2 gap-3">
              <Field class={checkboxFieldClass} label={t("settings.features.autosave")}>
                <Checkbox
                  checked={settings.autosaveEnabled()}
                  onInput={(event) => settings.setAutosaveEnabled(event.currentTarget.checked)}
                />
              </Field>
              <Field label={t("settings.autosave.storage")}>
                <Select
                  options={autosaveStorageOptions()}
                  value={settings.autosaveStorePreference() ?? "auto"}
                  onChange={(event) =>
                    settings.setAutosaveStorePreference(parseAutosavePreference(event.currentTarget.value))
                  }
                />
              </Field>
              <Field label={t("settings.autosave.fileName")}>
                <TextInput
                  value={settings.autosaveFileName()}
                  onInput={(event) => settings.setAutosaveFileName(event.currentTarget.value)}
                />
              </Field>
              <Field label={t("settings.autosave.encoding")}>
                <Select
                  options={autosaveEncodingOptions()}
                  value={settings.autosaveEncoding()}
                  onChange={(event) => {
                    if (isStoreEncoding(event.currentTarget.value)) {
                      settings.setAutosaveEncoding(event.currentTarget.value);
                    }
                  }}
                />
              </Field>
            </div>

            <div class="grid gap-1 rounded border border-border bg-surface-secondary p-3">
              <div class="flex items-center justify-between gap-3">
                <span class={clsx("font-body-primary-sm-semi", autosaveStatusClass())}>
                  {autosaveStatusDetails().title}
                </span>
                <span class="font-mono-primary-xs-rg text-text-secondary">{autosaveStatusStore()}</span>
              </div>
              <p class="font-body-primary-xs-rg text-text-secondary">{autosaveStatusDetails().description}</p>
              <p class="font-body-primary-xs-rg text-text-primary">{autosaveStatusDetails().action}</p>
            </div>

            <div class="grid grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] gap-3">
              <For each={settings.autosaveStores()}>
                {(entry) => (
                  <div
                    class={clsx(
                      "grid gap-2 rounded border bg-surface-secondary p-3",
                      settings.autosaveActiveStore()?.kind === entry.kind ? "border-accent-primary" : "border-border",
                    )}
                  >
                    <div class="flex items-center justify-between gap-3">
                      <span class="font-body-primary-sm-semi text-text-primary">{autosaveStoreLabel(entry.kind)}</span>
                      <span class={clsx("font-body-primary-xs-semi uppercase", saveStoreStatusClasses[entry.status])}>
                        {autosaveStoreStatusLabel(entry.status)}
                      </span>
                    </div>
                    <p class="min-h-10 break-words font-body-primary-xs-rg text-text-secondary">{entry.message}</p>
                    <div class="grid gap-1 font-mono-primary-xs-rg text-text-secondary">
                      <div class="flex justify-between gap-3">
                        <span>{t("autosave.store.label")}</span>
                        <span class={entry.store ? "text-success" : "text-text-secondary"}>
                          {autosaveEntryStoreState(entry)}
                        </span>
                      </div>
                      {entry.kind === "manual" ? (
                        <>
                          <div class="flex justify-between gap-3">
                            {settingsTransferStatus() ? (
                              <span class="font-body-primary-xs-rg text-text-secondary">
                                {settingsTransferStatus()}
                              </span>
                            ) : null}
                          </div>
                          <div class="flex flex-wrap items-center justify-center gap-2">
                            <Button onClick={() => void exportSettings()} disabled={entry.status !== "available"}>
                              <Download aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                              <span>{t("settings.importExport.export")}</span>
                            </Button>
                            <Button onClick={() => void importSettings()} disabled={entry.status !== "available"}>
                              <Upload aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                              <span>{t("settings.importExport.import")}</span>
                            </Button>
                          </div>
                        </>
                      ) : null}
                      {entry.kind === "opfs" ? (
                        <>
                          <div class="flex justify-between gap-3">
                            <span>{t("autosave.storage.usage")}</span>
                            <span>{formatStorageBytes(entry.usage)}</span>
                          </div>
                          <div class="flex justify-between gap-3">
                            <span>{t("autosave.storage.quota")}</span>
                            <span>{formatStorageBytes(entry.quota)}</span>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Panel>

        <Panel title={t("settings.panels.featureFlags")}>
          <div class="grid gap-3">
            <Field class={checkboxFieldClass} label={t("settings.features.advancedOrders")}>
              <Checkbox
                checked={settings.advancedOrdersEnabled()}
                onInput={(event) => settings.setAdvancedOrdersEnabled(event.currentTarget.checked)}
              />
            </Field>
            <Field class={checkboxFieldClass} label={t("settings.features.newsEvents")}>
              <Checkbox
                checked={settings.newsEventsEnabled()}
                onInput={(event) => settings.setNewsEventsEnabled(event.currentTarget.checked)}
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
