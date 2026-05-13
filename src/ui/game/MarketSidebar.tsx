import { For, Show, type Component } from "solid-js";
import type { OrderSide } from "../../market";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { TabBar } from "../../ui-kit/TabBar";
import { TextInput } from "../../ui-kit/TextInput";
import { formatNumber } from "../../utils";
import { digits, formatAmount } from "./format";
import { orderKindTabs, orderSideTabs, type AccountState, type OrderKind } from "./types";

type MarketSidebarProps = {
  account: AccountState;
  onOrderKindChange: (kind: OrderKind) => void;
  onOrderPriceChange: (price: string) => void;
  onOrderSideChange: (side: OrderSide) => void;
  onOrderSizeChange: (size: string) => void;
  onPlaceOrder: () => void;
  orderKind: OrderKind;
  orderPrice: string;
  orderSide: OrderSide;
  orderSize: string;
};

export const MarketSidebar: Component<MarketSidebarProps> = (props) => (
  <div class="grid gap-3 p-3">
    <Panel title="Order Placement">
      <div class="grid gap-3">
        <TabBar class="w-full" tabs={orderSideTabs} value={props.orderSide} onChange={props.onOrderSideChange} />
        <TabBar class="w-full" tabs={orderKindTabs} value={props.orderKind} onChange={props.onOrderKindChange} />
        <Show when={props.orderKind === "limit"}>
          <Field label="Limit price">
            <TextInput
              inputMode="decimal"
              value={props.orderPrice}
              onInput={(event) => props.onOrderPriceChange(event.currentTarget.value)}
            />
          </Field>
        </Show>
        <Field label="Size">
          <TextInput
            inputMode="decimal"
            value={props.orderSize}
            onInput={(event) => props.onOrderSizeChange(event.currentTarget.value)}
          />
        </Field>
        <Button variant="primary" onClick={props.onPlaceOrder}>
          Place Order
        </Button>
      </div>
    </Panel>

    <Panel bodyClass="p-0" title="Active Orders">
      <Show
        fallback={<p class="font-body-secondary-sm-rg p-3 text-text-secondary">None</p>}
        when={props.account.activeOrders().length > 0}
      >
        <div class="grid">
          <For each={props.account.activeOrders()}>
            {(order) => (
              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b border-border px-3 py-2 last:border-b-0">
                <span
                  class={
                    order.side === "buy"
                      ? "font-body-primary-xs-rg rounded bg-accent-secondary px-2 py-1 text-text-primary"
                      : "font-body-primary-xs-rg rounded bg-danger px-2 py-1 text-surface-primary"
                  }
                >
                  {order.side}
                </span>
                <div class="font-mono-primary-xs-rg min-w-0">
                  <p>#{order.id}</p>
                  <p class="truncate text-text-secondary">
                    {formatAmount(order.size)} @ {formatNumber(order.price, digits)}
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => props.account.cancelActiveOrder(order)}>
                  Cancel
                </Button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </Panel>
  </div>
);
