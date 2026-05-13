import clsx from "clsx";
import type { Component, JSX } from "solid-js";

type MetricTone = "neutral" | "accent" | "success" | "warning" | "danger";

type MetricProps = {
  detail?: JSX.Element;
  label: string;
  tone?: MetricTone;
  value: JSX.Element;
};

const metricToneClasses: Record<MetricTone, string> = {
  neutral: "text-text-primary",
  accent: "text-accent-primary",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

export const Metric: Component<MetricProps> = (props) => {
  const tone = () => props.tone ?? "neutral";

  return (
    <div class="rounded border border-border bg-surface-primary p-3">
      <p class="font-body-primary-xs-rg text-text-secondary">{props.label}</p>
      <p class={clsx("font-mono-primary-lg-rg mt-1", metricToneClasses[tone()])}>{props.value}</p>
      {props.detail ? <p class="font-body-secondary-xs-rg mt-1 text-text-secondary">{props.detail}</p> : null}
    </div>
  );
};
