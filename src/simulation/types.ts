import type { OrderSide } from "../market/index";

export type OrderSizeDistribution = "uniform" | "normal";
export type OrderPriceDistribution = "uniform" | "normal";
export type OrderSelectionDistribution = "uniform" | "normal";

export const simulationTickTime = 200;

export const simulationEventTypes = [
  "market-buy",
  "market-sell",
  "order-buy",
  "order-sell",
  "cancel-buy",
  "cancel-sell",
] as const;
export type SimulationEventType = (typeof simulationEventTypes)[number];
export type SimulationEventVector = Record<SimulationEventType, number>;
export type SimulationExcitationMatrix = Record<SimulationEventType, SimulationEventVector>;
export type SimulationEventSettingGroup = "excitementHalfLife" | "publicInterest";
export type MarketEventSetting = SimulationEventType;

export type MarketModelSettings = {
  publicInterest: SimulationEventVector;
  excitementHalfLife: SimulationEventVector;
  excitationMatrix: SimulationExcitationMatrix;

  meanPrice: number;
  priceVariance: number;
  meanSize: number;
  sizeVariance: number;
  cancellationCenter: number;
  cancellationVariance: number;
  capitalFlow: number;
  spreadHalfRateSize: number;
  spreadMaxFraction: number;
  spreadMeanDistance: number;
};

export type RestingOrder = {
  id: number;
  side: OrderSide;
  price: number;
  size: number;
  createdAt: number;
};

export const eventVector = (vector: SimulationEventVector): number[] =>
  simulationEventTypes.map((eventType) => vector[eventType]);

export const eventExcitationMatrix = (matrix: SimulationExcitationMatrix): number[][] =>
  simulationEventTypes.map((eventType) => eventVector(matrix[eventType]));

export const defaultMarketModelSettings: MarketModelSettings = {
  publicInterest: {
    "market-buy": 5,
    "market-sell": 5,
    "order-buy": 50,
    "order-sell": 50,
    "cancel-buy": 2,
    "cancel-sell": 2,
  }, // event rates per second before self-excitation
  excitementHalfLife: {
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 1,
    "order-sell": 1,
    "cancel-buy": 0.0,
    "cancel-sell": 0.0,
  }, // seconds until extra interest halves
  excitationMatrix: {
    "market-buy": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    "market-sell": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    "order-buy": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    "order-sell": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    "cancel-buy": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
    "cancel-sell": {
      "market-buy": 0,
      "market-sell": 0,
      "order-buy": 0,
      "order-sell": 0,
      "cancel-buy": 0,
      "cancel-sell": 0,
    },
  }, // target event rate added by each source event
  meanPrice: 0.0, // mean maker price distance from touch
  priceVariance: 0.1, // price distance standard deviation
  meanSize: 100, // mean order size
  sizeVariance: 40, // order size standard deviation
  cancellationCenter: 0.5, // normalized sorted-order index
  cancellationVariance: 0.25,
  capitalFlow: 0,
  spreadHalfRateSize: 0.01,
  spreadMaxFraction: 1,
  spreadMeanDistance: 1,
};

const cloneExcitationMatrix = (matrix: SimulationExcitationMatrix): SimulationExcitationMatrix => ({
  "market-buy": { ...matrix["market-buy"] },
  "market-sell": { ...matrix["market-sell"] },
  "order-buy": { ...matrix["order-buy"] },
  "order-sell": { ...matrix["order-sell"] },
  "cancel-buy": { ...matrix["cancel-buy"] },
  "cancel-sell": { ...matrix["cancel-sell"] },
});

export const cloneMarketModelSettings = (settings: MarketModelSettings): MarketModelSettings => ({
  ...settings,
  publicInterest: { ...defaultMarketModelSettings.publicInterest, ...settings.publicInterest },
  excitementHalfLife: { ...defaultMarketModelSettings.excitementHalfLife, ...settings.excitementHalfLife },
  excitationMatrix: cloneExcitationMatrix(settings.excitationMatrix ?? defaultMarketModelSettings.excitationMatrix),
  capitalFlow: settings.capitalFlow ?? defaultMarketModelSettings.capitalFlow,
  spreadHalfRateSize: settings.spreadHalfRateSize ?? defaultMarketModelSettings.spreadHalfRateSize,
  spreadMaxFraction: settings.spreadMaxFraction ?? defaultMarketModelSettings.spreadMaxFraction,
  spreadMeanDistance: settings.spreadMeanDistance ?? defaultMarketModelSettings.spreadMeanDistance,
});
