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
    <header class="flex h-16 shrink-0 items-center justify-between gap-4 px-3">
      <span class="font-body-primary-xl-semi text-text-primary">{t("app.title")}</span>
      <TabBar tabs={tabs()} value={props.activeTab} onChange={props.onTabChange} />
      <div class="font-mono-primary-xs-rg flex items-center gap-3 text-text-secondary">
        <span>{t("market.header.buy", { price: formatNumber(props.priceSpread().buy, digits) })}</span>
        <span>{t("market.header.sell", { price: formatNumber(props.priceSpread().sell, digits) })}</span>
      </div>
    </header>
  );
};
