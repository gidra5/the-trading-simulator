import clsx from "clsx";
import { Show, splitProps, type Component, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import { createAnimatedPresence } from "./animation";

type DialogProps = {
  children: JSX.Element;
  class?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

export const Dialog: Component<DialogProps> = (props) => {
  const [local, dialogProps] = splitProps(props, ["children", "class", "onOpenChange", "open"]);
  const presence = createAnimatedPresence({
    exitDurationMs: 140,
    open: () => local.open,
  });

  return (
    <Show when={presence.isRendered()}>
      <Portal>
        <div
          class="fixed inset-0 z-50 flex items-center justify-center bg-black-high/70 p-4"
          data-dialog-backdrop
          data-dialog-state={presence.state()}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              local.onOpenChange(false);
            }
          }}
        >
          <div
            {...dialogProps}
            aria-modal="true"
            class={clsx(
              "overflow-auto rounded-lg border border-solid border-border bg-surface-primary p-4 text-text-primary shadow-xl",
              local.class,
            )}
            data-dialog-content
            data-dialog-state={presence.state()}
            role="dialog"
          >
            {local.children}
          </div>
        </div>
      </Portal>
    </Show>
  );
};
