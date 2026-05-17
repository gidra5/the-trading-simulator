import { For, Show, type Component } from "solid-js";
import { t } from "../i18n/game";
import type {
  ProgressionMetrics,
  ProgressionNode as ProgressionNodeType,
  ProgressionResources,
} from "../progression/data";
import { ProgressionNode } from "./ProgressionNode";
import type { ProgressionTierNodeData } from "../progression/interface";
import { Shuffle } from "lucide-solid";
import { Button } from "../ui-kit/Button";

type ProgressionFrontierPickerProps = {
  metrics: ProgressionMetrics;
  resources: ProgressionResources;
  frontierNodes: ProgressionTierNodeData[];
  onShuffle: () => void;
  onComplete: (node: ProgressionNodeType) => void;
  onRefresh: (index: number) => void;
};

export const ProgressionFrontierPicker: Component<ProgressionFrontierPickerProps> = (props) => {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-row justify-between gap-1">
        <div class="flex flex-col">
          <span class="font-title-primary-base-rg text-text-primary">{t(`progression.frontierPicker.title`)}</span>
          <span class="font-body-primary-sm-rg text-text-secondary">{t(`progression.frontierPicker.description`)}</span>
        </div>
        {/* todo: add tooltips to all icon buttons, unless they already open a popover */}
        <Button variant="icon" onClick={props.onShuffle}>
          <Shuffle aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
        </Button>
      </div>

      <Show when={props.frontierNodes.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={props.frontierNodes}>
            {(node, index) => (
              <ProgressionNode
                node={node.node}
                metrics={props.metrics}
                resources={props.resources}
                milestones={node.milestones}
                prices={node.prices}
                onComplete={() => props.onComplete(node.node)}
                onRefresh={() => props.onRefresh(index())}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
