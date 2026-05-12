import clsx from "clsx";
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
      "body-primary-sm-rg flex cursor-pointer items-center justify-between gap-3 rounded border border-border bg-surface-primary px-3 py-2",
      props.class,
    )}
  >
    <span>{props.label}</span>
    <input
      checked={props.checked}
      class="h-4 w-4 bg-white-xhigh/90"
      type="checkbox"
      onInput={(event) => props.onChange(event.currentTarget.checked)}
    />
  </label>
);
