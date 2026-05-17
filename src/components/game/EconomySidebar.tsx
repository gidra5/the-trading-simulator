import { createEffect, createSignal } from "solid-js";
import { ProgressionFrontierPicker } from "../ProgressionFrontierPicker";
import { ProgressionTierList } from "../ProgressionTierList";
import { actor, settings } from "../../routes/game/state";
import type { ProgressionTierNodeData } from "../../progression/interface";
import { sampleUniformInteger } from "../../distributions";

export const EconomySidebar = () => {
  const samplePickerNode = (): ProgressionTierNodeData => {
    const idx = sampleUniformInteger(0, actor.progression.frontier().length);
    const node = actor.progression.frontier()[idx];
    return { node, ...actor.progression.graph[node] };
  };
  const samplePickerNodes = (): ProgressionTierNodeData[] => {
    if (actor.progression.frontier().length === 0) return [];
    if (actor.progression.frontier().length <= settings.frontierPickerSize())
      return actor.progression.frontier().map((node) => ({ node, ...actor.progression.graph[node] }));

    const nodes: ProgressionTierNodeData[] = [];
    while (nodes.length < settings.frontierPickerSize()) {
      const node = samplePickerNode();
      if (!nodes.some((nodeData) => nodeData.node === node.node)) nodes.push(node);
    }
    return nodes;
  };
  const [pickerNodes, setPickerNodes] = createSignal(samplePickerNodes());
  createEffect(() => {
    setPickerNodes(samplePickerNodes());
  });

  return (
    <div class="flex flex-col gap-6 p-4 border-border border-solid border-l border-y-0 border-r-0 h-full">
      <ProgressionFrontierPicker
        metrics={actor.progression.metrics()}
        resources={actor.progression.resources()}
        frontierNodes={pickerNodes()}
        onShuffle={() => setPickerNodes(samplePickerNodes())}
        onComplete={(node) => actor.progression.advanceFrontier(node)}
        onRefresh={(idx) =>
          setPickerNodes((current) => {
            if (actor.progression.frontier().length <= settings.frontierPickerSize()) return current;
            const next = [...current];
            const node = (() => {
              while (true) {
                const node = samplePickerNode();
                if (!next.some((nodeData) => nodeData.node === node.node)) return node;
              }
            })();
            next[idx] = node;
            return next;
          })
        }
      />
      <ProgressionTierList
        metrics={actor.progression.metrics()}
        resources={actor.progression.resources()}
        tierList={actor.progression.tierList()}
        isComplete={(node) => actor.progression.isComplete(node)}
        onComplete={(node) => actor.progression.advanceFrontier(node)}
      />
    </div>
  );
};
