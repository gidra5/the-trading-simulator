import type { Component } from "solid-js";
import { locale, t } from "../../i18n/game";
import { Panel } from "../../ui-kit/Panel";
import { gameSettings } from "./settings";

export const SettingsSidebar: Component = () => {
  const status = (enabled: boolean): string => (enabled ? t("common.on") : t("common.off"));

  return (
    <div class="grid gap-3 p-3">
      <Panel title={t("settings.panels.runtime")}>
        <div class="grid gap-2">
          <SideValue label={t("settings.display.heatmap")} value={status(gameSettings.isHeatmapEnabled())} />
          <SideValue label={t("settings.display.histogram")} value={status(gameSettings.isHistogramEnabled())} />
          <SideValue label={t("settings.performance.fps")} value={status(gameSettings.showFrameRate())} />
          <SideValue label={t("settings.language.label")} value={t(`settings.language.${locale()}`)} />
          <SideValue
            label={t("settings.features.advancedOrders")}
            value={status(gameSettings.advancedOrdersEnabled())}
          />
          <SideValue label={t("settings.features.newsEvents")} value={status(gameSettings.newsEventsEnabled())} />
        </div>
      </Panel>
    </div>
  );
};

const SideValue: Component<{ label: string; value: string }> = (props) => (
  <div class="flex items-center justify-between border-b border-border py-2 last:border-b-0">
    <span class="font-body-secondary-sm-rg text-text-secondary">{props.label}</span>
    <span class="font-mono-primary-sm-rg text-text-primary">{props.value}</span>
  </div>
);
