import type { Component } from "solid-js";
import { t } from "../../i18n/game";
import { formatMoney } from "./format";
import type { AccountState, Tab } from "./types";

type FooterProps = {
  account: AccountState;
  activeTab: Tab;
};

export const Footer: Component<FooterProps> = (props) => {
  return (
    <footer class="font-mono-primary-xs-rg flex h-8 shrink-0 items-center justify-between gap-4 border-t border-border bg-surface-secondary px-3 text-text-secondary">
      <span>{t("account.footer.account", { id: props.account.id })}</span>
      <span>{t("account.footer.balance", { value: formatMoney(props.account.portfolio().Money) })}</span>
      <span>{t("account.footer.netWorth", { value: formatMoney(props.account.netWorth()) })}</span>
      <span>{t(`tabs.${props.activeTab}`)}</span>
    </footer>
  );
};
