import clsx from "clsx";
import { type Component, type JSX } from "solid-js";

type Props = {
  horizontal?: boolean;
} & JSX.HTMLAttributes<HTMLDivElement>;

export const Divider: Component<Props> = (props) => (
  <div class={clsx("bg-white-xlow/70 w-[1px] h-full", props.class)} {...props} />
);
