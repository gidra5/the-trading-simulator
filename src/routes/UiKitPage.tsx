import { createSignal, For } from "solid-js";
import { Button } from "../ui-kit/Button";
import { Field } from "../ui-kit/Field";
import { Metric } from "../ui-kit/Metric";
import { Panel } from "../ui-kit/Panel";
import { SelectField } from "../ui-kit/SelectField";
import { TabBar } from "../ui-kit/TabBar";
import { TextInput } from "../ui-kit/TextInput";
import { ToggleField } from "../ui-kit/ToggleField";
import { paletteSwatches } from "../ui-kit/theme";

const kitTabs = [
  { value: "market", label: "Market" },
  { value: "account", label: "Account" },
  { value: "economy", label: "Economy" },
  { value: "settings", label: "Settings" },
] as const;
const typographySamples = [
  { className: "title-primary-xl-bold", label: "title-primary-xl-bold", text: "Trading Simulator" },
  { className: "title-secondary-lg-semi", label: "title-secondary-lg-semi", text: "Market Session" },
  {
    className: "body-primary-base-rg",
    label: "body-primary-base-rg",
    text: "Open positions and net worth update live.",
  },
  { className: "body-secondary-sm-light", label: "body-secondary-sm-light", text: "Secondary details stay quiet." },
  {
    className: "body-secondary-xxs-rg",
    label: "body-secondary-xxs-rg",
    text: "Dense labels, timestamps, and metadata.",
  },
  { className: "mono-sm-rg text-accent-primary", label: "mono-sm-rg", text: "$104,820.25" },
] as const;

export default function UiKitPage() {
  const [activeTab, setActiveTab] = createSignal<(typeof kitTabs)[number]["value"]>("market");
  const [heatmapEnabled, setHeatmapEnabled] = createSignal(true);
  const [histogramEnabled, setHistogramEnabled] = createSignal(false);
  const [language, setLanguage] = createSignal("en");

  return (
    <main class="body-primary-base-rg min-h-screen bg-surface-primary p-6">
      <div class="mx-auto grid max-w-6xl gap-5">
        <header class="flex items-center justify-between gap-4">
          <div>
            <p class="body-secondary-xs-semi uppercase">UI Kit</p>
            <h1 class="title-primary-xl-bold">Trading Simulator Components</h1>
          </div>
          <a
            class="body-secondary-sm-semi inline-flex h-9 items-center rounded border border-transparent px-3 no-underline transition hover:bg-surface-secondary hover:text-text-primary"
            href="/game"
          >
            Game
          </a>
        </header>

        <Panel title="Palette">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
            <For each={paletteSwatches}>
              {(swatch) => (
                <div class="overflow-hidden rounded border border-border bg-surface-secondary">
                  <div style={{ background: swatch.value, height: "3.5rem" }} />
                  <div class="grid gap-1 p-3">
                    <span class="body-primary-sm-semi">{swatch.name}</span>
                    <span class="mono-xs-rg text-text-secondary">{swatch.token}</span>
                    <span class="mono-xs-rg text-text-secondary">{swatch.source}</span>
                    <span class="mono-xs-rg text-text-secondary">{swatch.value}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Panel>

        <Panel title="Typography">
          <div class="grid gap-3">
            <For each={typographySamples}>
              {(sample) => (
                <div class="grid grid-cols-[16rem_1fr] items-baseline gap-4 border-b border-border py-2 last:border-b-0">
                  <span class="mono-xs-rg text-text-secondary">{sample.label}</span>
                  <span class={sample.className}>{sample.text}</span>
                </div>
              )}
            </For>
          </div>
        </Panel>

        <div class="grid grid-cols-[1fr_22rem] gap-5">
          <Panel title="Controls">
            <div class="grid gap-4">
              <TabBar tabs={kitTabs} value={activeTab()} onChange={setActiveTab} />

              <div class="flex flex-wrap gap-2">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button disabled>Disabled</Button>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <Field label="Limit price">
                  <TextInput inputMode="decimal" placeholder="1.002500" />
                </Field>
                <Field label="Order size">
                  <TextInput inputMode="decimal" placeholder="250" />
                </Field>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <SelectField
                  label="Language"
                  options={[
                    { value: "en", label: "English" },
                    { value: "uk", label: "Ukrainian" },
                    { value: "de", label: "German" },
                  ]}
                  value={language()}
                  onChange={setLanguage}
                />
                <div class="grid gap-2 pt-5">
                  <ToggleField checked={heatmapEnabled()} label="Heatmap" onChange={setHeatmapEnabled} />
                  <ToggleField checked={histogramEnabled()} label="Histogram" onChange={setHistogramEnabled} />
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="Metrics">
            <div class="grid gap-3">
              <Metric detail="Cash available" label="Balance" value="$100,000.00" />
              <Metric detail="Unrealized and realized" label="Net Worth" tone="accent" value="$104,820.25" />
              <Metric detail="Current exposure" label="Leverage" tone="warning" value="1.42x" />
              <Metric detail="No forced close" label="Liquidation" tone="success" value="None" />
            </div>
          </Panel>
        </div>
      </div>
    </main>
  );
}
