import clsx from "clsx";
import { For } from "solid-js";
import { buttonVariants } from "./Button";

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
    <div
      class={clsx(
        "inline-flex h-9 items-center gap-1 rounded border border-border bg-surface-primary p-1",
        props.class,
      )}
      role="tablist"
    >
      <For each={props.tabs}>
        {(tab) => {
          const isActive = () => props.value === tab.value;

          return (
            <button
              aria-selected={isActive()}
              class={clsx(
                "font-body-primary-sm-semi h-7 appearance-none rounded border-0 px-3 transition",
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
