import { For, createSignal, type Component } from "solid-js";
import type { SimulationOrchestrator } from "../simulation/orchestrator";
import {
  cloneMarketModelSettings,
  defaultMarketModelSettings,
  simulationEventTypes,
  type MarketModelSettings,
  type OrderPriceDistribution,
  type OrderSelectionDistribution,
  type OrderSizeDistribution,
  type SimulationEventType,
  type SimulationEventVector,
} from "../simulation/types";
import { Button } from "../ui-kit/Button";

type PartialEventVector = Partial<SimulationEventVector>;
type PartialExcitationMatrix = Partial<Record<SimulationEventType, PartialEventVector>>;
type MarketPresetSettingsOverrides = Partial<
  Omit<MarketModelSettings, "excitementHalfLife" | "excitationMatrix" | "publicInterest">
> & {
  excitementHalfLife?: PartialEventVector;
  excitationMatrix?: PartialExcitationMatrix;
  publicInterest?: PartialEventVector;
};

type MarketPreset = {
  description: string;
  id: string;
  name: string;
  orderPriceDistribution: OrderPriceDistribution;
  orderSelectionDistribution: OrderSelectionDistribution;
  orderSizeDistribution: OrderSizeDistribution;
  settings: MarketModelSettings;
  traits: readonly string[];
};

const presetSettings = (overrides: MarketPresetSettingsOverrides = {}): MarketModelSettings => {
  const base = cloneMarketModelSettings(defaultMarketModelSettings);
  const { excitementHalfLife, excitationMatrix, publicInterest, ...scalarOverrides } = overrides;

  for (const source of simulationEventTypes) {
    Object.assign(base.excitationMatrix[source], excitationMatrix?.[source]);
  }

  return {
    ...base,
    ...scalarOverrides,
    excitementHalfLife: { ...base.excitementHalfLife, ...excitementHalfLife },
    publicInterest: { ...base.publicInterest, ...publicInterest },
  };
};

const sumEvents = (events: SimulationEventVector, prefix: "cancel" | "market" | "order"): number =>
  events[`${prefix}-buy`] + events[`${prefix}-sell`];

const marketPresets: readonly MarketPreset[] = [
  {
    id: "baseline",
    name: "Baseline",
    description: "Balanced event rates with moderate two-sided self-excitation.",
    traits: ["balanced", "reference"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "normal",
    settings: presetSettings(),
  },
  {
    id: "calm-depth",
    name: "Calm Depth",
    description: "Low market-order rates and high limit-order rates build a deep, tight book.",
    traits: ["stable", "deep book", "tight spread"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 4,
        "market-sell": 4,
        "order-buy": 110,
        "order-sell": 110,
        "cancel-buy": 4,
        "cancel-sell": 4,
      },
      excitementHalfLife: {
        "order-buy": 1.4,
        "order-sell": 1.4,
        "cancel-buy": 0.08,
        "cancel-sell": 0.08,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 0.25, "order-buy": 0.12, "cancel-sell": 0.02 },
        "market-sell": { "market-sell": 0.25, "order-sell": 0.12, "cancel-buy": 0.02 },
        "order-buy": { "order-buy": 0.08, "order-sell": 0.09 },
        "order-sell": { "order-buy": 0.09, "order-sell": 0.08 },
        "cancel-buy": { "cancel-buy": 0.02, "order-buy": 0.08 },
        "cancel-sell": { "cancel-sell": 0.02, "order-sell": 0.08 },
      },
      meanPrice: 0.035,
      priceVariance: 0.012,
      meanSize: 80,
      sizeVariance: 18,
      cancellationCenter: 0.5,
      cancellationVariance: 0.35,
    }),
  },
  {
    id: "thin-book",
    name: "Thin Book",
    description: "Sparse orders and stronger market/cancel excitation make small trades visible.",
    traits: ["illiquid", "wide spread", "jumpy"],
    orderPriceDistribution: "uniform",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "uniform",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 14,
        "market-sell": 14,
        "order-buy": 13,
        "order-sell": 13,
        "cancel-buy": 8,
        "cancel-sell": 8,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 1.4, "cancel-sell": 0.35, "order-buy": 0.06 },
        "market-sell": { "market-sell": 1.4, "cancel-buy": 0.35, "order-sell": 0.06 },
        "cancel-buy": { "cancel-buy": 0.55, "market-sell": 0.12 },
        "cancel-sell": { "cancel-sell": 0.55, "market-buy": 0.12 },
      },
      meanPrice: 0.38,
      priceVariance: 0.18,
      meanSize: 35,
      sizeVariance: 20,
      cancellationCenter: 0.5,
      cancellationVariance: 0.45,
    }),
  },
  {
    id: "bull-momentum",
    name: "Bull Momentum",
    description: "Buy events have higher baseline rates and stronger same-side child events.",
    traits: ["upward bias", "trend", "reflexive"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "normal",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 80,
        "market-sell": 18,
        "order-buy": 65,
        "order-sell": 45,
        "cancel-buy": 8,
        "cancel-sell": 22,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 1.6, "order-buy": 0.45, "cancel-sell": 0.35 },
        "market-sell": { "market-sell": 0.55, "order-sell": 0.12 },
        "order-buy": { "market-buy": 0.18, "order-buy": 0.12 },
        "cancel-sell": { "market-buy": 0.2, "cancel-sell": 0.2 },
      },
      meanPrice: 0.1,
      priceVariance: 0.045,
      meanSize: 115,
      sizeVariance: 35,
      cancellationCenter: 0.35,
      cancellationVariance: 0.22,
    }),
  },
  {
    id: "bear-panic",
    name: "Bear Panic",
    description: "Sell market orders and bid-side cancels cluster into fast downward runs.",
    traits: ["downward bias", "panic", "fragile bids"],
    orderPriceDistribution: "uniform",
    orderSelectionDistribution: "normal",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 12,
        "market-sell": 95,
        "order-buy": 18,
        "order-sell": 70,
        "cancel-buy": 55,
        "cancel-sell": 12,
      },
      excitementHalfLife: {
        "market-sell": 0.35,
        "cancel-buy": 0.18,
        "cancel-sell": 0.08,
      },
      excitationMatrix: {
        "market-sell": { "market-sell": 1.8, "cancel-buy": 0.7, "order-sell": 0.35 },
        "market-buy": { "market-buy": 0.35 },
        "order-sell": { "market-sell": 0.2, "order-sell": 0.12 },
        "cancel-buy": { "market-sell": 0.55, "cancel-buy": 0.8 },
      },
      meanPrice: 0.18,
      priceVariance: 0.12,
      meanSize: 120,
      sizeVariance: 55,
      cancellationCenter: 0.7,
      cancellationVariance: 0.18,
    }),
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    description: "Market events mainly excite opposite-side market events and book replenishment.",
    traits: ["counter-trend", "oscillation"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 35,
        "market-sell": 35,
        "order-buy": 75,
        "order-sell": 75,
        "cancel-buy": 8,
        "cancel-sell": 8,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 0.12, "market-sell": 1.2, "order-sell": 0.35 },
        "market-sell": { "market-buy": 1.2, "market-sell": 0.12, "order-buy": 0.35 },
        "cancel-buy": { "order-buy": 0.22, "cancel-buy": 0.05 },
        "cancel-sell": { "order-sell": 0.22, "cancel-sell": 0.05 },
      },
      meanPrice: 0.08,
      priceVariance: 0.03,
      meanSize: 90,
      sizeVariance: 24,
      cancellationCenter: 0.5,
      cancellationVariance: 0.3,
    }),
  },
  {
    id: "quote-stuffing",
    name: "Quote Stuffing",
    description: "Order and cancel rates dominate while half-lives stay very short.",
    traits: ["high churn", "cancels", "microstructure noise"],
    orderPriceDistribution: "uniform",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "uniform",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 8,
        "market-sell": 8,
        "order-buy": 120,
        "order-sell": 120,
        "cancel-buy": 85,
        "cancel-sell": 85,
      },
      excitementHalfLife: {
        "order-buy": 0.08,
        "order-sell": 0.08,
        "cancel-buy": 0.04,
        "cancel-sell": 0.04,
      },
      excitationMatrix: {
        "order-buy": { "order-buy": 0.4, "cancel-buy": 0.65, "order-sell": 0.18 },
        "order-sell": { "order-sell": 0.4, "cancel-sell": 0.65, "order-buy": 0.18 },
        "cancel-buy": { "cancel-buy": 0.95, "order-buy": 0.35 },
        "cancel-sell": { "cancel-sell": 0.95, "order-sell": 0.35 },
      },
      meanPrice: 0.05,
      priceVariance: 0.02,
      meanSize: 30,
      sizeVariance: 10,
      cancellationCenter: 0.5,
      cancellationVariance: 0.5,
    }),
  },
  {
    id: "whale-prints",
    name: "Whale Prints",
    description: "Normal event rates with large order-size variance and occasional large prints.",
    traits: ["block trades", "fat sizes"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 25,
        "market-sell": 25,
        "order-buy": 35,
        "order-sell": 35,
        "cancel-buy": 6,
        "cancel-sell": 6,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 0.9, "order-buy": 0.25, "cancel-sell": 0.25 },
        "market-sell": { "market-sell": 0.9, "order-sell": 0.25, "cancel-buy": 0.25 },
      },
      meanPrice: 0.16,
      priceVariance: 0.06,
      meanSize: 180,
      sizeVariance: 120,
      cancellationCenter: 0.5,
      cancellationVariance: 0.35,
    }),
  },
  {
    id: "passive-shelves",
    name: "Passive Shelves",
    description: "High passive flow and large order sizes create heavy visible depth.",
    traits: ["visible depth", "slow cancels"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "normal",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 14,
        "market-sell": 14,
        "order-buy": 115,
        "order-sell": 115,
        "cancel-buy": 7,
        "cancel-sell": 7,
      },
      excitationMatrix: {
        "order-buy": { "order-buy": 0.18, "order-sell": 0.12 },
        "order-sell": { "order-buy": 0.12, "order-sell": 0.18 },
        "cancel-buy": { "order-buy": 0.2 },
        "cancel-sell": { "order-sell": 0.2 },
      },
      meanPrice: 0.12,
      priceVariance: 0.025,
      meanSize: 130,
      sizeVariance: 28,
      cancellationCenter: 0.15,
      cancellationVariance: 0.16,
    }),
  },
  {
    id: "toxic-flow",
    name: "Toxic Flow",
    description: "Market orders strongly excite opposite-side cancels, so liquidity retreats.",
    traits: ["adverse selection", "vanishing liquidity"],
    orderPriceDistribution: "uniform",
    orderSelectionDistribution: "normal",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 45,
        "market-sell": 45,
        "order-buy": 32,
        "order-sell": 32,
        "cancel-buy": 45,
        "cancel-sell": 45,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 1, "cancel-sell": 1.1, "order-buy": 0.08 },
        "market-sell": { "market-sell": 1, "cancel-buy": 1.1, "order-sell": 0.08 },
        "order-buy": { "cancel-buy": 0.35 },
        "order-sell": { "cancel-sell": 0.35 },
        "cancel-buy": { "cancel-buy": 0.7, "market-sell": 0.25 },
        "cancel-sell": { "cancel-sell": 0.7, "market-buy": 0.25 },
      },
      meanPrice: 0.22,
      priceVariance: 0.14,
      meanSize: 105,
      sizeVariance: 45,
      cancellationCenter: 0.75,
      cancellationVariance: 0.2,
    }),
  },
  {
    id: "news-burst",
    name: "News Burst",
    description: "Large market-order baselines and short half-lives create bursts that fade fast.",
    traits: ["bursty", "fast decay", "headline shock"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "normal",
    orderSizeDistribution: "normal",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 100,
        "market-sell": 65,
        "order-buy": 55,
        "order-sell": 45,
        "cancel-buy": 25,
        "cancel-sell": 35,
      },
      excitementHalfLife: {
        "market-buy": 0.08,
        "market-sell": 0.08,
        "order-buy": 0.18,
        "order-sell": 0.18,
        "cancel-buy": 0.06,
        "cancel-sell": 0.06,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 1.65, "market-sell": 0.25, "cancel-sell": 0.55 },
        "market-sell": { "market-buy": 0.25, "market-sell": 1.35, "cancel-buy": 0.55 },
        "cancel-buy": { "cancel-buy": 0.6 },
        "cancel-sell": { "cancel-sell": 0.6 },
      },
      meanPrice: 0.14,
      priceVariance: 0.11,
      meanSize: 140,
      sizeVariance: 70,
      cancellationCenter: 0.55,
      cancellationVariance: 0.26,
    }),
  },
  {
    id: "passive-mirror",
    name: "Passive Mirror",
    description: "Bid and ask limit orders mostly excite each other, keeping the book symmetric.",
    traits: ["symmetric", "passive", "range-bound"],
    orderPriceDistribution: "normal",
    orderSelectionDistribution: "uniform",
    orderSizeDistribution: "uniform",
    settings: presetSettings({
      publicInterest: {
        "market-buy": 6,
        "market-sell": 6,
        "order-buy": 135,
        "order-sell": 135,
        "cancel-buy": 6,
        "cancel-sell": 6,
      },
      excitationMatrix: {
        "market-buy": { "market-buy": 0.18, "order-sell": 0.2 },
        "market-sell": { "market-sell": 0.18, "order-buy": 0.2 },
        "order-buy": { "order-buy": 0.08, "order-sell": 0.32 },
        "order-sell": { "order-buy": 0.32, "order-sell": 0.08 },
        "cancel-buy": { "order-buy": 0.2 },
        "cancel-sell": { "order-sell": 0.2 },
      },
      meanPrice: 0.06,
      priceVariance: 0.02,
      meanSize: 75,
      sizeVariance: 20,
      cancellationCenter: 0.5,
      cancellationVariance: 0.35,
    }),
  },
];

export const MarketPresets: Component<{
  orchestrator: SimulationOrchestrator;
}> = (props) => {
  const [selectedPresetId, setSelectedPresetId] = createSignal("baseline");

  const applyPreset = (preset: MarketPreset): void => {
    props.orchestrator.setMarketModelSettings(preset.settings);
    props.orchestrator.setOrderPriceDistribution(preset.orderPriceDistribution);
    props.orchestrator.setOrderSelectionDistribution(preset.orderSelectionDistribution);
    props.orchestrator.setOrderSizeDistribution(preset.orderSizeDistribution);
    setSelectedPresetId(preset.id);
  };

  return (
    <div class="grid max-h-[36rem] gap-3 overflow-auto pr-1">
      <div class="grid grid-cols-[repeat(auto-fit,minmax(17rem,1fr))] gap-3">
        <For each={marketPresets}>
          {(preset) => {
            const isSelected = () => selectedPresetId() === preset.id;

            return (
              <section
                class="grid gap-3 rounded border border-slate-800 bg-slate-950/80 p-3"
                classList={{ "border-cyan-500 bg-cyan-950/20": isSelected() }}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="grid gap-1">
                    <h3 class="text-sm font-semibold text-slate-100">{preset.name}</h3>
                    <p class="text-[11px] leading-4 text-slate-400">{preset.description}</p>
                  </div>
                  <Button
                    aria-pressed={isSelected()}
                    class="shrink-0 font-mono text-[10px]"
                    size="sm"
                    variant={isSelected() ? "primary" : "secondary"}
                    onClick={() => applyPreset(preset)}
                  >
                    Apply
                  </Button>
                </div>
                <div class="flex flex-wrap gap-1">
                  <For each={preset.traits}>
                    {(trait) => (
                      <span class="rounded border border-slate-700 px-2 py-0.5 text-[10px] text-slate-300">
                        {trait}
                      </span>
                    )}
                  </For>
                </div>
                <dl class="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-slate-400">
                  <dt>Market rate</dt>
                  <dd class="text-right text-slate-200">{sumEvents(preset.settings.publicInterest, "market")}/s</dd>
                  <dt>Order rate</dt>
                  <dd class="text-right text-slate-200">{sumEvents(preset.settings.publicInterest, "order")}/s</dd>
                  <dt>Cancel rate</dt>
                  <dd class="text-right text-slate-200">{sumEvents(preset.settings.publicInterest, "cancel")}/s</dd>
                  <dt>Spread mean</dt>
                  <dd class="text-right text-slate-200">{Math.round(preset.settings.meanPrice * 100)}%</dd>
                  <dt>Price dist.</dt>
                  <dd class="text-right text-slate-200">{preset.orderPriceDistribution}</dd>
                  <dt>Size dist.</dt>
                  <dd class="text-right text-slate-200">{preset.orderSizeDistribution}</dd>
                  <dt>Cancel dist.</dt>
                  <dd class="text-right text-slate-200">{preset.orderSelectionDistribution}</dd>
                </dl>
              </section>
            );
          }}
        </For>
      </div>
    </div>
  );
};
