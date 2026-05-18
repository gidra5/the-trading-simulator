import { createEffect, createMemo, createSignal, For, Show, type Component } from "solid-js";
import { Resource } from "../../economy/inventory";
import { t } from "../../i18n/game";
import type { OrderSide } from "../../market";
import { Button } from "../../ui-kit/Button";
import { Field } from "../../ui-kit/Field";
import { Panel } from "../../ui-kit/Panel";
import { Radio } from "../../ui-kit/Radio";
import { TextInput } from "../../ui-kit/TextInput";
import { formatNumber } from "../../utils";
import { digits, formatAmount, formatMoney } from "./format";
import { orderKindValues, orderSideValues, type OrderKind } from "./types";
import { actor } from "../../routes/game/state";
import { ProgressionNode } from "../../progression/data";

export const MarketSidebar: Component = () => {
  const gates = {
    activeOrders: () => actor.progression.isComplete(ProgressionNode.Journaling),
    limitOrders: () => actor.progression.isComplete(ProgressionNode.TradingAdvanced),
  };
  const [orderSide, setOrderSide] = createSignal<OrderSide>("buy");
  const [orderKind, setOrderKind] = createSignal<OrderKind>("market");
  const [orderPrice, setOrderPrice] = createSignal("1.001000");
  const [orderSize, setOrderSize] = createSignal("100");
  const [transferAmount, setTransferAmount] = createSignal("100");
  const orderSideTabs = createMemo(() => orderSideValues.map((value) => ({ value, label: t(`order.side.${value}`) })));
  const orderKindTabs = createMemo(() =>
    orderKindValues
      .filter((value) => value === "market" || gates.limitOrders())
      .map((value) => ({ value, label: t(`order.kind.${value}`) })),
  );

  const placeOrder = (): void => {
    const size = Number(orderSize());
    if (!Number.isFinite(size) || size <= 0) return;

    if (orderKind() === "market") {
      actor.account.placeMarketOrder(orderSide(), size);
      return;
    }

    const price = Number(orderPrice());
    if (!Number.isFinite(price) || price <= 0) return;
    actor.account.placeLimitOrder(orderSide(), price, size);
  };

  const parsedTransferAmount = (): number => {
    const amount = Number(transferAmount());
    return Number.isFinite(amount) && amount > 0 ? amount : 0;
  };

  const depositMoney = (): void => {
    const amount = Math.min(parsedTransferAmount(), actor.inventory.resources().Money);
    if (amount <= 0) return;

    actor.inventory.removeResource(Resource.Money, amount);
    actor.account.addMoney(amount);
  };

  const withdrawMoney = (): void => {
    const amount = Math.min(parsedTransferAmount(), Math.max(0, actor.account.portfolio().Money));
    if (amount <= 0) return;

    actor.account.addMoney(-amount);
    actor.inventory.addResource(Resource.Money, amount);
  };

  createEffect(() => {
    if (orderKind() === "limit" && !gates.limitOrders()) setOrderKind("market");
  });

  return (
    <div class="grid gap-3 p-3">
      <Panel title={t("market.order.placement")}>
        <div class="grid gap-3">
          <Radio class="w-full" options={orderSideTabs()} value={orderSide()} onChange={setOrderSide} />
          <Show when={gates.limitOrders()}>
            <Radio class="w-full" options={orderKindTabs()} value={orderKind()} onChange={setOrderKind} />
          </Show>
          <Show when={orderKind() === "limit"}>
            <Field label={t("market.order.limitPrice")}>
              <TextInput
                inputMode="decimal"
                value={orderPrice()}
                onInput={(event) => setOrderPrice(event.currentTarget.value)}
              />
            </Field>
          </Show>
          <Field label={t("market.order.size")}>
            <TextInput
              inputMode="decimal"
              value={orderSize()}
              onInput={(event) => setOrderSize(event.currentTarget.value)}
            />
          </Field>
          <Button variant="primary" onClick={placeOrder}>
            {t("market.order.place")}
          </Button>
        </div>
      </Panel>

      <Panel title={t("market.transfer.title")}>
        <div class="grid gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="grid gap-1">
              <span class="font-body-primary-xs-rg text-text-secondary">{t("market.transfer.inventory")}</span>
              <span class="font-mono-primary-sm-rg text-text-primary">
                {formatMoney(actor.inventory.resources().Money)}
              </span>
            </div>
            <div class="grid gap-1">
              <span class="font-body-primary-xs-rg text-text-secondary">{t("market.transfer.account")}</span>
              <span class="font-mono-primary-sm-rg text-text-primary">
                {formatMoney(actor.account.portfolio().Money)}
              </span>
            </div>
          </div>
          <Field label={t("market.transfer.amount")}>
            <TextInput
              inputMode="decimal"
              value={transferAmount()}
              onInput={(event) => setTransferAmount(event.currentTarget.value)}
            />
          </Field>
          <div class="grid grid-cols-2 gap-2">
            <Button onClick={depositMoney}>{t("market.transfer.deposit")}</Button>
            <Button onClick={withdrawMoney}>{t("market.transfer.withdraw")}</Button>
          </div>
        </div>
      </Panel>

      <Show when={gates.activeOrders()}>
        <Panel bodyClass="p-0" title={t("market.order.activeOrders")}>
          <Show
            fallback={<p class="font-body-secondary-sm-rg p-3 text-text-secondary">{t("common.none")}</p>}
            when={actor.account.activeOrders().length > 0}
          >
            <div class="grid">
              <For each={actor.account.activeOrders()}>
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
                    <Button size="sm" variant="ghost" onClick={() => actor.account.cancelActiveOrder(order)}>
                      {t("market.order.cancel")}
                    </Button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Panel>
      </Show>
    </div>
  );
};
