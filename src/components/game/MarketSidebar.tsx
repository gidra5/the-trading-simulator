import { createMemo, For, Show, type Component } from "solid-js";
import { t } from "../../i18n/game";
import type { OrderSide } from "../../market";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { Radio } from "../../ui-kit/Radio";
import { TextInput } from "../../ui-kit/TextInput";
import { formatNumber } from "../../utils";
import { digits, formatAmount } from "./format";
import { orderKindValues, orderSideValues, type AccountState, type OrderKind } from "./types";

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

export const MarketSidebar: Component<MarketSidebarProps> = (props) => {
  const orderSideTabs = createMemo(() => orderSideValues.map((value) => ({ value, label: t(`order.side.${value}`) })));
  const orderKindTabs = createMemo(() => orderKindValues.map((value) => ({ value, label: t(`order.kind.${value}`) })));

  return (
    <div class="grid gap-3 p-3">
      <Panel title={t("market.order.placement")}>
        <div class="grid gap-3">
          <Radio class="w-full" options={orderSideTabs()} value={props.orderSide} onChange={props.onOrderSideChange} />
          <Radio class="w-full" options={orderKindTabs()} value={props.orderKind} onChange={props.onOrderKindChange} />
          <Show when={props.orderKind === "limit"}>
            <Field label={t("market.order.limitPrice")}>
              <TextInput
                inputMode="decimal"
                value={props.orderPrice}
                onInput={(event) => props.onOrderPriceChange(event.currentTarget.value)}
              />
            </Field>
          </Show>
          <Field label={t("market.order.size")}>
            <TextInput
              inputMode="decimal"
              value={props.orderSize}
              onInput={(event) => props.onOrderSizeChange(event.currentTarget.value)}
            />
          </Field>
          <Button variant="primary" onClick={props.onPlaceOrder}>
            {t("market.order.place")}
          </Button>
        </div>
      </Panel>

      <Panel bodyClass="p-0" title={t("market.order.activeOrders")}>
        <Show
          fallback={<p class="font-body-secondary-sm-rg p-3 text-text-secondary">{t("common.none")}</p>}
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
                    {t(`order.side.${order.side}`)}
                  </span>
                  <div class="font-mono-primary-xs-rg min-w-0">
                    <p>{t("account.history.orderId", { id: order.id })}</p>
                    <p class="truncate text-text-secondary">
                      {t("market.activeOrder.amountAtPrice", {
                        amount: formatAmount(order.size),
                        price: formatNumber(order.price, digits),
                      })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => props.account.cancelActiveOrder(order)}>
                    {t("market.order.cancel")}
                  </Button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Panel>
    </div>
  );
};
