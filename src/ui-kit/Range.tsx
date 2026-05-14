import clsx from "clsx";
import { createMemo, splitProps, type Component, type JSX } from "solid-js";
import { themeColors } from "./theme";
import { clamp } from "../utils";

type RangeProps = Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "max" | "min" | "onChange" | "type" | "value"> & {
  max: number;
  min: number;
  onChange: (value: number) => void;
  value: number;
};

export const Range: Component<RangeProps> = (props) => {
  const [local, inputProps] = splitProps(props, ["class", "max", "min", "onChange", "value"]);
  const progress = createMemo(() => {
    const range = local.max - local.min;
    if (range <= 0) return 0;

    return clamp((local.value - local.min) / range, 0, 1) * 100;
  });

  return (
    <input
      {...inputProps}
      class={clsx(
        "h-4 w-full cursor-grab appearance-none",
        "[--range-thumb-opacity:1] hover:[--range-thumb-opacity:0.85]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        local.class,
      )}
      max={local.max}
      min={local.min}
      style={{
        "--range-fill-color": themeColors.accent.secondary,
        "--range-thumb-color": themeColors.accent.primary,
        "--range-progress": `${progress()}%`,
        "--range-thumb-size": "1rem",
        "--range-track-color": themeColors.border,
        "--range-track-height": "0.375rem",
      }}
      type="range"
      value={local.value}
      onInput={(event) => local.onChange(event.currentTarget.valueAsNumber)}
    />
  );
};
