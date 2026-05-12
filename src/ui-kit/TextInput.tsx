import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type TextInputProps = JSX.InputHTMLAttributes<HTMLInputElement>;

export const TextInput: Component<TextInputProps> = (props) => (
  <input
    {...props}
    class={clsx(
      "body-primary-sm-rg h-9 w-full rounded border border-border bg-surface-primary px-2.5 outline-none transition placeholder:text-text-secondary focus:border-accent-primary disabled:cursor-not-allowed disabled:opacity-60",
      props.class,
    )}
  />
);
