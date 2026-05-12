import { For, Show, type Component } from "solid-js";
import { Panel } from "../../ui-kit/Panel";
import { formatNumber } from "../../utils";
import { digits, formatAmount } from "./format";
import type { OrderHistoryEntry } from "./types";

type AccountSidebarProps = {
  liquidations: OrderHistoryEntry[];
  orderHistory: OrderHistoryEntry[];
};

export const AccountSidebar: Component<AccountSidebarProps> = (props) => (
  <div class="grid gap-3 p-3">
    <Panel bodyClass="p-0" title="Orders History">
      <HistoryList entries={props.orderHistory} />
    </Panel>
    <Panel bodyClass="p-0" title="Liquidations">
      <HistoryList entries={props.liquidations} />
    </Panel>
  </div>
);

const HistoryList: Component<{ entries: OrderHistoryEntry[] }> = (props) => (
  <Show fallback={<p class="body-secondary-sm-rg p-3">None</p>} when={props.entries.length > 0}>
    <div class="grid">
      <For each={props.entries}>
        {(entry) => (
          <div class="mono-xs-rg grid gap-1 border-b border-border px-3 py-2 last:border-b-0">
            <div class="flex items-center justify-between gap-2">
              <span class="text-text-primary">#{entry.orderId}</span>
              <span class={entry.side === "buy" ? "text-accent-primary" : "text-danger"}>{entry.side}</span>
            </div>
            <div class="flex items-center justify-between gap-2 text-text-secondary">
              <span>{entry.kind}</span>
              <span>{formatAmount(entry.size)}</span>
            </div>
            <Show when={entry.price !== null}>
              <div class="text-text-secondary">@ {formatNumber(entry.price!, digits)}</div>
            </Show>
          </div>
        )}
      </For>
    </div>
  </Show>
);
