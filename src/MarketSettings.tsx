import { For, createSignal, type Component } from "solid-js";
import {
  type MarketBehaviorSettings,
  type MarketEventSetting,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
  type SimulationEventSettingGroup,
  type TradingSimulation,
} from "./simulation";

type ScalarMarketBehaviorSetting = Exclude<keyof MarketBehaviorSettings, "excitementHalfLife" | "branchingRatio">;
type MarketNumberField = {
  key: ScalarMarketBehaviorSetting;
  label: string;
  min?: number;
  max?: number;
  step: string;
};

const orderPriceDistributions: {
  value: OrderPriceDistribution;
  label: string;
}[] = [
  { value: "uniform", label: "Uniform" },
  { value: "abs-normal", label: "Abs normal" },
  { value: "log-normal", label: "Log normal" },
  { value: "power-law", label: "Power law" },
  { value: "exponential", label: "Exponential" },
];
const orderSizeDistributions: {
  value: OrderSizeDistribution;
  label: string;
}[] = [
  { value: "uniform", label: "Uniform" },
  { value: "log-normal", label: "Log normal" },
  { value: "power-law", label: "Power law" },
  { value: "exponential", label: "Exponential" },
];
const eventSettingTypes = [
  "market-buy",
  "market-sell",
  "order-buy",
  "order-sell",
  "cancel-buy",
  "cancel-sell",
] as const satisfies readonly MarketEventSetting[];
const coreMarketFields: MarketNumberField[] = [
  { key: "publicInterestRate", label: "Public interest / s", min: 0, step: "1" },
  { key: "patience", label: "Patience", min: 0, max: 1, step: "0.01" },
  { key: "greed", label: "Greed", min: 0, max: 1, step: "0.01" },
  { key: "fear", label: "Fear", min: 0, max: 1, step: "0.01" },
];
const excitationFields: MarketNumberField[] = [
  { key: "reflexivity", label: "Reflexivity", min: 0, step: "0.01" },
  { key: "contrarianism", label: "Contrarianism", min: 0, step: "0.01" },
  { key: "passiveMirroring", label: "Passive mirroring", min: 0, step: "0.01" },
  { key: "liquidityChasing", label: "Liquidity chasing", min: 0, step: "0.01" },
  { key: "liquidityFading", label: "Liquidity fading", min: 0, step: "0.01" },
  { key: "adverseSelection", label: "Adverse selection", min: 0, step: "0.01" },
  { key: "orderCrowding", label: "Order crowding", min: 0, step: "0.01" },
  { key: "passiveAdverseSelection", label: "Passive adverse selection", min: 0, step: "0.01" },
  { key: "cancelCrowding", label: "Cancel crowding", min: 0, step: "0.01" },
  { key: "bookRebalancing", label: "Book rebalancing", min: 0, step: "0.01" },
  { key: "cancelPanic", label: "Cancel panic", min: 0, step: "0.01" },
];
const orderBehaviorFields: MarketNumberField[] = [
  { key: "orderSpread", label: "Order spread", min: 0, step: "0.001" },
  { key: "orderPriceTail", label: "Order price tail", min: 0, step: "0.01" },
  { key: "inSpreadOrderProbability", label: "In-spread probability", min: 0, max: 1, step: "0.01" },
  { key: "orderSizeScale", label: "Order size scale", min: 0, step: "1" },
  { key: "orderSizeTail", label: "Order size tail", min: 0, step: "0.01" },
  { key: "anchorPreference", label: "High/low anchor", min: 0, max: 1, step: "0.01" },
  { key: "liquidityWallAnchorPreference", label: "Wall anchor", min: 0, max: 1, step: "0.01" },
  { key: "liquidityWallAnchorRange", label: "Wall anchor range", min: 0, step: "0.0001" },
  { key: "liquidityWallHistogramResolution", label: "Wall histogram bins", min: 1, step: "1" },
  { key: "roundPricePreference", label: "Round price anchor", min: 0, max: 1, step: "0.01" },
  { key: "roundPriceAnchorMinMidDistance", label: "Round skip near mid", min: 0, step: "0.001" },
];
const cancellationFields: MarketNumberField[] = [
  { key: "cancellationPriceMovementWindow", label: "Move window, ms", min: 0, step: "100" },
  { key: "cancellationNearTouchDistance", label: "Near touch distance", min: 0, step: "0.001" },
  { key: "cancellationPriceMovementBoost", label: "Move boost", min: 0, step: "0.1" },
  { key: "cancellationPriceMovementOrderDecay", label: "Move decay, ms", min: 0, step: "100" },
  { key: "cancellationLocalVolumeWindow", label: "Local volume window", min: 0, step: "0.001" },
  { key: "cancellationFarOrderWindow", label: "Far order window", min: 0, step: "0.01" },
  { key: "cancellationFarOrderRamp", label: "Far order ramp", min: 0, step: "0.01" },
  { key: "cancellationFarOrderMinAge", label: "Far min age, ms", min: 0, step: "1000" },
];

export const MarketSettings: Component<{
  simulation: TradingSimulation;
}> = (props) => {
  const [marketSettings, setMarketSettings] = createSignal(props.simulation.getMarketBehaviorSettings());
  const [selectedOrderPriceDistribution, setSelectedOrderPriceDistribution] =
    createSignal<OrderPriceDistribution>(props.simulation.getOrderPriceDistribution());
  const [selectedOrderSizeDistribution, setSelectedOrderSizeDistribution] =
    createSignal<OrderSizeDistribution>(props.simulation.getOrderSizeDistribution());

  const updateOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
    setSelectedOrderPriceDistribution(distribution);
    props.simulation.setOrderPriceDistribution(distribution);
  };

  const updateOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
    setSelectedOrderSizeDistribution(distribution);
    props.simulation.setOrderSizeDistribution(distribution);
  };

  const updateMarketSetting = (key: ScalarMarketBehaviorSetting, value: string): void => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setMarketSettings((current) => ({ ...current, [key]: nextValue }));
    props.simulation.setMarketBehaviorSetting(key, nextValue);
  };

  const updateEventSetting = (
    group: SimulationEventSettingGroup,
    eventType: MarketEventSetting,
    value: string,
  ): void => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setMarketSettings((current) => ({
      ...current,
      [group]: { ...current[group], [eventType]: nextValue },
    }));
    props.simulation.setMarketBehaviorEventSetting(group, eventType, nextValue);
  };

  const NumberInput: Component<{
    field: MarketNumberField;
  }> = (props) => (
    <label class="grid grid-cols-[minmax(9rem,1fr)_5.5rem] items-center gap-2 text-slate-200">
      <span>{props.field.label}</span>
      <input
        class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
        type="number"
        min={props.field.min}
        max={props.field.max}
        step={props.field.step}
        value={marketSettings()[props.field.key]}
        onInput={(event) => updateMarketSetting(props.field.key, event.currentTarget.value)}
      />
    </label>
  );

  const FieldGroup: Component<{
    title: string;
    fields: MarketNumberField[];
  }> = (props) => (
    <div class="min-w-[16rem] flex-1">
      <p class="mb-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">{props.title}</p>
      <div class="grid gap-2">
        <For each={props.fields}>{(field) => <NumberInput field={field} />}</For>
      </div>
    </div>
  );

  return (
    <div class="grid max-h-[36rem] gap-4 overflow-auto pr-1">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div class="flex items-center gap-2 text-slate-200">
          <span>Order size</span>
          <div class="flex overflow-hidden rounded border border-slate-700">
            <For each={orderSizeDistributions}>
              {(distribution) => (
                <button
                  class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                  classList={{
                    "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950":
                      selectedOrderSizeDistribution() === distribution.value,
                  }}
                  type="button"
                  onClick={() => updateOrderSizeDistribution(distribution.value)}
                >
                  {distribution.label}
                </button>
              )}
            </For>
          </div>
        </div>
        <div class="flex items-center gap-2 text-slate-200">
          <span>Order price</span>
          <div class="flex overflow-hidden rounded border border-slate-700">
            <For each={orderPriceDistributions}>
              {(distribution) => (
                <button
                  class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                  classList={{
                    "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950":
                      selectedOrderPriceDistribution() === distribution.value,
                  }}
                  type="button"
                  onClick={() => updateOrderPriceDistribution(distribution.value)}
                >
                  {distribution.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-5">
        <FieldGroup title="Flow" fields={coreMarketFields} />
        <FieldGroup title="Excitation" fields={excitationFields} />
        <FieldGroup title="Orders" fields={orderBehaviorFields} />
        <FieldGroup title="Cancellations" fields={cancellationFields} />
      </div>
      <div class="grid gap-3">
        <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Event Half-Life, s</p>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
          <For each={eventSettingTypes}>
            {(eventType) => (
              <label class="grid gap-1 text-slate-200">
                <span>{eventType}</span>
                <input
                  class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
                  type="number"
                  min="0"
                  step="0.01"
                  value={marketSettings().excitementHalfLife[eventType]}
                  onInput={(event) => updateEventSetting("excitementHalfLife", eventType, event.currentTarget.value)}
                />
              </label>
            )}
          </For>
        </div>
        <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Branching Ratio</p>
        <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
          <For each={eventSettingTypes}>
            {(eventType) => (
              <label class="grid gap-1 text-slate-200">
                <span>{eventType}</span>
                <input
                  class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
                  type="number"
                  min="0"
                  step="0.01"
                  value={marketSettings().branchingRatio[eventType]}
                  onInput={(event) => updateEventSetting("branchingRatio", eventType, event.currentTarget.value)}
                />
              </label>
            )}
          </For>
        </div>
      </div>
    </div>
  );
};
