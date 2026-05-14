import clsx from "clsx";
import { createEffect, onCleanup, Show, type Component, type JSX } from "solid-js";
import { createAnimatedPresence } from "./animation";

type PopoverAlign = "start" | "end";
type PopoverPlacement = "top" | "bottom";

type PopoverProps = {
  align?: PopoverAlign;
  children: JSX.Element;
  class?: string;
  contentClass?: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  openOnHover?: boolean;
  placement?: PopoverPlacement;
  trigger: JSX.Element;
};

export const Popover: Component<PopoverProps> = (props) => {
  let root: HTMLDivElement | undefined;
  const align = () => props.align ?? "end";
  const placement = () => props.placement ?? "bottom";
  const presence = createAnimatedPresence({
    exitDurationMs: 120,
    open: () => props.open,
  });

  const openOnHover = (): boolean => props.openOnHover ?? false;

  createEffect(() => {
    if (!props.open) return;

    const closeOnOutsidePointerDown = (event: PointerEvent): void => {
      if (!root?.contains(event.target as Node)) props.onOpenChange(false);
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") props.onOpenChange(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointerDown);
    document.addEventListener("keydown", closeOnEscape);

    onCleanup(() => {
      document.removeEventListener("pointerdown", closeOnOutsidePointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    });
  });

  return (
    <div
      ref={root}
      class={clsx("relative inline-flex", props.class)}
      onPointerEnter={() => {
        if (openOnHover()) props.onOpenChange(true);
      }}
      onPointerLeave={() => {
        if (openOnHover()) props.onOpenChange(false);
      }}
    >
      {props.trigger}
      <Show when={presence.isRendered()}>
        <div
          class={clsx(
            "absolute z-50 w-72 rounded border border-solid border-border bg-surface-primary p-3 shadow-lg shadow-black/40",
            align() === "start" ? "left-0" : "right-0",
            placement() === "top" ? "bottom-full mb-2" : "top-full mt-2",
            props.contentClass,
          )}
          data-popover-content
          data-popover-placement={placement()}
          data-popover-state={presence.state()}
          role="dialog"
        >
          {props.children}
        </div>
      </Show>
    </div>
  );
};
