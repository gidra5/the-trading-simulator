import { Resource } from "../economy/inventory";

export enum ProgressionNode {
  Handwork = "Handwork",
  HandworkProficiency = "HandworkProficiency",
  Hardworking = "Hardworking",
  Habits = "Habits",

  Trading = "Trading",
  Journaling = "Journaling",
  TradingAdvanced = "TradingAdvanced",
  TradingLeverage = "TradingLeverage",
  LiquidationJournaling = "LiquidationJournaling",
}

export enum ProgressionMetric {
  Handwork = "Handwork",
  Trades = "Trades",
  LeveragedTime = "LeveragedTime",
}

export type ProgressionGraph = Record<ProgressionNode, ProgressionNodeData>;
export type ProgressionPrice = Partial<Record<Resource, number>>;
export type ProgressionMilestone = Partial<Record<ProgressionMetric, number>>;
export type ProgressionMetrics = Record<ProgressionMetric, number>;

export type ProgressionNodeData = {
  requirements: ProgressionNode[];
  milestones: ProgressionMilestone;
  prices: ProgressionPrice;
};

export const progressionGraph: ProgressionGraph = {
  [ProgressionNode.Handwork]: {
    requirements: [],
    milestones: {},
    prices: { [Resource.Money]: 2 },
  },

  [ProgressionNode.HandworkProficiency]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 200 },
    prices: { [Resource.Money]: 10 },
  },

  [ProgressionNode.Hardworking]: {
    requirements: [],
    milestones: { [ProgressionMetric.Handwork]: 500 },
    prices: {},
  },

  [ProgressionNode.Habits]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 1000 },
    prices: {},
  },

  [ProgressionNode.Trading]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 100 },
    prices: { [Resource.Money]: 100 },
  },

  [ProgressionNode.Journaling]: {
    requirements: [ProgressionNode.Trading],
    milestones: { [ProgressionMetric.Trades]: 25 },
    prices: { [Resource.Money]: 100 },
  },

  [ProgressionNode.TradingAdvanced]: {
    requirements: [ProgressionNode.Trading],
    milestones: { [ProgressionMetric.Trades]: 100 },
    prices: { [Resource.Money]: 1000 },
  },

  [ProgressionNode.TradingLeverage]: {
    requirements: [ProgressionNode.TradingAdvanced],
    milestones: { [ProgressionMetric.Handwork]: 2000 },
    prices: { [Resource.Money]: 1000 },
  },

  [ProgressionNode.LiquidationJournaling]: {
    requirements: [ProgressionNode.TradingLeverage],
    milestones: { [ProgressionMetric.Trades]: 200, [ProgressionMetric.LeveragedTime]: 5 * 60 * 1000 /* 5 min */ },
    prices: { [Resource.Money]: 2000 },
  },
};
