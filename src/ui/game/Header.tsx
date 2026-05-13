import { createMemo, type Accessor, type Component } from "solid-js";
import { t } from "../../i18n/game";
import { TabBar } from "../../ui-kit/TabBar";
import { formatNumber } from "../../utils";
import { digits } from "./format";
import { tabValues, type Tab } from "./types";

type HeaderProps = {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  priceSpread: Accessor<{ buy: number; sell: number }>;
};

export const Header: Component<HeaderProps> = (props) => {
  const tabs = createMemo(() => tabValues.map((value) => ({ value, label: t(`tabs.${value}`) })));

  return (
    <header class="flex h-12 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-secondary px-3">
      <a class="font-title-primary-xs-semi text-text-primary no-underline hover:text-accent-primary" href="/">
        {t("app.title")}
      </a>
      <TabBar tabs={tabs()} value={props.activeTab} onChange={props.onTabChange} />
      <div class="font-mono-primary-xs-rg flex items-center gap-3 text-text-secondary">
        <span>{t("market.header.buy", { price: formatNumber(props.priceSpread().buy, digits) })}</span>
        <span>{t("market.header.sell", { price: formatNumber(props.priceSpread().sell, digits) })}</span>
      </div>
    </header>
  );
};
