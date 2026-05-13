import clsx from "clsx";
import { ChevronDown } from "lucide-solid";
import { createSignal, For, type Component } from "solid-js";
import { Field } from "./Field";

type SelectOption = {
  label: string;
  value: string;
};

type SelectFieldProps = {
  class?: string;
  label: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  value: string;
};

export const SelectField: Component<SelectFieldProps> = (props) => {
  const [isFocused, setIsFocused] = createSignal(false);

  return (
    <Field class={props.class} label={props.label}>
      <span class="relative block h-9">
        <select
          class="font-body-primary-sm-rg block h-9 w-full appearance-none rounded border border-solid border-border bg-surface-body px-2.5 pr-9 text-text-primary outline-none transition hover:border-accent-secondary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary"
          value={props.value}
          onBlur={() => setIsFocused(false)}
          onChange={(event) => props.onChange(event.currentTarget.value)}
          onFocus={() => setIsFocused(true)}
        >
          <For each={props.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
        </select>
        <ChevronDown
          aria-hidden="true"
          class={clsx(
            "pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform",
            isFocused() && "rotate-180 text-accent-primary",
          )}
          strokeWidth={1.8}
        />
      </span>
    </Field>
  );
};
