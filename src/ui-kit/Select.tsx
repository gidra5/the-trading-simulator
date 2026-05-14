import clsx from "clsx";
import { ChevronDown } from "lucide-solid";
import { createSignal, For, splitProps, type Component, type JSX } from "solid-js";

type SelectOption = {
  label: string;
  value: string;
};

type SelectProps = JSX.SelectHTMLAttributes<HTMLSelectElement> & {
  options: readonly SelectOption[];
};

export const Select: Component<SelectProps> = (props) => {
  const [local, selectProps] = splitProps(props, ["class", "onBlur", "onFocus", "options"]);
  const [isFocused, setIsFocused] = createSignal(false);

  return (
    <span class="relative block h-9">
      <select
        {...selectProps}
        class={clsx(
          "font-body-primary-sm-rg block h-9 w-full appearance-none rounded border border-solid border-border bg-surface-body px-2.5 pr-9 text-text-primary outline-none transition hover:border-accent-secondary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-60",
          local.class,
        )}
        onBlur={(event) => {
          setIsFocused(false);
          if (typeof local.onBlur === "function") {
            local.onBlur(event);
          }
        }}
        onFocus={(event) => {
          setIsFocused(true);
          if (typeof local.onFocus === "function") {
            local.onFocus(event);
          }
        }}
      >
        <For each={local.options}>{(option) => <option value={option.value}>{option.label}</option>}</For>
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
  );
};
