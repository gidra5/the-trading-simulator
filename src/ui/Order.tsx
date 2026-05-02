import { createEffect, createSignal, For, Show, type Component } from "solid-js";
import { makeOrder, marketPriceSpread, orderBook, orderBookHistory, takeOrder } from "../market";
import { createThrottledMemo } from "../utils";
import type { RegisteredOrder } from "../market/order";

const assets = ["Money", "Stock"];
export const digits = 6;

type Portfolio = Record<string, number>;

const orderKinds = ["market", "limit"];
type OrderKind = (typeof orderKinds)[number];
type PendingOrder = { id: number; size: number };

const pollingInterval = 200;

// todo: take profit/stop loss
// todo: execution strategies (post only, chain, conditional, trailing stop, scaled order, large volume,  )
// todo: list of active orders
// todo: order history
// todo: leverage
// todo: isolated/cross margin
// todo: bots (grid, rebalancing, dca, arbitrage, volume participation, twap, custom script, etc)
// todo: options
// todo: futures
// todo: prediction markets
// todo: copy trading
// todo: staking/deposit
// todo: p2p
export const Order: Component = () => {
  const [portfolio, setPortfolio] = createSignal<Portfolio>({
    Money: 100_000,
    Stock: 0,
  });
  const netWorth = () => portfolio().Money + portfolio().Stock * marketPriceSpread().sell;

  const upd = (size: number, cost: number): void => {
    setPortfolio((current) => {
      const next = { ...current };
      next.Stock += size;
      next.Money -= cost;
      return next;
    });
  };

  // todo: subscription api instead of polling
  const orders: PendingOrder[] = [];

  const onFulfilled = (pending: PendingOrder, cost: number): void => {
    const idx = orders.findIndex((order) => order.id === pending.id);
    if (idx !== -1) orders.splice(idx, 1);
    const sign = pending.size > 0 ? 1 : -1;
    upd(pending.size, sign * cost);
  };

  const onPartialFill = (pending: PendingOrder, cost: number): void => {
    const prevIdx = orders.findIndex((prev) => prev.id === pending.id);
    if (prevIdx === -1) return;

    const prev = orders[prevIdx];
    const sign = prev.size > 0 ? 1 : -1;
    const fulfilled = prev.size - pending.size;
    upd(fulfilled, sign * cost);

    orders.splice(prevIdx, 1, pending);
  };

  createEffect(() => {
    const history = orderBookHistory();
    const latest = history[history.length - 1];
    if (!latest) return;
    if (latest.kind !== "delta") return;
    for (const change of latest.changes) {
      if (change.kind === "add") continue;
      const pending = orders.find((order) => order.id === change.order.id);
      if (!pending) continue;
      const filled = change.kind === "remove" ? change.order.size : pending.size - change.order.size;
      const cost = filled * change.order.price;
      if (change.kind === "remove") onFulfilled(pending, cost);
      else onPartialFill({ ...pending, size: change.order.size }, cost);
    }
  });

  const [kind, setKind] = createSignal<OrderKind>("market");
  const [price, setPrice] = createSignal<number>(0);
  const [size, setSize] = createSignal<number>(0);
  const createOrder = (): void => {
    const side = size() > 0 ? "buy" : "sell";
    const _size = Math.abs(size());
    const sign = size() < 0 ? -1 : 1;

    if (kind() === "market") {
      const result = takeOrder(side, _size);
      upd(sign * result.fulfilled, sign * result.cost);
    } else {
      const order = { price: price(), size: _size };
      const result = makeOrder(side, order);

      if (result.fulfilled > 0) upd(sign * result.fulfilled, sign * result.cost);
      if (result.restingSize > 0) orders.push({ id: result.id, size: sign * result.restingSize });
      else onFulfilled({ id: result.id, size: sign * result.restingSize }, sign * result.cost);
    }
  };

  return (
    <div class="flex flex-col gap-4">
      <div class="flex gap-2">
        <span>Balance</span>
        <div class="flex flex-col gap-1">
          <For each={assets}>
            {(asset) => (
              <span>
                {asset}: {portfolio()[asset].toFixed(digits)}
              </span>
            )}
          </For>
          <span>Net worth: {netWorth().toFixed(digits)}</span>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span>Order</span>
        <div class="flex flex-col gap-1">
          <select value={kind()} onChange={(event) => setKind(event.currentTarget.value)}>
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
    </div>
  );
};
