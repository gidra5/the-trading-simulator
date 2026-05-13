import clsx from "clsx";
import { Check } from "lucide-solid";
import type { Component } from "solid-js";

type ToggleFieldProps = {
  checked: boolean;
  class?: string;
  label: string;
  onChange: (checked: boolean) => void;
};

export const ToggleField: Component<ToggleFieldProps> = (props) => (
  <label
    class={clsx(
      "font-body-primary-sm-rg group flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-surface-primary px-3 py-2 text-text-primary",
      props.class,
    )}
  >
    <span>{props.label}</span>
    <input
      checked={props.checked}
      class="sr-only"
      type="checkbox"
      onInput={(event) => props.onChange(event.currentTarget.checked)}
    />
    <span
      aria-hidden="true"
      class={clsx(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-solid transition",
        props.checked
          ? "border-accent-primary bg-accent-primary text-surface-primary group-hover:opacity-90"
          : "border-border bg-surface-body group-hover:border-accent-secondary group-hover:bg-surface-secondary",
      )}
    >
      <Check class={clsx("h-3 w-3 transition-opacity", props.checked ? "opacity-100" : "opacity-0")} strokeWidth={3} />
    </span>
  </label>
);
