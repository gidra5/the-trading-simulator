import clsx from "clsx";
import { splitProps, type Component, type JSX } from "solid-js";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "icon";
type ButtonSize = "sm" | "md";

type ButtonProps = JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "border-accent-primary bg-accent-primary text-surface-primary hover:opacity-90 focus-visible:outline-accent-primary",
  secondary:
    "border-border border-solid bg-surface-secondary text-text-primary hover:bg-black-high hover:border-accent-secondary focus-visible:outline-accent-primary",
  ghost:
    "border-transparent bg-transparent text-text-secondary hover:bg-black-high/60 hover:text-text-primary focus-visible:outline-accent-primary",
  danger: "border-danger bg-danger text-surface-primary hover:opacity-90 focus-visible:outline-danger",
  icon: "border-transparent bg-transparent text-text-secondary hover:bg-black-high/60 hover:text-text-primary focus-visible:outline-accent-primary",
};

export const buttonSizes: Record<ButtonSize, string> = {
  sm: "px-4 py-1 font-body-primary-xs-semi",
  md: "px-4 py-1 font-body-primary-base-semi",
};

const iconButtonSizes: Record<ButtonSize, string> = {
  sm: "h-6 w-6 p-0",
  md: "h-8 w-8 p-0",
};

export const Button: Component<ButtonProps> = (props) => {
  const [local, buttonProps] = splitProps(props, ["active", "class", "size", "variant"]);
  const variant = () => local.variant ?? "secondary";
  const size = () => local.size ?? "md";
  const sizeClass = () => (variant() === "icon" ? iconButtonSizes[size()] : buttonSizes[size()]);

  return (
    <button
      {...buttonProps}
      class={clsx(
        "inline-flex appearance-none items-center justify-center gap-2 rounded border transition disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        buttonVariants[variant()],
        sizeClass(),
        local.active && "ring-1 ring-accent-primary",
        local.class,
      )}
    />
  );
};
