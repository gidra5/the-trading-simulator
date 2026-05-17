import { batch, createSignal } from "solid-js";
import { ProgressionMetric, ProgressionNode, ProgressionResource, type ProgressionGraph } from "./data";
import { assert } from "../utils";

// nodes that have all their progression node requirements fulfilled
export type ProgressionFrontierNode = ProgressionNode;
export type ProgressionFrontier = Array<ProgressionFrontierNode>;

// todo: inventory instead of pure resources
export type Progression = {
  frontier: ProgressionFrontier;
  metrics: Record<ProgressionMetric, number>;
  resources: Record<ProgressionResource, number>;
};

// complete - the node is already completed
// available - the node is available for completion
// accessible - the node is at the frontier but cant be completed yet
// inaccessible - the node is completely outside of the frontier
type ProgressionNodeStatus = "complete" | "available" | "accessible" | "inaccessible";

const getInitialProgression = (graph: ProgressionGraph): Progression => {
  const frontier = Object.keys(graph).filter((node) => {
    const graphNode = graph[node as keyof ProgressionGraph];
    return graphNode.requirements.length === 0;
  }) as ProgressionNode[];
  return {
    frontier,
    metrics: { [ProgressionMetric.Handwork]: 0 },
    resources: { [ProgressionResource.Capital]: 0 },
  };
};

export const createProgression = (graph: ProgressionGraph) => {
  const [progression, setProgression] = createSignal<Progression>(getInitialProgression(graph));
  const frontier = () => progression().frontier;
  const nodes = Object.keys(graph) as ProgressionFrontierNode[];
  const metrics = Object.keys(progression().metrics) as ProgressionMetric[];
  const resources = Object.keys(progression().resources) as ProgressionResource[];

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
    return progression().metrics[metric] >= value;
  };

  const isAffordable = (resource: ProgressionResource, price: number) => {
    return progression().resources[resource] >= price;
  };

  const advanceFrontier = (node: ProgressionFrontierNode) => {
    assert(isAvailable(node));

    const nextFrontier = frontier().filter((frontierNode) => frontierNode !== node);
    const accessibleNodes = nodes.filter((_node) => graph[_node as ProgressionNode].requirements.includes(node));
    nextFrontier.push(...accessibleNodes);

    batch(() => {
      const prices = graph[node].prices;
      for (const resource of resources) removeResource(resource, prices[resource] ?? 0);

      setProgression((prev) => ({
        ...prev,
        frontier: nextFrontier,
      }));
    });
  };

  const isAvailable = (node: ProgressionFrontierNode) => {
    if (!isAtFrontier(node)) return false;

    const graphNode = graph[node];
    assert(graphNode.requirements.every(isComplete));

    const areMilestonesReached = metrics.every((metric) =>
      isMilestoneReached(metric, graphNode.milestones[metric] ?? 0),
    );
    const arePricesAffordable = resources.every((resource) => isAffordable(resource, graphNode.prices[resource] ?? 0));

    return areMilestonesReached && arePricesAffordable;
  };

  const addMetric = (metric: ProgressionMetric, value: number) => {
    setProgression((prev) => ({
      ...prev,
      metrics: { ...prev.metrics, [metric]: value },
    }));
  };

  const addResource = (resource: ProgressionResource, value: number) => {
    setProgression((prev) => ({
      ...prev,
      resources: { ...prev.resources, [resource]: value },
    }));
  };

  const removeResource = (resource: ProgressionResource, value: number) => {
    setProgression((prev) => ({
      ...prev,
      resources: { ...prev.resources, [resource]: prev.resources[resource] - value },
    }));
  };

  return {
    progression,
    addMetric,
    addResource,
    removeResource,

    advanceFrontier,
    getStatus,
  };
};
