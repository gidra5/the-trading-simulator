import { Resource } from "../economy/inventory";

export enum ProgressionNode {
  Handwork = "Handwork",
  HandworkProficiency = "HandworkProficiency",
  Hardworking = "Hardworking",
  Habits = "Habits",

  Trading = "Trading",
  TradingAdvanced = "TradingAdvanced",
  TradingLeverage = "TradingLeverage",
}

export enum ProgressionMetric {
  Handwork = "Handwork",
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
    prices: { [Resource.Money]: 5 },
  },

  [ProgressionNode.HandworkProficiency]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 50 },
    prices: { [Resource.Money]: 10 },
  },

  [ProgressionNode.Hardworking]: {
    requirements: [],
    milestones: { [ProgressionMetric.Handwork]: 50 },
    prices: {},
  },

  [ProgressionNode.Habits]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 50 },
    prices: {},
  },

  [ProgressionNode.Trading]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 50 },
    prices: {},
  },

  [ProgressionNode.TradingAdvanced]: {
    requirements: [ProgressionNode.Trading],
    milestones: {},
    prices: { [Resource.Money]: 20 },
  },

  [ProgressionNode.TradingLeverage]: {
    requirements: [ProgressionNode.TradingAdvanced],
    milestones: { [ProgressionMetric.Handwork]: 500 },
    prices: { [Resource.Money]: 30 },
  },
};
