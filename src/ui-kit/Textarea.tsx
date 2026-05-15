import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type TextareaProps = JSX.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea: Component<TextareaProps> = (props) => (
  <textarea
    {...props}
    class={clsx(
      "font-body-primary-sm-rg min-h-24 w-full resize-y rounded border border-solid border-border bg-surface-body px-2.5 py-2 text-text-primary outline-none transition placeholder:text-text-secondary hover:border-accent-secondary focus:border-accent-primary focus:ring-1 focus:ring-accent-primary disabled:cursor-not-allowed disabled:bg-surface-secondary disabled:opacity-60",
      props.class,
    )}
  />
);
