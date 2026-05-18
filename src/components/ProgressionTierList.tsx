import { For, Show, type Component } from "solid-js";
import { t } from "../i18n/game";
import type {
  ProgressionMetrics,
  ProgressionNode as ProgressionNodeType,
  ProgressionResources,
} from "../progression/data";
import type { ProgressionTierList as ProgressionTierListType } from "../progression/interface";
import { ProgressionNode } from "./ProgressionNode";
import { Collapse } from "../ui-kit/Collapse";

type ProgressionTierListProps = {
  metrics: ProgressionMetrics;
  resources: ProgressionResources;
  tierList: ProgressionTierListType;
  isComplete: (node: ProgressionNodeType) => boolean;
  onComplete: (node: ProgressionNodeType) => void;
};

export const ProgressionTierList: Component<ProgressionTierListProps> = (props) => {
  return (
    <div class="flex flex-col gap-4">
      <div class="flex flex-row justify-between gap-1">
        <div class="flex flex-col">
          <span class="font-title-primary-base-rg text-text-primary">{t(`progression.tierList.title`)}</span>
          <span class="font-body-primary-sm-rg text-text-secondary">{t(`progression.tierList.description`)}</span>
        </div>
      </div>

      <Show when={props.tierList.length > 0}>
        <div class="flex flex-col gap-2">
          <For each={props.tierList}>
            {(tier, index) => (
              <Collapse title={t(`progression.tier`, { tier: index() })} open={index() === props.tierList.length - 1}>
                <div class="flex flex-col gap-2">
                  <For each={tier}>
                    {(node) => (
                      <div class="flex flex-row gap-1">
                        <ProgressionNode
                          node={node.node}
                          metrics={props.metrics}
                          resources={props.resources}
                          milestones={node.milestones}
                          prices={node.prices}
                          isComplete={props.isComplete(node.node)}
                          onComplete={() => props.onComplete(node.node)}
                        />
                      </div>
                    )}
                  </For>
                </div>
              </Collapse>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
