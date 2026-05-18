import { For, Show, type Component } from "solid-js";
import { t } from "../../i18n/game";
import { ProgressionNode } from "../../progression/data";
import { actor } from "../../routes/game/state";
import { Panel } from "../../ui-kit/Panel";
import { formatNumber } from "../../utils";
import { digits, formatAmount } from "./format";
import type { OrderHistoryEntry } from "./types";

type AccountSidebarProps = {
  liquidations: OrderHistoryEntry[];
  orderHistory: OrderHistoryEntry[];
};

export const AccountSidebar: Component<AccountSidebarProps> = (props) => {
  const gates = {
    liquidations: () => actor.progression.isComplete(ProgressionNode.LiquidationJournaling),
    orderHistory: () => actor.progression.isComplete(ProgressionNode.Journaling),
  };

  return (
    <div class="grid gap-3 p-3">
      <Show when={gates.orderHistory()}>
        <Panel bodyClass="p-0" title={t("account.sidebar.ordersHistory")}>
          <HistoryList entries={props.orderHistory} />
        </Panel>
      </Show>
      <Show when={gates.liquidations()}>
        <Panel bodyClass="p-0" title={t("account.sidebar.liquidations")}>
          <HistoryList entries={props.liquidations} />
        </Panel>
      </Show>
    </div>
  );
};

const HistoryList: Component<{ entries: OrderHistoryEntry[] }> = (props) => {
  return (
    <Show
      fallback={<p class="font-body-secondary-sm-rg p-3 text-text-secondary">{t("common.none")}</p>}
      when={props.entries.length > 0}
    >
      <div class="grid">
        <For each={props.entries}>
          {(entry) => (
            <div class="font-mono-primary-xs-rg grid gap-1 border-b border-border px-3 py-2 last:border-b-0">
              <div class="flex items-center justify-between gap-2">
                <span class="text-text-primary">{t("account.history.orderId", { id: entry.orderId })}</span>
                <span class={entry.side === "buy" ? "text-accent-primary" : "text-danger"}>
                  {t(`order.side.${entry.side}`)}
                </span>
              </div>
              <div class="flex items-center justify-between gap-2 text-text-secondary">
                <span>{t(`order.history.kind.${entry.kind}`)}</span>
                <span>{formatAmount(entry.size)}</span>
              </div>
              <Show when={entry.price !== null}>
                <div class="text-text-secondary">
                  {t("account.history.price", { price: formatNumber(entry.price!, digits) })}
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
};
