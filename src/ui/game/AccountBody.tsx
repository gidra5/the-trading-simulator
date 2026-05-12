import { For, type Component } from "solid-js";
import { assets } from "../../economy/account";
import { Metric } from "../../ui-kit/Metric";
import { Panel } from "../../ui-kit/Panel";
import { formatAmount, formatMoney, digits } from "./format";
import type { AccountState } from "./types";
import { formatNumber } from "../../utils";

type AccountBodyProps = {
  account: AccountState;
};

export const AccountBody: Component<AccountBodyProps> = (props) => (
  <div class="h-full overflow-auto p-4">
    <div class="grid gap-4">
      <div class="grid grid-cols-4 gap-3">
        <Metric label="Balance" value={formatMoney(props.account.portfolio().Money)} />
        <Metric label="Stock" value={formatAmount(props.account.portfolio().Stock)} />
        <Metric label="Capital" tone="accent" value={formatMoney(props.account.capital())} />
        <Metric
          label="Leverage"
          tone={Number.isFinite(props.account.leverage()) ? "warning" : "danger"}
          value={Number.isFinite(props.account.leverage()) ? `${props.account.leverage().toFixed(2)}x` : "Liquidation"}
        />
      </div>

      <Panel title="Portfolio">
        <div class="grid gap-2">
          <For each={assets}>
            {(asset) => (
              <div class="flex items-center justify-between border-b border-border py-2 last:border-b-0">
                <span class="body-secondary-base-rg">{asset}</span>
                <span class="mono-base-rg">
                  {asset === "Money"
                    ? formatMoney(props.account.portfolio()[asset])
                    : formatAmount(props.account.portfolio()[asset])}
                </span>
              </div>
            )}
          </For>
        </div>
      </Panel>

      <Panel title="Stats">
        <div class="grid grid-cols-3 gap-3">
          <Metric label="Net Worth" tone="success" value={formatMoney(props.account.netWorth())} />
          <Metric
            label="Liquidation Price"
            value={
              props.account.liquidationPrice() === null
                ? "None"
                : formatNumber(props.account.liquidationPrice()!, digits)
            }
          />
          <Metric label="Active Orders" value={String(props.account.activeOrders().length)} />
        </div>
      </Panel>
    </div>
  </div>
);
