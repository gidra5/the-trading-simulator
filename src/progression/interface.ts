import { batch, createMemo, createSignal } from "solid-js";
import {
  ProgressionMetric,
  ProgressionNode,
  ProgressionResource,
  type ProgressionGraph,
  type ProgressionMetrics,
  type ProgressionNodeData,
  type ProgressionResources,
} from "./data";
import { assert } from "../utils";

// nodes that have all their progression node requirements fulfilled
export type ProgressionFrontierNode = ProgressionNode;
export type ProgressionFrontier = Array<ProgressionFrontierNode>;

// todo: inventory instead of pure resources
export type Progression = {
  frontier: ProgressionFrontier;
  metrics: ProgressionMetrics;
  resources: ProgressionResources;
};

// complete - the node is already completed
// available - the node is available for completion
// accessible - the node is at the frontier but cant be completed yet
// inaccessible - the node is completely outside of the frontier
type ProgressionNodeStatus = "complete" | "available" | "accessible" | "inaccessible";

export type ProgressionTierNodeData = { node: ProgressionNode } & ProgressionNodeData;
type ProgressionTier = ProgressionTierNodeData[];
export type ProgressionTierList = ProgressionTier[];

const getInitialFrontier = (graph: ProgressionGraph): ProgressionFrontier => {
  return Object.keys(graph).filter((node) => {
    const graphNode = graph[node as keyof ProgressionGraph];
    return graphNode.requirements.length === 0;
  }) as ProgressionNode[];
};

const getInitialProgression = (graph: ProgressionGraph): Progression => {
  return {
    frontier: getInitialFrontier(graph),
    metrics: { [ProgressionMetric.Handwork]: 0 },
    resources: { [ProgressionResource.Capital]: 0 },
  };
};

export const createProgression = (graph: ProgressionGraph) => {
  const [frontier, setFrontier] = createSignal<ProgressionFrontier>(getInitialFrontier(graph));
  const [metrics, setMetrics] = createSignal<ProgressionMetrics>({ [ProgressionMetric.Handwork]: 0 });
  const [resources, setResources] = createSignal<ProgressionResources>({ [ProgressionResource.Capital]: 0 });

  const nodes = Object.keys(graph) as ProgressionFrontierNode[];
  const _metrics = Object.keys(metrics()) as ProgressionMetric[];
  const _resources = Object.keys(resources()) as ProgressionResource[];

  const compareNodeWithFrontier = (node: ProgressionFrontierNode, currentFrontier: ProgressionFrontier): number => {
    if (currentFrontier.includes(node)) return 0;
    if (graph[node].requirements.every((requiredNode) => compareNodeWithFrontier(requiredNode, currentFrontier) < 0)) {
      return -1;
    }
    return 1;
  };

  const isAtFrontier = (node: ProgressionFrontierNode) => frontier().includes(node);
  const compareWithFrontier = (node: ProgressionFrontierNode): number => compareNodeWithFrontier(node, frontier());
  const isComplete = (node: ProgressionFrontierNode) => compareWithFrontier(node) < 0;

  const getStatus = (node: ProgressionFrontierNode): ProgressionNodeStatus => {
    const comparison = compareWithFrontier(node);

    if (comparison < 0) return "complete";
    if (comparison > 0) return "inaccessible";
    if (isAvailable(node)) return "available";
    return "accessible";
  };

  const isMilestoneReached = (metric: ProgressionMetric, value: number) => {
    return metrics()[metric] >= value;
  };

  const isAffordable = (resource: ProgressionResource, price: number) => {
    return resources()[resource] >= price;
  };

  const advanceFrontier = (node: ProgressionFrontierNode) => {
    assert(isAvailable(node));

    const nextFrontier = frontier().filter((frontierNode) => frontierNode !== node);
    const accessibleNodes = nodes.filter((_node) => graph[_node as ProgressionNode].requirements.includes(node));
    nextFrontier.push(...accessibleNodes);

    batch(() => {
      const prices = graph[node].prices;
      for (const resource of _resources) removeResource(resource, prices[resource] ?? 0);

      setFrontier(nextFrontier);
    });
  };

  const isAvailable = (node: ProgressionFrontierNode) => {
    if (!isAtFrontier(node)) return false;

    const graphNode = graph[node];
    assert(graphNode.requirements.every(isComplete));

    const areMilestonesReached = _metrics.every((metric) =>
      isMilestoneReached(metric, graphNode.milestones[metric] ?? 0),
    );
    const arePricesAffordable = _resources.every((resource) => isAffordable(resource, graphNode.prices[resource] ?? 0));

    return areMilestonesReached && arePricesAffordable;
  };

  const addMetric = (metric: ProgressionMetric, value: number) => {
    setMetrics((current) => ({ ...current, [metric]: value }));
  };

  const addResource = (resource: ProgressionResource, value: number) => {
    setResources((current) => ({ ...current, [resource]: value }));
  };

  const removeResource = (resource: ProgressionResource, value: number) => {
    setResources((current) => ({ ...current, [resource]: current[resource] - value }));
  };

  const tierListState = createMemo<{ list: ProgressionTierList; frontier: ProgressionFrontier }>(
    (state) => {
      const tiers = state.list;
      const delta = frontier().filter((node) => !state.frontier.includes(node));
      if (delta.length === 0) return state;

      for (const node of delta) {
        const requirements = graph[node].requirements;
        const tier = tiers.findLastIndex((tier) => tier.some((node) => requirements.includes(node.node)));
        const nodeTier = tiers[tier + 1] ?? [];
        tiers[tier + 1] = [...nodeTier, { node, ...graph[node] }];
      }

      return { list: tiers, frontier: frontier() };
    },
    { list: [[]], frontier: [] },
    { equals: false },
  );
  const tierList = () => tierListState().list;

  return {
    graph,

    frontier,
    metrics,
    resources,
    addMetric,
    addResource,
    removeResource,

    tierList,
    advanceFrontier,
    getStatus,
    isComplete,
  };
};
