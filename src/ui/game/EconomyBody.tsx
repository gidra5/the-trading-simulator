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
    <span class="body-secondary-xs-semi uppercase">Economy</span>
    <span class="mono-xxl-rg mt-2 text-accent-primary">{formatMoney(props.clickValue)}</span>
    <span class="body-secondary-sm-rg mt-2">per click</span>
  </button>
);
