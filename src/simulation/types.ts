import type { OrderSide } from "../market/index";
import { positiveFiniteOrZero } from "../utils";

export type OrderSizeDistribution = "uniform" | "log-normal" | "power-law" | "exponential";
export type OrderPriceDistribution = "uniform" | "abs-normal" | "log-normal" | "power-law" | "exponential";

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
export type SimulationEventSettingGroup = "excitementHalfLife" | "branchingRatio";
export type MarketEventSetting = SimulationEventType;

export type MarketBehaviorSettings = {
  publicInterestRate: number;
  patience: number;
  greed: number;
  fear: number;
  excitementHalfLife: SimulationEventVector;
  branchingRatio: SimulationEventVector;
  reflexivity: number;
  contrarianism: number;
  passiveMirroring: number;
  liquidityChasing: number;
  liquidityFading: number;
  adverseSelection: number;
  orderCrowding: number;
  passiveAdverseSelection: number;
  cancelCrowding: number;
  bookRebalancing: number;
  cancelPanic: number;
  orderSpread: number;
  orderPriceTail: number;
  inSpreadOrderProbability: number;
  orderSizeScale: number;
  orderSizeTail: number;
  anchorPreference: number;
  liquidityWallAnchorPreference: number;
  liquidityWallAnchorRange: number;
  liquidityWallHistogramResolution: number;
  roundPricePreference: number;
  roundPriceAnchorMinMidDistance: number;
  cancellationPriceMovementWindow: number;
  cancellationNearTouchDistance: number;
  cancellationPriceMovementBoost: number;
  cancellationPriceMovementOrderDecay: number;
  cancellationLocalVolumeWindow: number;
  cancellationFarOrderWindow: number;
  cancellationFarOrderRamp: number;
  cancellationFarOrderMinAge: number;
};

export type RestingOrder = {
  id: number;
  side: OrderSide;
  price: number;
  size: number;
  createdAt: number;
};

export type PricePoint = {
  time: number;
  price: number;
};

export type PriceAnchorWindow = {
  durationMs: number;
  highTimes: number[];
  highPrices: number[];
  lowTimes: number[];
  lowPrices: number[];
  highOffset: number;
  lowOffset: number;
};

export const eventVector = (vector: SimulationEventVector): number[] =>
  simulationEventTypes.map((eventType) => vector[eventType]);

export const eventExcitationMatrix = (matrix: SimulationExcitationMatrix): number[][] =>
  simulationEventTypes.map((eventType) => eventVector(matrix[eventType]));

export const normalizeExcitationMatrix = (
  rawMatrix: number[][],
  decay: number[],
  targetBranchingRatio: number[],
): number[][] =>
  rawMatrix.map((row, sourceIndex) => {
    const rawBranchingRatio = row.reduce((total, excitation, targetIndex) => {
      const targetDecay = positiveFiniteOrZero(decay[targetIndex] ?? 0);

      return targetDecay > 0 ? total + positiveFiniteOrZero(excitation) / targetDecay : total;
    }, 0);
    const targetRatio = positiveFiniteOrZero(targetBranchingRatio[sourceIndex] ?? 0);
    const scale = rawBranchingRatio > 0 ? targetRatio / rawBranchingRatio : 0;

    return row.map((excitation) => positiveFiniteOrZero(excitation) * scale);
  });

export const defaultMarketBehaviorSettings: MarketBehaviorSettings = {
  publicInterestRate: 200, // total event rate per second before self-excitation
  patience: 0.9, // probability of placing an order instead of canceling
  greed: 0.3, // market order prob
  fear: 0.5, // sell order prob
  excitementHalfLife: {
    "market-buy": 0.2,
    "market-sell": 0.2,
    "order-buy": 1,
    "order-sell": 1,
    "cancel-buy": 0.05,
    "cancel-sell": 0.05,
  }, // seconds until extra interest halves
  branchingRatio: {
    "market-buy": 1,
    "market-sell": 1,
    "order-buy": 0.15,
    "order-sell": 0.15,
    "cancel-buy": 0.25,
    "cancel-sell": 0.25,
  }, // expected total child events caused by one event
  reflexivity: 1, // same event excites same event
  contrarianism: 0.12, // buy excites sell, sell excites buy
  passiveMirroring: 0.2, // limit buy excites limit sell, and vice versa
  liquidityChasing: 0.25, // market events excite same-side limit orders
  liquidityFading: 0.15, // market events excite same-side cancels
  adverseSelection: 0.1, // market buys pull asks, market sells pull bids
  orderCrowding: 0.3, // limit orders excite same-side limit orders
  passiveAdverseSelection: 0.05, // limit orders can make same-side liquidity pull back
  cancelCrowding: 0.8, // cancels excite same-side cancels
  bookRebalancing: 0.1, // cancels excite opposite-side limit orders
  cancelPanic: 0.05, // cancels can trigger opposite-side market pressure
  orderSpread: 0.15, // mean maker price distance percent
  orderPriceTail: 0.1, // distance dispersion: higher = more tiny and far orders
  inSpreadOrderProbability: 0.5,
  orderSizeScale: 100, // mean order size
  orderSizeTail: 0.8, // size dispersion: higher = more tiny and huge orders
  anchorPreference: 0.35,
  liquidityWallAnchorPreference: 0.2,
  liquidityWallAnchorRange: 0.001,
  liquidityWallHistogramResolution: 64,
  roundPricePreference: 0.45,
  roundPriceAnchorMinMidDistance: 0.005,
  cancellationPriceMovementWindow: 5_000,
  cancellationNearTouchDistance: 0.005,
  cancellationPriceMovementBoost: 4,
  cancellationPriceMovementOrderDecay: 5_000,
  cancellationLocalVolumeWindow: 0.001,
  cancellationFarOrderWindow: 0.15,
  cancellationFarOrderRamp: 0.15,
  cancellationFarOrderMinAge: 60_000,
};

export const cloneMarketBehaviorSettings = (settings: MarketBehaviorSettings): MarketBehaviorSettings => ({
  ...settings,
  excitementHalfLife: { ...settings.excitementHalfLife },
  branchingRatio: { ...settings.branchingRatio },
});
