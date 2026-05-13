import type { Component } from "solid-js";
import { Panel } from "../../ui-kit/Panel";

type SettingsSidebarProps = {
  advancedOrdersEnabled: boolean;
  isHeatmapEnabled: boolean;
  isHistogramEnabled: boolean;
  language: string;
  newsEventsEnabled: boolean;
  showFrameRate: boolean;
};

export const SettingsSidebar: Component<SettingsSidebarProps> = (props) => (
  <div class="grid gap-3 p-3">
    <Panel title="Runtime">
      <div class="grid gap-2">
        <SideValue label="Heatmap" value={props.isHeatmapEnabled ? "On" : "Off"} />
        <SideValue label="Histogram" value={props.isHistogramEnabled ? "On" : "Off"} />
        <SideValue label="FPS" value={props.showFrameRate ? "On" : "Off"} />
        <SideValue label="Language" value={props.language.toUpperCase()} />
        <SideValue label="Advanced orders" value={props.advancedOrdersEnabled ? "On" : "Off"} />
        <SideValue label="News events" value={props.newsEventsEnabled ? "On" : "Off"} />
      </div>
    </Panel>
  </div>
);

const SideValue: Component<{ label: string; value: string }> = (props) => (
  <div class="flex items-center justify-between border-b border-border py-2 last:border-b-0">
    <span class="font-body-secondary-sm-rg text-text-secondary">{props.label}</span>
    <span class="font-mono-primary-sm-rg text-text-primary">{props.value}</span>
  </div>
);
