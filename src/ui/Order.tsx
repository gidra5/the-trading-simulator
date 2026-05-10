import { createSignal, For, Show, type Component } from "solid-js";
import { assets, createAccountState } from "../account";

export const digits = 6;

const orderKinds = ["market", "limit"];
type OrderKind = (typeof orderKinds)[number];

// todo: take profit/stop loss
// todo: execution strategies (post only, chain, conditional, trailing stop, scaled order, large volume,  )
// todo: isolated/cross margin
// todo: bots (grid, rebalancing, dca, arbitrage, volume participation, twap, custom script, etc)
// todo: options
// todo: futures
// todo: prediction markets
// todo: copy trading
// todo: staking/deposit
// todo: p2p
export const Order: Component = () => {
  const [feeRate, setFeeRate] = createSignal(0.0001);
  const [debtCapitalizationRate, setDebtCapitalizationRate] = createSignal(0.00001);
  const [maintenanceMargin, setMaintenanceMargin] = createSignal(0);
  const account = createAccountState({
    feeRate,
    debtCapitalizationRate,
    maintenanceMargin,
  });

  const [kind, setKind] = createSignal<OrderKind>("market");
  const [price, setPrice] = createSignal<number>(0);
  const [size, setSize] = createSignal<number>(0);
  const createOrder = (): void => {
    const side = size() > 0 ? "buy" : "sell";
    const _size = Math.abs(size());
    if (_size <= 0) return;

    if (kind() === "market") account.placeMarketOrder(side, _size);
    else account.placeLimitOrder(side, price(), _size);
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex gap-2">
        <span>Account #{account.id}</span>
        <div class="flex flex-col gap-1">
          <For each={assets}>
            {(asset) => (
              <span>
                {asset}: {account.portfolio()[asset].toFixed(digits)}
              </span>
            )}
          </For>
          <span>Total capital: {account.capital().toFixed(digits)}</span>
          <span>Net worth: {account.netWorth().toFixed(digits)}</span>
          <span>Leverage: {Number.isFinite(account.leverage()) ? account.leverage().toFixed(4) : "liquidation"}</span>
          <span>
            Liquidation price:{" "}
            {account.liquidationPrice() === null ? "none" : account.liquidationPrice()!.toFixed(digits)}
          </span>
          <label class="flex flex-col gap-1">
            <span>Maintenance margin fraction</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={maintenanceMargin()}
              onChange={(event) => setMaintenanceMargin(Math.max(0, Number(event.currentTarget.value)))}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>Fee fraction</span>
            <input
              type="number"
              min="0"
              max="1"
              step="0.0001"
              value={feeRate()}
              onChange={(event) => setFeeRate(Math.max(0, Math.min(1 - 1e6, Number(event.currentTarget.value))))}
            />
          </label>
          <label class="flex flex-col gap-1">
            <span>Debt capitalization % / min</span>
            <input
              type="number"
              min="0"
              step="0.00001"
              value={debtCapitalizationRate()}
              onChange={(event) => setDebtCapitalizationRate(Math.max(0, Number(event.currentTarget.value)))}
            />
          </label>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span>Order</span>
        <div class="flex flex-col gap-1">
          <select value={kind()} onChange={(event) => setKind(event.currentTarget.value as OrderKind)}>
            <For each={orderKinds}>{(kind) => <option>{kind}</option>}</For>
          </select>
          <Show when={kind() === "limit"}>
            <input
              type="number"
              min="0"
              placeholder="price"
              value={price()}
              onChange={(event) => setPrice(Number(event.currentTarget.value))}
            />
          </Show>
          <input
            type="number"
            placeholder="size"
            value={size()}
            onChange={(e) => setSize(Number(e.currentTarget.value))}
          />
          <button onClick={createOrder}>Place an order</button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span>Active orders</span>
        <div class="flex max-h-48 flex-col gap-1 overflow-auto font-mono text-xs">
          <For each={account.activeOrders()}>
            {(order) => (
              <div class="grid grid-cols-[auto_1fr_auto] items-center gap-2 border border-slate-800 px-2 py-1">
                <span>{order.side}</span>
                <span>
                  #{order.id} {(order.side === "buy" ? order.size : -order.size).toFixed(digits)} @{" "}
                  {order.price.toFixed(digits)}
                </span>
                <button type="button" onClick={() => account.cancelActiveOrder(order)}>
                  Cancel
                </button>
              </div>
            )}
          </For>
          <Show when={account.activeOrders().length === 0}>
            <span>none</span>
          </Show>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span>Order history</span>
        <div class="flex max-h-56 flex-col gap-1 overflow-auto font-mono text-xs">
          <For each={account.orderHistory()}>
            {(entry) => (
              <div class="grid grid-cols-[auto_auto_1fr] items-center gap-2 border border-slate-800 px-2 py-1">
                <span>{entry.kind}</span>
                <span>{entry.side}</span>
                <span>
                  #{entry.orderId} {(entry.side === "buy" ? entry.size : -entry.size).toFixed(digits)}
                  {entry.price === null ? "" : ` @ ${entry.price.toFixed(digits)}`}
                </span>
              </div>
            )}
          </For>
          <Show when={account.orderHistory().length === 0}>
            <span>none</span>
          </Show>
        </div>
      </div>
    </div>
  );
};
