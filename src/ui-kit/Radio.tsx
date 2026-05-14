import clsx from "clsx";
import { For } from "solid-js";
import { buttonSizes, buttonVariants } from "./Button";

type RadioOption<Value extends string> = {
  label: string;
  value: Value;
};

type RadioProps<Value extends string> = {
  class?: string;
  onChange: (value: Value) => void;
  options: readonly RadioOption<Value>[];
  value: Value;
};

export function Radio<Value extends string>(props: RadioProps<Value>) {
  return (
    <div class={clsx("inline-flex items-center gap-1", props.class)} role="radiogroup">
      <For each={props.options}>
        {(option) => {
          const isActive = () => props.value === option.value;

          return (
            <button
              aria-checked={isActive()}
              class={clsx(
                "inline-flex appearance-none items-center justify-center gap-2 rounded border transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                buttonSizes.md,
                isActive() && buttonVariants.primary,
                !isActive() && buttonVariants.ghost,
              )}
              role="radio"
              type="button"
              onClick={() => props.onChange(option.value)}
            >
              {option.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
