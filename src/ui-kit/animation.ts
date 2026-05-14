import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";

type AnimationState = "open" | "closing";

type AnimatedPresenceOptions = {
  exitDurationMs: number;
  open: Accessor<boolean>;
};

export const createAnimatedPresence = (options: AnimatedPresenceOptions) => {
  let closeAnimationTimeout: ReturnType<typeof setTimeout> | undefined;
  const [state, setState] = createSignal<AnimationState>("open");
  const [isRendered, setIsRendered] = createSignal(options.open());

  createEffect(() => {
    if (closeAnimationTimeout) {
      clearTimeout(closeAnimationTimeout);
      closeAnimationTimeout = undefined;
    }

    if (options.open()) {
      setState("open");
      setIsRendered(true);
      return;
    }

    if (!isRendered()) return;

    setState("closing");
    closeAnimationTimeout = setTimeout(() => {
      setState("open");
      setIsRendered(false);
      closeAnimationTimeout = undefined;
    }, options.exitDurationMs);
  });

  onCleanup(() => {
    if (closeAnimationTimeout) clearTimeout(closeAnimationTimeout);
  });

  return { isRendered, state };
};
