import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type TextInputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

export const TextInput: Component<TextInputProps> = (props) => (
  <input
    {...props}
    class={clsx(
      "font-body-primary-sm-rg h-9 w-full rounded border border-solid border-border bg-surface-body px-2.5 text-text-primary outline-none transition placeholder:text-text-secondary hover:border-accent-secondary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-60",
      props.class,
    )}
  />
);
