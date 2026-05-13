import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type FieldProps = {
  children: JSX.Element;
  class?: string;
  label: string;
};

export const Field: Component<FieldProps> = (props) => (
  <label class={clsx("font-body-primary-sm-rg grid gap-1 text-text-secondary", props.class)}>
    <span>{props.label}</span>
    {props.children}
  </label>
);
