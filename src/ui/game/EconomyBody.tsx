import type { Component } from "solid-js";
import { formatMoney } from "./format";

type EconomyBodyProps = {
  clickValue: number;
  onEarnMoney: () => void;
};

export const EconomyBody: Component<EconomyBodyProps> = (props) => (
  <button
    class="flex h-full w-full flex-col items-center justify-center bg-surface-primary text-center transition hover:bg-surface-secondary active:bg-surface-secondary"
    type="button"
    onClick={props.onEarnMoney}
  >
    <span class="font-body-secondary-xs-semi text-text-secondary uppercase">Economy</span>
    <span class="font-mono-primary-xxl-rg mt-2 text-accent-primary">{formatMoney(props.clickValue)}</span>
    <span class="font-body-secondary-sm-rg mt-2 text-text-secondary">per click</span>
  </button>
);
