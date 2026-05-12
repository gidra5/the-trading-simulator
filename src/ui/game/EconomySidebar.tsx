import type { Component } from "solid-js";
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

export const EconomySidebar: Component<EconomySidebarProps> = (props) => (
  <div class="grid gap-3 p-3">
    <Panel title="Click Upgrade">
      <div class="grid gap-3">
        <Metric label="Current" value={formatMoney(props.clickValue)} />
        <Metric label="Next" tone="accent" value={formatMoney(props.nextClickValue)} />
        <Metric label="Price" tone={props.canBuyUpgrade ? "warning" : "danger"} value={formatMoney(props.upgradeCost)} />
        <Button disabled={!props.canBuyUpgrade} variant="primary" onClick={props.onBuyUpgrade}>
          Buy Upgrade
        </Button>
      </div>
    </Panel>
  </div>
);
