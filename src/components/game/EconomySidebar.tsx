import type { Component } from "solid-js";
import { t } from "../../i18n/game";
import { Button } from "../../ui-kit/Button";
import { Metric } from "../../ui-kit/Metric";
import { Panel } from "../../ui-kit/Panel";
import { formatMoney } from "./format";

type EconomySidebarProps = {
  canBuyUpgrade: boolean;
  clickValue: number;
  nextClickValue: number;
  onBuyUpgrade: () => void;
  upgradeCost: number;
};

export const EconomySidebar: Component<EconomySidebarProps> = (props) => {
  return (
    <div class="grid gap-3 p-3">
      <Panel title={t("economy.panels.clickUpgrade")}>
        <div class="grid gap-3">
          <Metric label={t("economy.metrics.current")} value={formatMoney(props.clickValue)} />
          <Metric label={t("economy.metrics.next")} tone="accent" value={formatMoney(props.nextClickValue)} />
          <Metric
            label={t("economy.metrics.price")}
            tone={props.canBuyUpgrade ? "warning" : "danger"}
            value={formatMoney(props.upgradeCost)}
          />
          <Button disabled={!props.canBuyUpgrade} variant="primary" onClick={props.onBuyUpgrade}>
            {t("economy.upgrade.buy")}
          </Button>
        </div>
      </Panel>
    </div>
  );
};
