import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type PanelProps = {
  actions?: JSX.Element;
  bodyClass?: string;
  children: JSX.Element;
  class?: string;
  title?: JSX.Element;
};

export const Panel: Component<PanelProps> = (props) => (
  <section
    class={clsx("flex flex-col overflow-hidden rounded-lg border border-border bg-surface-primary", props.class)}
  >
    {props.title ? (
      <div class="flex min-h-10 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <h2 class="font-body-primary-xs-semi text-text-secondary uppercase">{props.title}</h2>
        {props.actions}
      </div>
    ) : null}
    <div class={clsx("p-3", props.bodyClass)}>{props.children}</div>
  </section>
);
