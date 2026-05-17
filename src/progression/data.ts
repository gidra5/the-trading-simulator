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

export enum ProgressionResource {
  Capital = "Capital",
}

export type ProgressionGraph = Record<ProgressionNode, ProgressionNodeData>;
export type ProgressionPrice = Partial<Record<ProgressionResource, number>>;
export type ProgressionMilestone = Partial<Record<ProgressionMetric, number>>;
export type ProgressionMetrics = Record<ProgressionMetric, number>;
export type ProgressionResources = Record<ProgressionResource, number>;

export type ProgressionNodeData = {
  requirements: ProgressionNode[];
  milestones: ProgressionMilestone;
  prices: ProgressionPrice;
};

export const progressionGraph: ProgressionGraph = {
  [ProgressionNode.Handwork]: {
    requirements: [],
    milestones: {},
    prices: { [ProgressionResource.Capital]: 5 },
  },

  [ProgressionNode.HandworkProficiency]: {
    requirements: [ProgressionNode.Handwork],
    milestones: { [ProgressionMetric.Handwork]: 50 },
    prices: { [ProgressionResource.Capital]: 10 },
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
    prices: { [ProgressionResource.Capital]: 20 },
  },

  [ProgressionNode.TradingLeverage]: {
    requirements: [ProgressionNode.TradingAdvanced],
    milestones: { [ProgressionMetric.Handwork]: 500 },
    prices: { [ProgressionResource.Capital]: 30 },
  },
};
