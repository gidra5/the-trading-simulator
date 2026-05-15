enum ProgressionNode {
  Handwork,
  // Craft,
  // Mine,
  // Build,
  // Transport,

  Management,
  Hiring,
  // PrivateCompany,
  // PublicCompany,

  // Science,
  // Physics,
  // Chemistry,
  // ComputerScience,
  // Economy,
  // Logistics,
  // Mathematics,

  // Investing,
  // Dividents,
  // CapitalGains, // ??
  // VentureCapital, // ??
  // PrivateEquity, // ??
  // HedgeFunds, // ??

  // Engineering,
  // Electronics,
  // SoftwareEngineering,
  // Robotics,
  // ArtificialIntelligence,
  // Automotive,
  // Aerospace,
  // PowerGeneration,

  Trading,
  // TradingExecutionStrategies,
  // TradingRiskManagement,

  TradingAdvanced,
  TradingLeverage,
  // TradingFutures,
  // TradingOptions,

  // TradingAutomation,
  // TradingGridBots,
  // TradingDCA, // Dollar-Cost Averaging
  // TradingArbitrage,
}

enum ProgressionRequirement {
  Handwork,
  Calculate,
  Craft,
  Mine,
  Build,
  Transport,

  ManagementWork,
  Hiring,

  ScienceWork,
  Research,

  InvestmentWork,
  Capital,

  EngineeringWork,
  Analyze,
  Design,

  TradingWork,
  Growth,
  Profit,
  Trades,

  ProgressionNode,

  And,
  Or,
  Not,
}

// todo: proper data structure for combinators, milestones, progression, etc.
type ProgressionRequirementData = {
  requirement: ProgressionRequirement;
  value: number;
};

type ProgressionNodeData = {
  title: string;
  description: string;
  requirements: ProgressionRequirementData[];
};

type ProgressionFrontier = Array<{ node: ProgressionNode; generation: number }>;

type ProgressionData = {
  frontier: ProgressionFrontier;
  trades: number;
  profit: number;
  growth: number;
  // todo: more data required for the progression check
};

// decide if a particular node before, after, or at the frontier
// if it is after, then its not yet reached, 1
// if it is before, then its already completed, -1
// if it is at the frontier, then its in progress, 0
const compareNodeWithFrontier = (node: ProgressionNodeData, frontier: ProgressionFrontier): number => {
  // todo: total order between nodes and a frontier

  return 0;
};

const isNodeComplete = (node: ProgressionNodeData, progression: ProgressionData): boolean => {
  return compareNodeWithFrontier(node, progression.frontier) < 0;
};

const isNodeAtFrontier = (node: ProgressionNodeData, progression: ProgressionData): boolean => {
  return compareNodeWithFrontier(node, progression.frontier) === 0;
};

const isNodeAccessible = (node: ProgressionNodeData, progression: ProgressionData): boolean => {
  return compareNodeWithFrontier(node, progression.frontier) <= 0;
};

// complete - the node is already completed
// available - the node is available for completion
// accessible - the node is at the frontier but cant be completed yet
// inaccessible - the node is completely outside of the frontier
type ProgressionNodeStatus = "complete" | "available" | "accessible" | "inaccessible";
const getProgressionNodeStatus = (node: ProgressionNodeData, progression: ProgressionData): ProgressionNodeStatus => {
  const comparison = compareNodeWithFrontier(node, progression.frontier);

  if (comparison < 0) return "complete";
  if (comparison > 0) return "inaccessible";
  if (isNodeAvailable(progression, node)) return "available";
  return "accessible";
};

const progressFrontier = (frontier: ProgressionFrontier, node: ProgressionNodeData): ProgressionFrontier => {
  // todo: remove the node from frontier and add its children

  return frontier;
};

const isNodeAvailable = (progression: ProgressionData, node: ProgressionNodeData): boolean => {
  if (!isNodeAtFrontier(node, progression)) return false;
  // todo: check if all the requirement of the node are fulfilled based on the progression data
  return false;
};
