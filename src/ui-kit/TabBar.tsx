import clsx from "clsx";
import { For } from "solid-js";
import { buttonSizes, buttonVariants } from "./Button";

export type TabOption<Value extends string> = {
  label: string;
  value: Value;
};

type TabBarProps<Value extends string> = {
  class?: string;
  onChange: (value: Value) => void;
  tabs: readonly TabOption<Value>[];
  value: Value;
};

export function TabBar<Value extends string>(props: TabBarProps<Value>) {
  return (
    <div class={clsx("inline-flex items-center gap-1", props.class)} role="tablist">
      <For each={props.tabs}>
        {(tab) => {
          const isActive = () => props.value === tab.value;

          return (
            <button
              aria-selected={isActive()}
              class={clsx(
                "inline-flex appearance-none items-center justify-center gap-2 rounded border transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                buttonSizes.md,
                isActive() && buttonVariants.primary,
                !isActive() && buttonVariants.ghost,
              )}
              role="tab"
              type="button"
              onClick={() => props.onChange(tab.value)}
            >
              {tab.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
