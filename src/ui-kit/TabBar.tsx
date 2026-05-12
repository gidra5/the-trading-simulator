import clsx from "clsx";
import { For } from "solid-js";

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
                "body-sm-semi h-7 appearance-none rounded border-0 px-3 transition",
                isActive()
                  ? "bg-accent-primary text-surface-primary hover:bg-accent-primary hover:text-surface-primary"
                  : "bg-transparent text-text-secondary hover:bg-surface-secondary hover:text-text-primary",
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
