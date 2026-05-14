import {
  Activity,
  ChartCandlestick,
  ChartLine,
  CircleDollarSign,
  Settings,
  Wallet,
  type LucideIcon,
} from "lucide-solid";
import { createSignal, For } from "solid-js";
import { Button } from "../ui-kit/Button";
import { Field } from "../ui-kit/Field";
import { Metric } from "../ui-kit/Metric";
import { Panel } from "../ui-kit/Panel";
import { Popover } from "../ui-kit/Popover";
import { Range } from "../ui-kit/Range";
import { Radio } from "../ui-kit/Radio";
import { Select } from "../ui-kit/Select";
import { TextInput } from "../ui-kit/TextInput";
import { Checkbox } from "../ui-kit/Checkbox";
import { paletteSwatches } from "../ui-kit/theme";
import { Link } from "../ui-kit/Link";
import { typographyRoles, typographySizes, typographyTypes, typographyWeights } from "../ui-kit/typography";
import clsx from "clsx";
import { Divider } from "../ui-kit/Divider";
import { Dialog } from "../ui-kit/Dialog";

const kitTabs = [
  { value: "market", label: "Market" },
  { value: "account", label: "Account" },
  { value: "economy", label: "Economy" },
  { value: "settings", label: "Settings" },
] as const;
const typographyGuidelines = [
  {
    className: "font-title-primary-xl-rg",
    label: "For headings",
    text: "Trading simulator",
  },
  {
    className: "font-title-secondary-base-rg",
    label: "For titles inside larger text blocks",
    text: "The beginning of your journey",
  },
  {
    className: "font-body-primary-base-rg",
    label: "For regular text bodies",
    text: "The first thing you do is buy, then sell later",
  },
  {
    className: "font-body-secondary-sm-light",
    label: "For secondary text and subtitles",
    text: "The best game ever btw",
  },
  {
    className: "font-body-secondary-xxs-rg",
    label: "Dense labels, timestamps, and other metadata.",
    text: "1987-01-14 17:21:00, sale, 100 shares",
  },
  {
    className: "font-mono-primary-sm-rg",
    label: "For numeric and tabular data",
    text: "$104,820.25",
  },
  {
    className: "font-mono-secondary-base-rg",
    label: "For code-like text and labels",
    text: "const foo = 123",
  },
] as const;

type TypographyRole = (typeof typographyRoles)[number];
type TypographyType = (typeof typographyTypes)[number];
type TypographySize = (typeof typographySizes)[number];
type TypographyWeight = (typeof typographyWeights)[number];
type TypographyColumn = {
  role: TypographyRole;
  roleIndex: number;
  type: TypographyType;
  typeIndex: number;
  weight: TypographyWeight;
  weightIndex: number;
};

const typographyColumns = typographyRoles.flatMap((role, roleIndex) =>
  typographyTypes.flatMap((type, typeIndex) =>
    typographyWeights.map((weight, weightIndex) => ({
      role,
      roleIndex,
      type,
      typeIndex,
      weight,
      weightIndex,
    })),
  ),
);
const typographyGridTemplateColumns = `5rem repeat(${typographyColumns.length}, 10rem)`;
const typographyRoleSpan = typographyTypes.length * typographyWeights.length;
const typographyTypeSpan = typographyWeights.length;

const typographyWeightLabels: Record<TypographyWeight, string> = {
  bold: "Bold",
  semi: "Semi",
  rg: "Regular",
  light: "Light",
};
const typographySizeLabels: Record<TypographySize, string> = {
  xxl: "XXL",
  xl: "XL",
  lg: "LG",
  base: "Base",
  sm: "SM",
  xs: "XS",
  xxs: "XXS",
};
const typographySampleText: Record<TypographyRole, string> = {
  title: "Aa",
  body: "Trade",
  mono: "123.45",
};
const typographyClassName = (
  role: TypographyRole,
  type: TypographyType,
  size: TypographySize,
  weight: TypographyWeight,
): string => `font-${role}-${type}-${size}-${weight}`;

const iconSamples: readonly { Icon: LucideIcon; label: string; toneClass: string }[] = [
  { Icon: Activity, label: "Activity", toneClass: "text-accent-primary" },
  { Icon: ChartCandlestick, label: "Candlestick", toneClass: "text-success" },
  { Icon: ChartLine, label: "Trend", toneClass: "text-warning" },
  { Icon: Wallet, label: "Wallet", toneClass: "text-text-primary" },
  { Icon: CircleDollarSign, label: "Capital", toneClass: "text-accent-secondary" },
  { Icon: Settings, label: "Settings", toneClass: "text-text-secondary" },
] as const;

export default function UiKitPage() {
  const [activeTab, setActiveTab] = createSignal<(typeof kitTabs)[number]["value"]>("market");
  const [heatmapEnabled, setHeatmapEnabled] = createSignal(true);
  const [histogramEnabled, setHistogramEnabled] = createSignal(false);
  const [language, setLanguage] = createSignal("en");
  const [isDialogOpen, setIsDialogOpen] = createSignal(false);
  const [hoverPopoverOpen, setHoverPopoverOpen] = createSignal(false);
  const [popoverOpen, setPopoverOpen] = createSignal(false);
  const [rangeValue, setRangeValue] = createSignal(40);
  const [volume, setVolume] = createSignal(70);

  return (
    <main class="font-body-primary-base-rg min-h-screen bg-surface-body p-6 text-text-primary">
      <div class="mx-auto grid min-w-0 max-w-6xl gap-5">
        <header class="flex items-center justify-between gap-4">
          <div>
            <p class="font-body-primary-xs-semi text-text-secondary uppercase">UI Kit</p>
            <h1 class="font-title-primary-xl-bold text-text-primary">Trading Simulator Components</h1>
          </div>
          <Link href="/game">Game</Link>
        </header>

        <Panel title="Palette">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
            <For each={paletteSwatches}>
              {(swatch) => (
                <div class="overflow-hidden rounded border border-border bg-surface-secondary">
                  <div style={{ background: swatch.value, height: "3.5rem" }} />
                  <div class="grid gap-1 p-3">
                    <span class="font-body-primary-sm-semi text-text-primary">{swatch.name}</span>
                    <span class="font-mono-primary-xs-rg text-text-secondary">{swatch.token}</span>
                    <span class="font-mono-primary-xs-rg text-text-secondary">{swatch.source}</span>
                    <span class="font-mono-primary-xs-rg text-text-secondary">{swatch.value}</span>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Panel>

        <Panel title="Typography Guidelines">
          <div class="grid gap-3">
            <For each={typographyGuidelines}>
              {(sample) => (
                <div class="grid grid-cols-[16rem_1fr] items-baseline gap-4 border-b border-border py-2 last:border-b-0">
                  <div class="flex flex-col gap-1">
                    <span class="font-body-primary-sm-rg text-text-primary">{sample.label}</span>
                    <span class="font-mono-secondary-xs-rg text-text-secondary">{sample.className}</span>
                  </div>
                  <span class={clsx(sample.className, "text-text-primary")}>{sample.text}</span>
                </div>
              )}
            </For>
          </div>
        </Panel>

        <Panel bodyClass="min-w-0 overflow-hidden p-0" class="min-w-0" title="Typography Examples">
          <div class="max-w-full overflow-x-auto overflow-y-hidden" style={{ "scrollbar-gutter": "stable" }}>
            <div
              class="grid w-max border-solid border-2 border-border bg-surface-secondary"
              style={{ "grid-template-columns": typographyGridTemplateColumns }}
            >
              <div class="sticky left-0 z-20 row-span-3 flex items-center bg-surface-secondary px-3 py-2 font-mono-primary-xs-semi text-text-secondary uppercase">
                Size
              </div>
              <For each={typographyRoles}>
                {(role) => (
                  <div
                    class="border-solid border-b border-l border-r-0 border-t-0 border-border bg-surface-secondary px-3 py-2 text-center font-body-primary-xs-semi text-text-secondary uppercase"
                    style={{ "grid-column": `span ${typographyRoleSpan} / span ${typographyRoleSpan}` }}
                  >
                    {role}
                  </div>
                )}
              </For>
              <For each={typographyRoles}>
                {() => (
                  <For each={typographyTypes}>
                    {(type) => (
                      <div
                        class="border-solid border-b border-l border-r-0 border-t-0 border-border bg-surface-secondary px-3 py-2 text-center font-body-primary-xs-semi text-text-secondary uppercase"
                        style={{ "grid-column": `span ${typographyTypeSpan} / span ${typographyTypeSpan}` }}
                      >
                        {type}
                      </div>
                    )}
                  </For>
                )}
              </For>
              <For each={typographyColumns}>
                {(column) => (
                  <div class="border-border border-solid border-b-0 border-l border-r-0 border-t-0 bg-surface-secondary px-3 py-2 text-center font-body-primary-xs-rg text-text-secondary uppercase">
                    {typographyWeightLabels[column.weight]}
                  </div>
                )}
              </For>
              <For each={typographySizes}>
                {(size) => (
                  <>
                    <div class="sticky left-0 z-10 flex items-center border-solid border-b-0 border-x-0 border-t border-border bg-surface-secondary px-3 py-3 font-mono-primary-xs-semi text-text-secondary uppercase">
                      {typographySizeLabels[size]}
                    </div>
                    <For each={typographyColumns}>
                      {(column) => {
                        const className = typographyClassName(column.role, column.type, size, column.weight);

                        return (
                          <div
                            class={clsx(
                              "grid min-h-24 content-between border-border gap-3 bg-surface-secondary p-3",
                              "border-solid border-b-0 border-r-0 border-t border-l",
                            )}
                          >
                            <span class={`${className} text-text-primary`}>{typographySampleText[column.role]}</span>
                            <span class="break-all font-mono-primary-xxs-rg text-text-secondary">{className}</span>
                          </div>
                        );
                      }}
                    </For>
                  </>
                )}
              </For>
            </div>
          </div>
        </Panel>

        <Panel title="Icons">
          <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-3">
            <For each={iconSamples}>
              {(sample) => {
                const Icon = sample.Icon;

                return (
                  <div class="flex items-center gap-3 rounded border border-border bg-surface-secondary p-3">
                    <span
                      class={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border bg-surface-primary ${sample.toneClass}`}
                    >
                      <Icon aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <span class="font-body-primary-sm-semi text-text-primary">{sample.label}</span>
                  </div>
                );
              }}
            </For>
          </div>
        </Panel>

        <div class="grid grid-cols-[1fr_22rem] gap-5">
          <Panel title="Controls">
            <div class="grid gap-4">
              <Radio options={kitTabs} value={activeTab()} onChange={setActiveTab} />

              <div class="flex flex-row gap-2">
                <Link>Link</Link>
                <Divider />
                <span>Divider</span>
              </div>

              <div class="flex flex-wrap gap-2 items-center">
                <Button variant="primary">Primary</Button>
                <Button variant="primary" size="sm">
                  Primary
                </Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="danger">Danger</Button>
                <Button disabled>Disabled</Button>
                <Button aria-label="Settings" variant="icon">
                  <Settings aria-hidden="true" class="h-5 w-5" strokeWidth={1.8} />
                </Button>
                <Button aria-label="Small settings" size="sm" variant="icon">
                  <Settings aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                </Button>
                <Button onClick={() => setIsDialogOpen(true)}>Open Dialog</Button>
                <Popover
                  open={popoverOpen()}
                  align="start"
                  trigger={
                    <Button
                      aria-expanded={popoverOpen()}
                      aria-label="Open popover"
                      variant="secondary"
                      onClick={() => setPopoverOpen((open) => !open)}
                    >
                      Popover
                    </Button>
                  }
                  onOpenChange={setPopoverOpen}
                >
                  <div class="grid gap-3">
                    <p class="font-body-primary-sm-semi text-text-primary">Mixer</p>
                    <Field class="flex items-center justify-between gap-3" label="Master">
                      <div class="flex items-center gap-2">
                        <span class="font-mono-primary-xs-rg text-text-primary">{volume()}%</span>
                        <Range class="w-36" max={100} min={0} value={volume()} onChange={setVolume} />
                      </div>
                    </Field>
                  </div>
                </Popover>
                <Popover
                  open={hoverPopoverOpen()}
                  align="start"
                  openOnHover
                  trigger={
                    <Button aria-expanded={hoverPopoverOpen()} aria-label="Open hover popover" variant="secondary">
                      Hover Popover
                    </Button>
                  }
                  onOpenChange={setHoverPopoverOpen}
                >
                  <div class="grid gap-1">
                    <p class="font-body-primary-sm-semi text-text-primary">Hover Popover</p>
                    <p class="font-body-primary-xs-rg text-text-secondary">
                      Pointer enter opens it, pointer leave closes it.
                    </p>
                  </div>
                </Popover>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <Field label="Limit price">
                  <TextInput inputMode="decimal" placeholder="1.002500" />
                </Field>
                <Field label="Order size">
                  <TextInput inputMode="decimal" placeholder="250" />
                </Field>
              </div>

              <Field class="flex items-center justify-between gap-3" label="Range">
                <div class="flex items-center gap-2 w-1/2">
                  <span class="font-mono-primary-xs-rg text-text-primary">{rangeValue()}%</span>
                  <Range class="w-52" max={100} min={0} value={rangeValue()} onChange={setRangeValue} />
                </div>
              </Field>

              <div class="grid grid-cols-2 gap-3">
                <Field label="Language">
                  <Select
                    options={[
                      { value: "en", label: "English" },
                      { value: "uk", label: "Ukrainian" },
                      { value: "de", label: "German" },
                    ]}
                    value={language()}
                    onChange={(event) => setLanguage(event.currentTarget.value)}
                  />
                </Field>
                <div class="grid gap-2">
                  <Field class="flex items-center justify-between gap-3" label="Heatmap">
                    <Checkbox
                      checked={heatmapEnabled()}
                      onInput={(event) => setHeatmapEnabled(event.currentTarget.checked)}
                    />
                  </Field>
                  <Field class="flex items-center justify-between gap-3" label="Histogram">
                    <Checkbox
                      checked={histogramEnabled()}
                      onInput={(event) => setHistogramEnabled(event.currentTarget.checked)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          </Panel>

          <Dialog open={isDialogOpen()} onOpenChange={setIsDialogOpen}>
            <div class="grid gap-4">
              <div class="grid gap-1">
                <h2 class="font-title-secondary-base-rg text-text-primary">Order Confirmation</h2>
                <p class="font-body-primary-sm-rg text-text-secondary">
                  Review the order details before submitting it to the market.
                </p>
              </div>
              <div class="grid gap-2 rounded border border-border bg-surface-secondary p-3 font-mono-primary-sm-rg">
                <div class="flex items-center justify-between gap-4">
                  <span class="text-text-secondary">Side</span>
                  <span>Buy</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-text-secondary">Size</span>
                  <span>250</span>
                </div>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-text-secondary">Limit</span>
                  <span>1.002500</span>
                </div>
              </div>
              <div class="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setIsDialogOpen(false)}>
                  Submit
                </Button>
              </div>
            </div>
          </Dialog>

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
