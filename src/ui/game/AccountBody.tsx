import { For, type Component } from "solid-js";
import { assets } from "../../economy/account";
import { t } from "../../i18n/game";
import { Metric } from "../../ui-kit/Metric";
import { Panel } from "../../ui-kit/Panel";
import { formatNumber } from "../../utils";
import { formatAmount, formatMoney, digits } from "./format";
import type { AccountState } from "./types";

type AccountBodyProps = {
  account: AccountState;
};

export const AccountBody: Component<AccountBodyProps> = (props) => {
  return (
    <div class="h-full overflow-auto p-4">
      <div class="grid gap-4">
        <div class="grid grid-cols-4 gap-3">
          <Metric label={t("account.metrics.balance")} value={formatMoney(props.account.portfolio().Money)} />
          <Metric label={t("account.metrics.stock")} value={formatAmount(props.account.portfolio().Stock)} />
          <Metric label={t("account.metrics.capital")} tone="accent" value={formatMoney(props.account.capital())} />
          <Metric
            label={t("account.metrics.leverage")}
            tone={Number.isFinite(props.account.leverage()) ? "warning" : "danger"}
            value={
              Number.isFinite(props.account.leverage())
                ? `${props.account.leverage().toFixed(2)}x`
                : t("account.metrics.liquidation")
            }
          />
        </div>

        <Panel title={t("account.panels.portfolio")}>
          <div class="grid gap-2">
            <For each={assets}>
              {(asset) => (
                <div class="flex items-center justify-between border-b border-border py-2 last:border-b-0">
                  <span class="font-body-secondary-base-rg text-text-secondary">{t(`asset.${asset}`)}</span>
                  <span class="font-mono-primary-base-rg">
                    {asset === "Money"
                      ? formatMoney(props.account.portfolio()[asset])
                      : formatAmount(props.account.portfolio()[asset])}
                  </span>
                </div>
              )}
            </For>
          </div>
        </Panel>

        <Panel title={t("account.panels.stats")}>
          <div class="grid grid-cols-3 gap-3">
            <Metric
              label={t("account.metrics.netWorth")}
              tone="success"
              value={formatMoney(props.account.netWorth())}
            />
            <Metric
              label={t("account.metrics.liquidationPrice")}
              value={
                props.account.liquidationPrice() === null
                  ? t("common.none")
                  : formatNumber(props.account.liquidationPrice()!, digits)
              }
            />
            <Metric label={t("account.metrics.activeOrders")} value={String(props.account.activeOrders().length)} />
          </div>
        </Panel>
      </div>
    </div>
  );
};
