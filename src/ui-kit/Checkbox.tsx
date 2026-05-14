import clsx from "clsx";
import { Check } from "lucide-solid";
import { splitProps, type Component, type JSX } from "solid-js";

type CheckboxProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox: Component<CheckboxProps> = (props) => {
  const [local, inputProps] = splitProps(props, ["class", "checked", "disabled"]);

  return (
    <span
      class={clsx(
        "group inline-flex items-center",
        local.disabled && "cursor-not-allowed opacity-60",
        !local.disabled && "cursor-pointer",
        local.class,
      )}
    >
      <input {...inputProps} checked={local.checked} class="sr-only" disabled={local.disabled} type="checkbox" />
      <span
        aria-hidden="true"
        class={clsx(
          "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-solid transition",
          local.checked &&
            "border-accent-primary bg-accent-primary text-surface-primary field-hover:opacity-85 group-hover:opacity-85",
          !local.checked &&
            "border-border bg-surface-body field-hover:border-accent-secondary field-hover:bg-surface-secondary group-hover:border-accent-secondary group-hover:bg-surface-secondary",
        )}
      >
        <Check
          class={clsx("h-3 w-3 transition-opacity", local.checked ? "opacity-100" : "opacity-0")}
          strokeWidth={3}
        />
      </span>
    </span>
  );
};
