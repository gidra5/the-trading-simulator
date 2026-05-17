import type { Component } from "solid-js";
import { locale, t } from "../../i18n/game";
import { settings } from "../../routes/game/state";
import { Panel } from "../../ui-kit/Panel";

export const SettingsSidebar: Component = () => {
  const status = (enabled: boolean): string => (enabled ? t("common.on") : t("common.off"));

  // todo: show useful metrics maybe?
  return (
    <div class="grid gap-3 p-3">
      <Panel title={t("settings.panels.runtime")}>
        <div class="grid gap-2">
          <SideValue label={t("settings.display.heatmap")} value={status(settings.isHeatmapEnabled())} />
          <SideValue label={t("settings.display.histogram")} value={status(settings.isHistogramEnabled())} />
          <SideValue label={t("settings.performance.fps")} value={status(settings.showFrameRate())} />
          <SideValue label={t("settings.language.label")} value={t(`settings.language.${locale()}`)} />
          <SideValue label={t("settings.features.advancedOrders")} value={status(settings.advancedOrdersEnabled())} />
          <SideValue label={t("settings.features.newsEvents")} value={status(settings.newsEventsEnabled())} />
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
