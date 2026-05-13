import type { Accessor, Component } from "solid-js";
import { TabBar } from "../../ui-kit/TabBar";
import { formatNumber } from "../../utils";
import { digits } from "./format";
import { gameTabs, type GameTab } from "./types";

type HeaderProps = {
  activeTab: GameTab;
  onTabChange: (tab: GameTab) => void;
  priceSpread: Accessor<{ buy: number; sell: number }>;
};

export const Header: Component<HeaderProps> = (props) => (
  <header class="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-secondary px-3">
    <a class="font-title-primary-xs-semi text-text-primary no-underline hover:text-accent-primary" href="/">
      Trading Simulator
    </a>
    <TabBar tabs={gameTabs} value={props.activeTab} onChange={props.onTabChange} />
    <div class="font-mono-primary-xs-rg flex items-center gap-3 text-text-secondary">
      <span>Buy {formatNumber(props.priceSpread().buy, digits)}</span>
      <span>Sell {formatNumber(props.priceSpread().sell, digits)}</span>
    </div>
  </header>
);
