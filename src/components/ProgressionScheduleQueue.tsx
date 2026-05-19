import { For, Show, type Component } from "solid-js";
import { ArrowDown, ArrowUp, ListEnd, ListStart, X } from "lucide-solid";
import { t } from "../i18n/game";
import type { ProgressionNode as ProgressionNodeType } from "../progression/data";
import { Button } from "../ui-kit/Button";

type ProgressionScheduleQueueProps = {
  nodes: ProgressionNodeType[];
  onMoveNode: (node: ProgressionNodeType, offset: -1 | 1) => void;
  onRemoveNode: (node: ProgressionNodeType) => void;
  onScheduleFirst: (node: ProgressionNodeType) => void;
  onScheduleLast: (node: ProgressionNodeType) => void;
};

export const ProgressionScheduleQueue: Component<ProgressionScheduleQueueProps> = (props) => {
  return (
    <section class="flex flex-col gap-4">
      <div class="flex flex-col">
        <span class="font-title-primary-base-rg text-text-primary">{t("progression.scheduleQueue.title")}</span>
        <span class="font-body-primary-sm-rg text-text-secondary">{t("progression.scheduleQueue.description")}</span>
      </div>

      <Show
        when={props.nodes.length > 0}
        fallback={
          <div class="rounded-md bg-surface-secondary p-3 font-body-primary-xs-rg text-text-secondary">
            {t("progression.scheduleQueue.empty")}
          </div>
        }
      >
        {/* todo: drag n drop */}
        <div class="flex flex-col gap-2">
          <For each={props.nodes}>
            {(node, index) => {
              const nodeTitle = () => t(`progression.node.title.${node}`);

              return (
                <div class="flex min-h-10 items-center gap-2 rounded-md bg-surface-secondary p-2">
                  <span class="min-w-0 flex-1 truncate font-title-primary-xs-rg text-text-primary">{nodeTitle()}</span>
                  <div class="flex shrink-0 flex-row gap-1">
                    <Button
                      aria-label={t("progression.scheduleQueue.moveFirst", { node: nodeTitle() })}
                      onClick={() => props.onScheduleFirst(node)}
                      size="sm"
                      title={t("progression.scheduleQueue.moveFirst", { node: nodeTitle() })}
                      variant="icon"
                    >
                      <ListStart aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={t("progression.scheduleQueue.moveLast", { node: nodeTitle() })}
                      onClick={() => props.onScheduleLast(node)}
                      size="sm"
                      title={t("progression.scheduleQueue.moveLast", { node: nodeTitle() })}
                      variant="icon"
                    >
                      <ListEnd aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={t("progression.scheduleQueue.moveUp", { node: nodeTitle() })}
                      disabled={index() === 0}
                      onClick={() => props.onMoveNode(node, -1)}
                      size="sm"
                      title={t("progression.scheduleQueue.moveUp", { node: nodeTitle() })}
                      variant="icon"
                    >
                      <ArrowUp aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={t("progression.scheduleQueue.moveDown", { node: nodeTitle() })}
                      disabled={index() === props.nodes.length - 1}
                      onClick={() => props.onMoveNode(node, 1)}
                      size="sm"
                      title={t("progression.scheduleQueue.moveDown", { node: nodeTitle() })}
                      variant="icon"
                    >
                      <ArrowDown aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                    </Button>
                    <Button
                      aria-label={t("progression.scheduleQueue.remove", { node: nodeTitle() })}
                      onClick={() => props.onRemoveNode(node)}
                      size="sm"
                      title={t("progression.scheduleQueue.remove", { node: nodeTitle() })}
                      variant="icon"
                    >
                      <X aria-hidden="true" class="h-4 w-4" strokeWidth={1.8} />
                    </Button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </section>
  );
};
