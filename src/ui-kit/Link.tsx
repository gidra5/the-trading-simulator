import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type FieldProps = JSX.AnchorHTMLAttributes<HTMLAnchorElement>;

export const Link: Component<FieldProps> = (props) => (
  <a class={clsx("underline transition cursor-pointer hover:text-white-xhigh", props.class)} {...props} />
);
