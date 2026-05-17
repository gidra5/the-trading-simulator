import { For, Show, type Component } from "solid-js";
import { t } from "../i18n/game";
import type {
  ProgressionMetric,
  ProgressionMetrics,
  ProgressionMilestone,
  ProgressionNode as ProgressionNodeType,
  ProgressionPrice,
  ProgressionResource,
  ProgressionResources,
} from "../progression/data";
import { Check, RotateCcw, X } from "lucide-solid";
import { Button } from "../ui-kit/Button";

type ProgressionNodeProps = {
  node: ProgressionNodeType;
  metrics: ProgressionMetrics;
  resources: ProgressionResources;
  milestones: ProgressionMilestone;
  prices: ProgressionPrice;
  onRefresh?: () => void;
  onComplete?: () => void;
};

export const ProgressionNode: Component<ProgressionNodeProps> = (props) => {
  const milestones = () => Object.keys(props.milestones) as ProgressionMetric[];
  const resources = () => Object.keys(props.prices) as ProgressionResource[];
  const available = () =>
    milestones().every((metric) => props.metrics[metric] >= props.milestones[metric]!) &&
    resources().every((resource) => props.resources[resource] >= props.prices[resource]!);
  return (
    <div class="p-2 w-full rounded-md flex flex-col gap-4 bg-surface-secondary">
      <div class="flex flex-col gap-1">
        <div class="flex flex-row justify-between gap-2">
          <span class="font-title-primary-xs-rg text-text-primary">{t(`progression.node.title.${props.node}`)}</span>

          <div class="flex flex-row gap-1">
            <Show when={props.onRefresh}>
              <Button variant="icon" onClick={props.onRefresh} size="sm">
                <RotateCcw aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
              </Button>
            </Show>
            <Show when={props.onComplete}>
              <Button variant="icon" onClick={props.onComplete} size="sm" disabled={!available()}>
                <Check aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
              </Button>
            </Show>
          </div>
        </div>
        <span class="font-body-primary-xs-rg text-text-secondary">
          {t(`progression.node.description.${props.node}`)}
        </span>
      </div>

      <Show when={milestones().length > 0}>
        <div class="flex flex-col gap-1 font-body-secondary-xs-light text-text-secondary">
          <span class="font-body-primary-sm-rg text-text-primary">{t(`progression.milestone.title`)}</span>
          <For each={milestones()}>
            {(metric) => (
              <div class="flex flex-row gap-1 items-center">
                <Show when={props.metrics[metric] >= props.milestones[metric]!}>
                  <Check aria-hidden="true" class="h-4 w-4 text-success" strokeWidth={1.8} />
                </Show>
                <Show when={props.metrics[metric] < props.milestones[metric]!}>
                  <X aria-hidden="true" class="h-4 w-4 text-danger" strokeWidth={1.8} />
                </Show>
                <span>
                  {t(`progression.metric.${metric}`, {
                    total: props.milestones[metric]!,
                    value: props.metrics[metric],
                  })}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={resources().length > 0}>
        <div class="flex flex-col gap-1 font-body-secondary-xs-light text-text-secondary">
          <span class="font-body-primary-sm-rg text-text-primary">{t(`progression.price.title`)}</span>
          <For each={resources()}>
            {(resource) => (
              <div class="flex flex-row gap-1 items-center">
                <Show when={props.resources[resource] >= props.prices[resource]!}>
                  <Check aria-hidden="true" class="h-4 w-4 text-success" strokeWidth={1.8} />
                </Show>
                <Show when={props.resources[resource] < props.prices[resource]!}>
                  <X aria-hidden="true" class="h-4 w-4 text-danger" strokeWidth={1.8} />
                </Show>
                <span>
                  {t(`progression.resource.${resource}`, {
                    total: props.prices[resource]!,
                    value: props.resources[resource],
                  })}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};
