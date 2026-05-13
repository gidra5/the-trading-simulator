import type { Component } from "solid-js";
import { formatMoney } from "./format";
import type { AccountState, GameTab } from "./types";

type FooterProps = {
  account: AccountState;
  activeTab: GameTab;
};

export const Footer: Component<FooterProps> = (props) => (
  <footer class="font-mono-primary-xs-rg flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-secondary px-3 text-text-secondary">
    <span>Account #{props.account.id}</span>
    <span>Balance {formatMoney(props.account.portfolio().Money)}</span>
    <span>Net Worth {formatMoney(props.account.netWorth())}</span>
    <span>{props.activeTab}</span>
  </footer>
);
