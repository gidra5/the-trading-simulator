import { For, createEffect, createSignal, type Component } from "solid-js";
import {
  type MarketEventSetting,
  type MarketModelSettings,
  type OrderPriceDistribution,
  type OrderSelectionDistribution,
  type OrderSizeDistribution,
  type SimulationEventSettingGroup,
} from "../simulation/index";

type ScalarMarketModelSetting = Exclude<
  keyof MarketModelSettings,
  "excitementHalfLife" | "excitationMatrix" | "publicInterest"
>;
export type MarketSettingsController = {
  getMarketModelSettings: () => MarketModelSettings;
  getOrderPriceDistribution: () => OrderPriceDistribution;
  getOrderSelectionDistribution: () => OrderSelectionDistribution;
  getOrderSizeDistribution: () => OrderSizeDistribution;
  setMarketModelEventSetting: (
    group: SimulationEventSettingGroup,
    eventType: MarketEventSetting,
    value: number,
  ) => void;
  setMarketModelExcitation: (source: MarketEventSetting, target: MarketEventSetting, value: number) => void;
  setMarketModelSetting: (key: ScalarMarketModelSetting, value: number) => void;
  setOrderPriceDistribution: (distribution: OrderPriceDistribution) => void;
  setOrderSelectionDistribution: (distribution: OrderSelectionDistribution) => void;
  setOrderSizeDistribution: (distribution: OrderSizeDistribution) => void;
};
type MarketNumberField = {
  key: ScalarMarketModelSetting;
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
  { value: "normal", label: "Normal" },
];
const orderSizeDistributions: {
  value: OrderSizeDistribution;
  label: string;
}[] = [
  { value: "uniform", label: "Uniform" },
  { value: "normal", label: "Normal" },
];
const orderSelectionDistributions: {
  value: OrderSelectionDistribution;
  label: string;
}[] = [
  { value: "uniform", label: "Uniform" },
  { value: "normal", label: "Normal" },
];
const eventSettingTypes = [
  "market-buy",
  "market-sell",
  "order-buy",
  "order-sell",
  "cancel-buy",
  "cancel-sell",
] as const satisfies readonly MarketEventSetting[];
const orderBehaviorFields: MarketNumberField[] = [
  { key: "meanPrice", label: "Price distance mean", min: 0, step: "0.001" },
  { key: "priceVariance", label: "Price distance std dev", min: 0, step: "0.001" },
  { key: "meanSize", label: "Order size mean", min: 0, step: "1" },
  { key: "sizeVariance", label: "Order size std dev", min: 0, step: "1" },
];
const cancellationFields: MarketNumberField[] = [
  { key: "cancellationCenter", label: "Selection center", min: 0, max: 1, step: "0.01" },
  { key: "cancellationVariance", label: "Selection std dev", min: 0, step: "0.01" },
];

export const MarketSettings: Component<{
  controller: MarketSettingsController;
}> = (props) => {
  const [marketSettings, setMarketSettings] = createSignal(props.controller.getMarketModelSettings());
  const [selectedOrderPriceDistribution, setSelectedOrderPriceDistribution] = createSignal<OrderPriceDistribution>(
    props.controller.getOrderPriceDistribution(),
  );
  const [selectedOrderSizeDistribution, setSelectedOrderSizeDistribution] = createSignal<OrderSizeDistribution>(
    props.controller.getOrderSizeDistribution(),
  );
  const [selectedOrderSelectionDistribution, setSelectedOrderSelectionDistribution] =
    createSignal<OrderSelectionDistribution>(props.controller.getOrderSelectionDistribution());

  createEffect(() => {
    setMarketSettings(props.controller.getMarketModelSettings());
    setSelectedOrderPriceDistribution(props.controller.getOrderPriceDistribution());
    setSelectedOrderSizeDistribution(props.controller.getOrderSizeDistribution());
    setSelectedOrderSelectionDistribution(props.controller.getOrderSelectionDistribution());
  });

  const updateOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
    setSelectedOrderPriceDistribution(distribution);
    props.controller.setOrderPriceDistribution(distribution);
  };

  const updateOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
    setSelectedOrderSizeDistribution(distribution);
    props.controller.setOrderSizeDistribution(distribution);
  };

  const updateOrderSelectionDistribution = (distribution: OrderSelectionDistribution): void => {
    setSelectedOrderSelectionDistribution(distribution);
    props.controller.setOrderSelectionDistribution(distribution);
  };

  const updateMarketSetting = (key: ScalarMarketModelSetting, value: string): void => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setMarketSettings((current) => ({ ...current, [key]: nextValue }));
    props.controller.setMarketModelSetting(key, nextValue);
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
    props.controller.setMarketModelEventSetting(group, eventType, nextValue);
  };

  const updateExcitationSetting = (source: MarketEventSetting, target: MarketEventSetting, value: string): void => {
    const nextValue = Number(value);
    if (!Number.isFinite(nextValue)) return;

    setMarketSettings((current) => ({
      ...current,
      excitationMatrix: {
        ...current.excitationMatrix,
        [source]: { ...current.excitationMatrix[source], [target]: nextValue },
      },
    }));
    props.controller.setMarketModelExcitation(source, target, nextValue);
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

  const EventVectorGroup: Component<{
    group: SimulationEventSettingGroup;
    step: string;
    title: string;
  }> = (props) => (
    <div class="grid gap-3">
      <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">{props.title}</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-2">
        <For each={eventSettingTypes}>
          {(eventType) => (
            <label class="grid gap-1 text-slate-200">
              <span>{eventType}</span>
              <input
                class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
                type="number"
                min="0"
                step={props.step}
                value={marketSettings()[props.group][eventType]}
                onInput={(event) => updateEventSetting(props.group, eventType, event.currentTarget.value)}
              />
            </label>
          )}
        </For>
      </div>
    </div>
  );

  const ExcitationMatrix: Component = () => (
    <div class="grid gap-3 overflow-auto">
      <p class="text-[10px] uppercase tracking-[0.18em] text-slate-500">Excitation Matrix</p>
      <div class="grid min-w-[44rem] grid-cols-[7rem_repeat(6,5.5rem)] gap-1">
        <span />
        <For each={eventSettingTypes}>
          {(target) => <span class="text-center text-[10px] text-slate-500">{target}</span>}
        </For>
        <For each={eventSettingTypes}>
          {(source) => (
            <>
              <span class="self-center text-slate-300">{source}</span>
              <For each={eventSettingTypes}>
                {(target) => (
                  <input
                    class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-right text-slate-100 outline-none transition focus:border-cyan-400"
                    type="number"
                    min="0"
                    step="0.001"
                    value={marketSettings().excitationMatrix[source][target]}
                    onInput={(event) => updateExcitationSetting(source, target, event.currentTarget.value)}
                  />
                )}
              </For>
            </>
          )}
        </For>
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
        <div class="flex items-center gap-2 text-slate-200">
          <span>Cancel order</span>
          <div class="flex overflow-hidden rounded border border-slate-700">
            <For each={orderSelectionDistributions}>
              {(distribution) => (
                <button
                  class="border-l border-slate-700 px-2 py-1 text-slate-300 transition first:border-l-0 hover:bg-slate-800 hover:text-slate-100"
                  classList={{
                    "bg-cyan-500 text-slate-950 hover:bg-cyan-400 hover:text-slate-950":
                      selectedOrderSelectionDistribution() === distribution.value,
                  }}
                  type="button"
                  onClick={() => updateOrderSelectionDistribution(distribution.value)}
                >
                  {distribution.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
      <div class="flex flex-wrap gap-5">
        <FieldGroup title="Orders" fields={orderBehaviorFields} />
        <FieldGroup title="Cancellations" fields={cancellationFields} />
      </div>
      <EventVectorGroup group="publicInterest" step="1" title="Public Interest, events/s" />
      <EventVectorGroup group="excitementHalfLife" step="0.01" title="Event Half-Life, s" />
      <ExcitationMatrix />
    </div>
  );
};
