import { batch, createMemo, createSignal, type Accessor } from "solid-js";
import {
  cloneMarketModelSettings,
  defaultMarketModelSettings,
  eventExcitationMatrix,
  eventVector,
  simulationEventTypes,
  type MarketModelSettings,
  type MarketEventSetting,
  type OrderPriceDistribution,
  type OrderSelectionDistribution,
  type OrderSizeDistribution,
  type SimulationEventVector,
  type SimulationExcitationMatrix,
  type SimulationEventSettingGroup,
} from "./types";
import { clamp, halfLifeToDecay } from "../utils";
import type { Distributions } from "../distributions";
import type { SimulationCapitalState } from "./capital";
import type { SimulationOrderPlacementOptions } from "./orderPlacement";

type ScalarMarketModelSetting = Exclude<
  keyof MarketModelSettings,
  "excitementHalfLife" | "excitationMatrix" | "publicInterest"
>;

export type SimulationOrchestrator = {
  cancellation: {
    sampleOrderIndex: (orderCount: number) => number;
  };
  orderPlacement: Omit<SimulationOrderPlacementOptions, "capital" | "market" | "time">;
  eventStream: {
    applyMarketParameterEvents: (dt: number, capital: SimulationCapitalState) => void;
    excitementDecay: Accessor<number[]>;
    baselineActivity: Accessor<number[]>;
    excitationMatrix: Accessor<number[][]>;
    distributions: Distributions;
  };
};

export type SimulationOrchestratorSnapshot = {
  marketModelSettings: MarketModelSettings;
  marketParameterEffectInstances?: MarketParameterEffectInstance[];
  marketParameterEffects: MarketParameterEffects;
  orderPriceDistribution: OrderPriceDistribution;
  orderSelectionDistribution: OrderSelectionDistribution;
  orderSizeDistribution: OrderSizeDistribution;
};

export type SimulationOrchestratorController = {
  getMarketModelSettings: () => MarketModelSettings;
  getOrderPriceDistribution: Accessor<OrderPriceDistribution>;
  getOrderSelectionDistribution: Accessor<OrderSelectionDistribution>;
  getOrderSizeDistribution: Accessor<OrderSizeDistribution>;
  restore: (snapshot: SimulationOrchestratorSnapshot) => void;
  setMarketModelEventSetting: (
    group: SimulationEventSettingGroup,
    eventType: MarketEventSetting,
    value: number,
  ) => void;
  setMarketModelExcitation: (source: MarketEventSetting, target: MarketEventSetting, value: number) => void;
  setMarketModelSetting: (key: ScalarMarketModelSetting, value: number) => void;
  setMarketModelSettings: (settings: MarketModelSettings) => void;
  setOrderPriceDistribution: (distribution: OrderPriceDistribution) => void;
  setOrderSelectionDistribution: (distribution: OrderSelectionDistribution) => void;
  setOrderSizeDistribution: (distribution: OrderSizeDistribution) => void;
  snapshot: () => SimulationOrchestratorSnapshot;
};

type SimulationOrchestratorOptions = {
  distributions: Distributions;
};

type MarketParameterEffects = MarketModelSettings;

type PartialSimulationExcitationMatrix = Partial<Record<MarketEventSetting, Partial<SimulationEventVector>>>;
type MarketParameterEffectOverrides = Partial<
  Omit<MarketParameterEffects, "excitementHalfLife" | "excitationMatrix" | "publicInterest">
> & {
  excitementHalfLife?: Partial<SimulationEventVector>;
  excitationMatrix?: PartialSimulationExcitationMatrix;
  publicInterest?: Partial<SimulationEventVector>;
};

type MarketParameterEvent = {
  effects: MarketParameterEffects;
  meanHalfLifeMs: number;
  permanentProbability: number;
};

type MarketParameterEffectInstance = {
  effects: MarketParameterEffects;
  halfLifeMs: number | null;
  startsInMs: number;
  capitalFlowApplied: boolean;
};

type MarketParameterScenarioEvent = {
  effects: MarketParameterEffects;
  halfLifeMs: number | null;
  startsInMs: number;
};

type MarketParameterScenario = {
  events: MarketParameterScenarioEvent[];
};

type MarketParameterMode = {
  settings: MarketModelSettings;
};

type MarketParameterTrigger =
  | { kind: "event"; event: MarketParameterEvent }
  | { kind: "mode"; mode: MarketParameterMode }
  | { kind: "scenario"; scenario: MarketParameterScenario };

const zeroEventVector = (): SimulationEventVector => ({
  "market-buy": 0,
  "market-sell": 0,
  "order-buy": 0,
  "order-sell": 0,
  "cancel-buy": 0,
  "cancel-sell": 0,
});

const zeroExcitationMatrix = (): SimulationExcitationMatrix => ({
  "market-buy": zeroEventVector(),
  "market-sell": zeroEventVector(),
  "order-buy": zeroEventVector(),
  "order-sell": zeroEventVector(),
  "cancel-buy": zeroEventVector(),
  "cancel-sell": zeroEventVector(),
});

const defaultMarketParameterEffects: MarketParameterEffects = {
  publicInterest: zeroEventVector(),
  excitementHalfLife: zeroEventVector(),
  excitationMatrix: zeroExcitationMatrix(),
  meanPrice: 0,
  priceVariance: 0,
  meanSize: 0,
  sizeVariance: 0,
  cancellationCenter: 0,
  cancellationVariance: 0,
  capitalFlow: 0,
  spreadHalfRateSize: 0,
  spreadMaxFraction: 0,
  spreadMeanDistance: 0,
};

const marketParameterEventRatePerSecond = 1 / (60 * 5);
const cloneMarketParameterEffects = (effects: MarketParameterEffects): MarketParameterEffects =>
  createMarketParameterEffects(effects);

const cloneMarketParameterEffectInstance = (
  instance: MarketParameterEffectInstance,
): MarketParameterEffectInstance => ({
  effects: cloneMarketParameterEffects(instance.effects),
  halfLifeMs: instance.halfLifeMs,
  startsInMs: instance.startsInMs ?? 0,
  capitalFlowApplied: instance.capitalFlowApplied ?? true,
});

const addEventVector = (left: SimulationEventVector, right: SimulationEventVector): SimulationEventVector => ({
  "market-buy": left["market-buy"] + right["market-buy"],
  "market-sell": left["market-sell"] + right["market-sell"],
  "order-buy": left["order-buy"] + right["order-buy"],
  "order-sell": left["order-sell"] + right["order-sell"],
  "cancel-buy": left["cancel-buy"] + right["cancel-buy"],
  "cancel-sell": left["cancel-sell"] + right["cancel-sell"],
});

const scaleEventVector = (vector: SimulationEventVector, factor: number): SimulationEventVector => ({
  "market-buy": vector["market-buy"] * factor,
  "market-sell": vector["market-sell"] * factor,
  "order-buy": vector["order-buy"] * factor,
  "order-sell": vector["order-sell"] * factor,
  "cancel-buy": vector["cancel-buy"] * factor,
  "cancel-sell": vector["cancel-sell"] * factor,
});

const hasVisibleEventVector = (vector: SimulationEventVector): boolean =>
  simulationEventTypes.some((eventType) => Math.abs(vector[eventType]) > 0.001);

const addExcitationMatrix = (
  left: SimulationExcitationMatrix,
  right: SimulationExcitationMatrix,
): SimulationExcitationMatrix => ({
  "market-buy": addEventVector(left["market-buy"], right["market-buy"]),
  "market-sell": addEventVector(left["market-sell"], right["market-sell"]),
  "order-buy": addEventVector(left["order-buy"], right["order-buy"]),
  "order-sell": addEventVector(left["order-sell"], right["order-sell"]),
  "cancel-buy": addEventVector(left["cancel-buy"], right["cancel-buy"]),
  "cancel-sell": addEventVector(left["cancel-sell"], right["cancel-sell"]),
});

const scaleExcitationMatrix = (matrix: SimulationExcitationMatrix, factor: number): SimulationExcitationMatrix => ({
  "market-buy": scaleEventVector(matrix["market-buy"], factor),
  "market-sell": scaleEventVector(matrix["market-sell"], factor),
  "order-buy": scaleEventVector(matrix["order-buy"], factor),
  "order-sell": scaleEventVector(matrix["order-sell"], factor),
  "cancel-buy": scaleEventVector(matrix["cancel-buy"], factor),
  "cancel-sell": scaleEventVector(matrix["cancel-sell"], factor),
});

const hasVisibleExcitationMatrix = (matrix: SimulationExcitationMatrix): boolean =>
  simulationEventTypes.some((eventType) => hasVisibleEventVector(matrix[eventType]));

const addMarketParameterEffects = (
  left: MarketParameterEffects,
  right: MarketParameterEffects,
): MarketParameterEffects => ({
  publicInterest: addEventVector(left.publicInterest, right.publicInterest),
  excitementHalfLife: addEventVector(left.excitementHalfLife, right.excitementHalfLife),
  excitationMatrix: addExcitationMatrix(left.excitationMatrix, right.excitationMatrix),
  meanPrice: left.meanPrice + right.meanPrice,
  priceVariance: left.priceVariance + right.priceVariance,
  meanSize: left.meanSize + right.meanSize,
  sizeVariance: left.sizeVariance + right.sizeVariance,
  cancellationCenter: left.cancellationCenter + right.cancellationCenter,
  cancellationVariance: left.cancellationVariance + right.cancellationVariance,
  capitalFlow: left.capitalFlow + right.capitalFlow,
  spreadHalfRateSize: left.spreadHalfRateSize + right.spreadHalfRateSize,
  spreadMaxFraction: left.spreadMaxFraction + right.spreadMaxFraction,
  spreadMeanDistance: left.spreadMeanDistance + right.spreadMeanDistance,
});

const scaleMarketParameterEffects = (effects: MarketParameterEffects, factor: number): MarketParameterEffects => ({
  publicInterest: scaleEventVector(effects.publicInterest, factor),
  excitementHalfLife: scaleEventVector(effects.excitementHalfLife, factor),
  excitationMatrix: scaleExcitationMatrix(effects.excitationMatrix, factor),
  meanPrice: effects.meanPrice * factor,
  priceVariance: effects.priceVariance * factor,
  meanSize: effects.meanSize * factor,
  sizeVariance: effects.sizeVariance * factor,
  cancellationCenter: effects.cancellationCenter * factor,
  cancellationVariance: effects.cancellationVariance * factor,
  capitalFlow: effects.capitalFlow * factor,
  spreadHalfRateSize: effects.spreadHalfRateSize * factor,
  spreadMaxFraction: effects.spreadMaxFraction * factor,
  spreadMeanDistance: effects.spreadMeanDistance * factor,
});

const hasVisibleMarketParameterEffect = (effects: MarketParameterEffects): boolean =>
  hasVisibleEventVector(effects.publicInterest) ||
  hasVisibleEventVector(effects.excitementHalfLife) ||
  hasVisibleExcitationMatrix(effects.excitationMatrix) ||
  Math.abs(effects.meanPrice) > 0.001 ||
  Math.abs(effects.priceVariance) > 0.001 ||
  Math.abs(effects.meanSize) > 0.001 ||
  Math.abs(effects.sizeVariance) > 0.001 ||
  Math.abs(effects.cancellationCenter) > 0.001 ||
  Math.abs(effects.cancellationVariance) > 0.001 ||
  Math.abs(effects.capitalFlow) > 0.001 ||
  Math.abs(effects.spreadHalfRateSize) > 0.001 ||
  Math.abs(effects.spreadMaxFraction) > 0.001 ||
  Math.abs(effects.spreadMeanDistance) > 0.001;

const effectFactor = (effect: number): number => Math.exp(effect);

const scaleEventRate = (rate: number, effect: number): number => rate * effectFactor(effect);

const scalePositiveSetting = (value: number, effect: number): number => value * effectFactor(effect);

const applyCapitalFlow = (capital: SimulationCapitalState, effect: number): void => {
  const money = capital.total.Money();
  const stock = capital.total.Stock();

  capital.addTotalCapital({
    Money: money * (Math.exp(effect) - 1),
    Stock: stock * (Math.exp(effect) - 1),
  });
};

const createMarketParameterEffectInstance = (
  effects: MarketParameterEffects,
  halfLifeMs: number | null,
  startsInMs: number,
): MarketParameterEffectInstance => ({
  effects,
  halfLifeMs,
  startsInMs,
  capitalFlowApplied: false,
});

const applyStartedMarketParameterEffect = (
  capital: SimulationCapitalState,
  instance: MarketParameterEffectInstance,
): MarketParameterEffectInstance => {
  if (instance.startsInMs > 0 || instance.capitalFlowApplied) return instance;

  if (instance.effects.capitalFlow !== 0) applyCapitalFlow(capital, instance.effects.capitalFlow);

  return { ...instance, capitalFlowApplied: true };
};

const createMarketParameterEffects = (effects: MarketParameterEffectOverrides): MarketParameterEffects => ({
  ...defaultMarketParameterEffects,
  ...effects,
  publicInterest: { ...defaultMarketParameterEffects.publicInterest, ...effects.publicInterest },
  excitementHalfLife: { ...defaultMarketParameterEffects.excitementHalfLife, ...effects.excitementHalfLife },
  excitationMatrix: {
    "market-buy": {
      ...defaultMarketParameterEffects.excitationMatrix["market-buy"],
      ...effects.excitationMatrix?.["market-buy"],
    },
    "market-sell": {
      ...defaultMarketParameterEffects.excitationMatrix["market-sell"],
      ...effects.excitationMatrix?.["market-sell"],
    },
    "order-buy": {
      ...defaultMarketParameterEffects.excitationMatrix["order-buy"],
      ...effects.excitationMatrix?.["order-buy"],
    },
    "order-sell": {
      ...defaultMarketParameterEffects.excitationMatrix["order-sell"],
      ...effects.excitationMatrix?.["order-sell"],
    },
    "cancel-buy": {
      ...defaultMarketParameterEffects.excitationMatrix["cancel-buy"],
      ...effects.excitationMatrix?.["cancel-buy"],
    },
    "cancel-sell": {
      ...defaultMarketParameterEffects.excitationMatrix["cancel-sell"],
      ...effects.excitationMatrix?.["cancel-sell"],
    },
  },
});

const createMarketModelSettings = (settings: MarketParameterEffectOverrides): MarketModelSettings => {
  const base = cloneMarketModelSettings(defaultMarketModelSettings);

  return cloneMarketModelSettings({
    ...base,
    ...settings,
    publicInterest: { ...base.publicInterest, ...settings.publicInterest },
    excitementHalfLife: { ...base.excitementHalfLife, ...settings.excitementHalfLife },
    excitationMatrix: {
      "market-buy": { ...base.excitationMatrix["market-buy"], ...settings.excitationMatrix?.["market-buy"] },
      "market-sell": { ...base.excitationMatrix["market-sell"], ...settings.excitationMatrix?.["market-sell"] },
      "order-buy": { ...base.excitationMatrix["order-buy"], ...settings.excitationMatrix?.["order-buy"] },
      "order-sell": { ...base.excitationMatrix["order-sell"], ...settings.excitationMatrix?.["order-sell"] },
      "cancel-buy": { ...base.excitationMatrix["cancel-buy"], ...settings.excitationMatrix?.["cancel-buy"] },
      "cancel-sell": { ...base.excitationMatrix["cancel-sell"], ...settings.excitationMatrix?.["cancel-sell"] },
    },
  });
};

const marketParameterMode = (settings: MarketParameterEffectOverrides): MarketParameterMode => ({
  settings: createMarketModelSettings(settings),
});

const marketParameterEvent = (
  effects: MarketParameterEffectOverrides,
  meanHalfLifeMs: number,
  permanentProbability: number,
): MarketParameterEvent => ({
  effects: createMarketParameterEffects(effects),
  meanHalfLifeMs,
  permanentProbability,
});

const scenarioEvent = (
  startsInMs: number,
  halfLifeMs: number | null,
  effects: MarketParameterEffectOverrides,
): MarketParameterScenarioEvent => ({
  effects: createMarketParameterEffects(effects),
  halfLifeMs,
  startsInMs,
});

const marketParameterScenario = (events: MarketParameterScenarioEvent[]): MarketParameterScenario => ({ events });

const diagonalExcitation = (effect: number): PartialSimulationExcitationMatrix => ({
  "market-buy": { "market-buy": effect },
  "market-sell": { "market-sell": effect },
  "order-buy": { "order-buy": effect },
  "order-sell": { "order-sell": effect },
  "cancel-buy": { "cancel-buy": effect },
  "cancel-sell": { "cancel-sell": effect },
});

const marketParameterEvents: MarketParameterEvent[] = [
  marketParameterEvent(
    { publicInterest: { "market-buy": 0.35, "order-buy": 0.35, "market-sell": -0.2, "order-sell": -0.2 } },
    90_000,
    0.08,
  ),
  marketParameterEvent(
    { publicInterest: { "market-buy": -0.2, "order-buy": -0.2, "market-sell": 0.35, "order-sell": 0.35 } },
    90_000,
    0.08,
  ),
  marketParameterEvent({ publicInterest: { "market-buy": 0.45, "market-sell": 0.45 } }, 30_000, 0.01),
  marketParameterEvent({ capitalFlow: 0.08 }, 180_000, 0.2),
  marketParameterEvent({ capitalFlow: -0.08 }, 180_000, 0.2),
  marketParameterEvent({ publicInterest: { "cancel-buy": 0.5, "cancel-sell": 0.5 } }, 20_000, 0.01),
  marketParameterEvent({ publicInterest: { "cancel-buy": -0.25, "cancel-sell": -0.25 } }, 20_000, 0.01),
  marketParameterEvent({ spreadHalfRateSize: -0.35 }, 120_000, 0.12),
  marketParameterEvent({ spreadHalfRateSize: 0.35 }, 120_000, 0.12),
  marketParameterEvent({ spreadMaxFraction: 0.25 }, 120_000, 0.12),
  marketParameterEvent({ spreadMaxFraction: -0.25 }, 120_000, 0.12),
  marketParameterEvent({ spreadMeanDistance: -0.35 }, 120_000, 0.12),
  marketParameterEvent({ spreadMeanDistance: 0.35 }, 120_000, 0.12),
  marketParameterEvent({ excitationMatrix: diagonalExcitation(0.35) }, 45_000, 0.03),
  marketParameterEvent({ excitationMatrix: diagonalExcitation(-0.25) }, 45_000, 0.03),
  marketParameterEvent({ meanPrice: -0.18, priceVariance: -0.12 }, 120_000, 0.08),
  marketParameterEvent({ meanPrice: 0.22, priceVariance: 0.18 }, 120_000, 0.08),
  marketParameterEvent({ meanSize: 0.25, sizeVariance: 0.2 }, 150_000, 0.1),
  marketParameterEvent({ meanSize: -0.2, sizeVariance: -0.15 }, 150_000, 0.1),
  marketParameterEvent({ cancellationCenter: -0.18, cancellationVariance: 0.12 }, 75_000, 0.04),
  marketParameterEvent({ cancellationCenter: 0.18, cancellationVariance: 0.12 }, 75_000, 0.04),
  marketParameterEvent(
    { excitementHalfLife: { "order-buy": 0.4, "order-sell": 0.4, "market-buy": 0.15, "market-sell": 0.15 } },
    90_000,
    0.05,
  ),
  marketParameterEvent(
    { excitementHalfLife: { "order-buy": -0.25, "order-sell": -0.25, "market-buy": -0.1, "market-sell": -0.1 } },
    90_000,
    0.05,
  ),
];

const marketParameterScenarios: MarketParameterScenario[] = [
  marketParameterScenario([
    scenarioEvent(0, 45_000, {
      publicInterest: { "market-buy": 0.55, "market-sell": 0.55 },
      excitationMatrix: diagonalExcitation(0.25),
    }),
    scenarioEvent(30_000, 90_000, {
      publicInterest: { "market-buy": 0.4, "order-buy": 0.4, "market-sell": -0.15, "order-sell": -0.15 },
    }),
    scenarioEvent(90_000, 120_000, { spreadHalfRateSize: -0.25, spreadMeanDistance: -0.2 }),
  ]),
  marketParameterScenario([
    scenarioEvent(0, 60_000, {
      publicInterest: { "market-buy": 0.4, "market-sell": 0.4, "cancel-buy": 0.45, "cancel-sell": 0.45 },
    }),
    scenarioEvent(45_000, 120_000, { spreadMaxFraction: -0.3, spreadMeanDistance: 0.35 }),
    scenarioEvent(120_000, 180_000, {
      capitalFlow: -0.05,
      publicInterest: { "market-sell": 0.25, "order-sell": 0.25 },
    }),
  ]),
  marketParameterScenario([
    scenarioEvent(0, 180_000, { capitalFlow: 0.08 }),
    scenarioEvent(60_000, 240_000, {
      publicInterest: { "market-buy": 0.25, "order-buy": 0.25, "market-sell": 0.25, "order-sell": 0.25 },
      meanSize: 0.18,
    }),
    scenarioEvent(120_000, 180_000, { spreadMaxFraction: 0.2, spreadMeanDistance: -0.25, priceVariance: -0.12 }),
  ]),
  marketParameterScenario([
    scenarioEvent(0, 60_000, {
      publicInterest: { "cancel-buy": -0.2, "cancel-sell": -0.2 },
      spreadHalfRateSize: -0.25,
    }),
    scenarioEvent(45_000, 120_000, { spreadMaxFraction: 0.25, spreadMeanDistance: -0.3 }),
    scenarioEvent(90_000, 90_000, {
      publicInterest: { "market-buy": 0.25, "market-sell": 0.25 },
      excitationMatrix: diagonalExcitation(0.2),
    }),
  ]),
  marketParameterScenario([
    scenarioEvent(0, 90_000, { meanPrice: 0.16, priceVariance: 0.22 }),
    scenarioEvent(45_000, 120_000, { meanSize: -0.18, sizeVariance: 0.25 }),
    scenarioEvent(120_000, 150_000, { cancellationCenter: 0.2, cancellationVariance: 0.18 }),
  ]),
];

const marketParameterModes: MarketParameterMode[] = [
  marketParameterMode({}),
  marketParameterMode({
    publicInterest: {
      "market-buy": 8,
      "market-sell": 8,
      "order-buy": 70,
      "order-sell": 70,
      "cancel-buy": 3,
      "cancel-sell": 3,
    },
    excitementHalfLife: {
      "market-buy": 0.4,
      "market-sell": 0.4,
      "order-buy": 2,
      "order-sell": 2,
      "cancel-buy": 0.5,
      "cancel-sell": 0.5,
    },
    excitationMatrix: diagonalExcitation(0.25),
    meanPrice: 0.04,
    priceVariance: 0.08,
    meanSize: 110,
    sizeVariance: 55,
    cancellationCenter: 0.55,
    cancellationVariance: 0.3,
    spreadHalfRateSize: 0.008,
    spreadMaxFraction: 1,
    spreadMeanDistance: 0.85,
  }),
  marketParameterMode({
    publicInterest: {
      "market-buy": 3,
      "market-sell": 3,
      "order-buy": 85,
      "order-sell": 85,
      "cancel-buy": 1,
      "cancel-sell": 1,
    },
    excitementHalfLife: {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0.8,
      "order-sell": 0.8,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    meanPrice: 0.02,
    priceVariance: 0.04,
    meanSize: 140,
    sizeVariance: 35,
    cancellationCenter: 0.45,
    cancellationVariance: 0.2,
    spreadHalfRateSize: 0.006,
    spreadMaxFraction: 1,
    spreadMeanDistance: 0.65,
  }),
  marketParameterMode({
    publicInterest: {
      "market-buy": 14,
      "market-sell": 14,
      "order-buy": 35,
      "order-sell": 35,
      "cancel-buy": 9,
      "cancel-sell": 9,
    },
    excitementHalfLife: {
      "market-buy": 0.6,
      "market-sell": 0.6,
      "order-buy": 1.5,
      "order-sell": 1.5,
      "cancel-buy": 1,
      "cancel-sell": 1,
    },
    excitationMatrix: diagonalExcitation(0.4),
    meanPrice: 0.18,
    priceVariance: 0.18,
    meanSize: 70,
    sizeVariance: 45,
    cancellationCenter: 0.75,
    cancellationVariance: 0.35,
    spreadHalfRateSize: 0.02,
    spreadMaxFraction: 0.65,
    spreadMeanDistance: 1.6,
  }),
  marketParameterMode({
    publicInterest: {
      "market-buy": 2,
      "market-sell": 2,
      "order-buy": 20,
      "order-sell": 20,
      "cancel-buy": 0.5,
      "cancel-sell": 0.5,
    },
    excitementHalfLife: {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0.5,
      "order-sell": 0.5,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    meanPrice: 0.12,
    priceVariance: 0.08,
    meanSize: 55,
    sizeVariance: 20,
    cancellationCenter: 0.5,
    cancellationVariance: 0.45,
    spreadHalfRateSize: 0.018,
    spreadMaxFraction: 0.45,
    spreadMeanDistance: 1.3,
  }),
];

const marketParameterTriggers: MarketParameterTrigger[] = [
  ...marketParameterEvents.map((event): MarketParameterTrigger => ({ kind: "event", event })),
  ...marketParameterModes.map((mode): MarketParameterTrigger => ({ kind: "mode", mode })),
  ...marketParameterScenarios.map((scenario): MarketParameterTrigger => ({ kind: "scenario", scenario })),
];

const marketParameterEventInstances = (
  event: MarketParameterEvent,
  distributions: Pick<Distributions, "sampleBernoulli" | "sampleExponential">,
): MarketParameterEffectInstance[] => {
  const halfLifeMs = distributions.sampleBernoulli(event.permanentProbability)
    ? null
    : distributions.sampleExponential(event.meanHalfLifeMs);

  return [createMarketParameterEffectInstance(event.effects, halfLifeMs, 0)];
};

const marketParameterScenarioInstances = (
  scenario: MarketParameterScenario,
  elapsedSinceTriggeredMs: number,
): MarketParameterEffectInstance[] =>
  scenario.events.map((event) =>
    createMarketParameterEffectInstance(
      event.effects,
      event.halfLifeMs,
      Math.max(0, event.startsInMs - elapsedSinceTriggeredMs),
    ),
  );

const marketParameterTriggerInstances = (
  trigger: MarketParameterTrigger,
  distributions: Pick<Distributions, "sampleBernoulli" | "sampleExponential">,
  elapsedSinceTriggeredMs: number,
): MarketParameterEffectInstance[] => {
  switch (trigger.kind) {
    case "event":
      return marketParameterEventInstances(trigger.event, distributions);
    case "mode":
      return [];
    case "scenario":
      return marketParameterScenarioInstances(trigger.scenario, elapsedSinceTriggeredMs);
  }
};

export const createOrchestrator = (
  options: SimulationOrchestratorOptions,
): {
  orchestrator: SimulationOrchestrator;
  controller: SimulationOrchestratorController;
} => {
  const { distributions } = options;
  const [modelSettings, setModelSettings] = createSignal(defaultMarketModelSettings);
  const [orderPriceDistribution, setOrderPriceDistribution] = createSignal<OrderPriceDistribution>("normal");
  const [orderSizeDistribution, setOrderSizeDistribution] = createSignal<OrderSizeDistribution>("normal");
  const [orderSelectionDistribution, setOrderSelectionDistribution] =
    createSignal<OrderSelectionDistribution>("uniform");
  const [marketParameterEffectInstances, setMarketParameterEffectInstances] = createSignal<
    MarketParameterEffectInstance[]
  >([]);
  const getMarketModelSettings = (): MarketModelSettings => cloneMarketModelSettings(modelSettings());
  const setMarketModelSettings = (settings: MarketModelSettings): void => {
    setModelSettings(cloneMarketModelSettings(settings));
  };
  const setMarketModelSetting = (key: ScalarMarketModelSetting, value: number): void => {
    setModelSettings((current) => ({ ...current, [key]: value }));
  };
  const setMarketModelEventSetting = (
    group: SimulationEventSettingGroup,
    eventType: MarketEventSetting,
    value: number,
  ): void => {
    setModelSettings((current) => ({
      ...current,
      [group]: { ...current[group], [eventType]: value },
    }));
  };
  const setMarketModelExcitation = (source: MarketEventSetting, target: MarketEventSetting, value: number): void => {
    setModelSettings((current) => ({
      ...current,
      excitationMatrix: {
        ...current.excitationMatrix,
        [source]: { ...current.excitationMatrix[source], [target]: value },
      },
    }));
  };
  const updateOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
    setOrderPriceDistribution(distribution);
  };
  const updateOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
    setOrderSizeDistribution(distribution);
  };
  const updateOrderSelectionDistribution = (distribution: OrderSelectionDistribution): void => {
    setOrderSelectionDistribution(distribution);
  };
  const snapshot = (): SimulationOrchestratorSnapshot => ({
    marketModelSettings: getMarketModelSettings(),
    marketParameterEffectInstances: marketParameterEffectInstances().map(cloneMarketParameterEffectInstance),
    marketParameterEffects: cloneMarketParameterEffects(marketParameterEffects()),
    orderPriceDistribution: orderPriceDistribution(),
    orderSelectionDistribution: orderSelectionDistribution(),
    orderSizeDistribution: orderSizeDistribution(),
  });
  const restore = (snapshot: SimulationOrchestratorSnapshot): void => {
    const marketParameterEffectInstances = snapshot.marketParameterEffectInstances ?? [
      { effects: snapshot.marketParameterEffects, halfLifeMs: null, startsInMs: 0, capitalFlowApplied: true },
    ];

    batch(() => {
      setMarketModelSettings(snapshot.marketModelSettings);
      setMarketParameterEffectInstances(marketParameterEffectInstances.map(cloneMarketParameterEffectInstance));
      setOrderPriceDistribution(snapshot.orderPriceDistribution);
      setOrderSelectionDistribution(snapshot.orderSelectionDistribution);
      setOrderSizeDistribution(snapshot.orderSizeDistribution);
    });
  };

  const marketParameterEffects = createMemo((): MarketParameterEffects => {
    return marketParameterEffectInstances()
      .filter((instance) => instance.startsInMs <= 0)
      .reduce(
        (effects, instance) => addMarketParameterEffects(effects, instance.effects),
        defaultMarketParameterEffects,
      );
  });

  const excitementDecay = createMemo(() => {
    const parameters = modelSettings();
    const effects = marketParameterEffects();

    return eventVector({
      "market-buy": Math.max(0, parameters.excitementHalfLife["market-buy"] + effects.excitementHalfLife["market-buy"]),
      "market-sell": Math.max(
        0,
        parameters.excitementHalfLife["market-sell"] + effects.excitementHalfLife["market-sell"],
      ),
      "order-buy": Math.max(0, parameters.excitementHalfLife["order-buy"] + effects.excitementHalfLife["order-buy"]),
      "order-sell": Math.max(0, parameters.excitementHalfLife["order-sell"] + effects.excitementHalfLife["order-sell"]),
      "cancel-buy": Math.max(0, parameters.excitementHalfLife["cancel-buy"] + effects.excitementHalfLife["cancel-buy"]),
      "cancel-sell": Math.max(
        0,
        parameters.excitementHalfLife["cancel-sell"] + effects.excitementHalfLife["cancel-sell"],
      ),
    }).map(halfLifeToDecay);
  });
  const excitationMatrix = createMemo((): number[][] => {
    const parameters = modelSettings();
    const effects = marketParameterEffects();
    const effectMatrix = eventExcitationMatrix(effects.excitationMatrix);

    return eventExcitationMatrix(parameters.excitationMatrix).map((row, sourceIndex) =>
      row.map((excitation, targetIndex) => Math.max(0, excitation + effectMatrix[sourceIndex]![targetIndex]!)),
    );
  });

  const baselineActivity = createMemo((): number[] => {
    const parameters = modelSettings();
    const effects = marketParameterEffects();

    return eventVector({
      "market-buy": scaleEventRate(parameters.publicInterest["market-buy"], effects.publicInterest["market-buy"]),
      "market-sell": scaleEventRate(parameters.publicInterest["market-sell"], effects.publicInterest["market-sell"]),
      "order-buy": scaleEventRate(parameters.publicInterest["order-buy"], effects.publicInterest["order-buy"]),
      "order-sell": scaleEventRate(parameters.publicInterest["order-sell"], effects.publicInterest["order-sell"]),
      "cancel-buy": scaleEventRate(parameters.publicInterest["cancel-buy"], effects.publicInterest["cancel-buy"]),
      "cancel-sell": scaleEventRate(parameters.publicInterest["cancel-sell"], effects.publicInterest["cancel-sell"]),
    });
  });

  const applyMarketParameterEvents = (dt: number, capital: SimulationCapitalState): void => {
    const eventTimes = distributions.samplePoissonProcessEventTimes(marketParameterEventRatePerSecond, dt);
    let nextModeSettings: MarketModelSettings | null = null;

    setMarketParameterEffectInstances((current) => {
      const next = current
        .map((instance) => {
          const startsInMs = Math.max(0, instance.startsInMs - dt);
          const activeTimeMs = instance.startsInMs <= 0 ? dt : Math.max(0, dt - instance.startsInMs);
          let nextInstance = applyStartedMarketParameterEffect(capital, { ...instance, startsInMs });

          if (nextInstance.halfLifeMs !== null && activeTimeMs > 0) {
            const decay = Math.exp((-Math.LN2 * activeTimeMs) / nextInstance.halfLifeMs);
            nextInstance = { ...nextInstance, effects: scaleMarketParameterEffects(nextInstance.effects, decay) };
          }

          return nextInstance;
        })
        .filter(
          (instance) =>
            instance.startsInMs > 0 ||
            instance.halfLifeMs === null ||
            hasVisibleMarketParameterEffect(instance.effects),
        );

      for (const eventTime of eventTimes) {
        const trigger = marketParameterTriggers[distributions.sampleUniformInteger(0, marketParameterTriggers.length)];
        const elapsedSinceTriggeredMs = dt - eventTime;

        if (trigger.kind === "mode") {
          next.length = 0;
          nextModeSettings = cloneMarketModelSettings(trigger.mode.settings);
          continue;
        }

        for (const instance of marketParameterTriggerInstances(trigger, distributions, elapsedSinceTriggeredMs)) {
          next.push(applyStartedMarketParameterEffect(capital, instance));
        }
      }

      return next;
    });

    if (nextModeSettings !== null) setModelSettings(nextModeSettings);
  };

  const sampleUniformWithStandardDeviation = (mean: number, standardDeviation: number, min: number): number => {
    const halfRange = Math.max(0, standardDeviation) * Math.sqrt(3);
    const low = Math.max(min, mean - halfRange);
    const high = Math.max(low, mean + halfRange);

    return distributions.sampleUniform(low, high);
  };

  const sampleOrderDistance = (): number => {
    const parameters = modelSettings();
    const effects = marketParameterEffects();
    const mean = parameters.meanPrice + effects.meanPrice;
    const standardDeviation = scalePositiveSetting(parameters.priceVariance, effects.priceVariance);

    const distance = (() => {
      switch (orderPriceDistribution()) {
        case "uniform":
          return sampleUniformWithStandardDeviation(mean, standardDeviation, -Infinity);
        case "normal":
          return distributions.sampleNormal(mean, standardDeviation);
      }
    })();
    return Math.max(Number.EPSILON, Math.abs(distance));
  };

  const sampleOrderSize = (): number => {
    const parameters = modelSettings();
    const effects = marketParameterEffects();
    const mean = scalePositiveSetting(parameters.meanSize, effects.meanSize);
    const standardDeviation = scalePositiveSetting(parameters.sizeVariance, effects.sizeVariance);

    switch (orderSizeDistribution()) {
      case "uniform":
        return sampleUniformWithStandardDeviation(mean, standardDeviation, Number.EPSILON);
      case "normal":
        return Math.max(Number.EPSILON, Math.abs(distributions.sampleNormal(mean, standardDeviation)));
    }
  };

  const sampleCancellationOrderIndex = (orderCount: number): number => {
    if (orderCount <= 1) return 0;

    switch (orderSelectionDistribution()) {
      case "uniform":
      case "normal": {
        const parameters = modelSettings();
        const effects = marketParameterEffects();
        const mean = clamp(parameters.cancellationCenter + effects.cancellationCenter, 0, 1) * (orderCount - 1);
        const standardDeviation =
          Math.max(0, scalePositiveSetting(parameters.cancellationVariance, effects.cancellationVariance)) * orderCount;
        const sample =
          orderSelectionDistribution() === "uniform"
            ? sampleUniformWithStandardDeviation(mean, standardDeviation, 0)
            : distributions.sampleNormal(mean, standardDeviation);

        return Math.round(clamp(sample, 0, orderCount - 1));
      }
    }
  };

  const orchestrator: SimulationOrchestrator = {
    cancellation: {
      // todo: price movement - if moved awy from order, increase cancel prob and decrease if moved to the order
      // todo: distance?
      // todo: time
      // todo: queue volume
      sampleOrderIndex: sampleCancellationOrderIndex,
    },
    orderPlacement: {
      // todo: anchoring - min, max in interval(s)
      // todo: anchoring - round anchor,
      // todo: anchoring - liquidity anchors (place right before a wall)
      // todo: near/far distributions.
      distributions,
      inSpread: {
        max: () => {
          const parameters = modelSettings();
          const effects = marketParameterEffects();

          return clamp(scalePositiveSetting(parameters.spreadMaxFraction, effects.spreadMaxFraction), 0, 1);
        },
        halfRateSize: () => {
          const parameters = modelSettings();
          const effects = marketParameterEffects();

          return scalePositiveSetting(parameters.spreadHalfRateSize, effects.spreadHalfRateSize);
        },
        mean: () => {
          const parameters = modelSettings();
          const effects = marketParameterEffects();

          return scalePositiveSetting(parameters.spreadMeanDistance, effects.spreadMeanDistance);
        },
      },
      sampleOrderSize,
      sampleOrderDistance,
    },
    eventStream: {
      applyMarketParameterEvents,
      excitementDecay,
      baselineActivity,
      excitationMatrix,
      distributions,
    },
  };

  const controller: SimulationOrchestratorController = {
    getMarketModelSettings,
    getOrderPriceDistribution: orderPriceDistribution,
    getOrderSelectionDistribution: orderSelectionDistribution,
    getOrderSizeDistribution: orderSizeDistribution,
    restore,
    setMarketModelEventSetting,
    setMarketModelExcitation,
    setMarketModelSetting,
    setMarketModelSettings,
    setOrderPriceDistribution: updateOrderPriceDistribution,
    setOrderSelectionDistribution: updateOrderSelectionDistribution,
    setOrderSizeDistribution: updateOrderSizeDistribution,
    snapshot,
  };

  return { orchestrator, controller };
};
