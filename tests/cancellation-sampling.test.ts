import { expect, test } from "vitest";
import type { OrderBookChange } from "../src/market/orderBook";
import { createCancellationState } from "../src/simulation/cancellation";
import type { RestingOrder } from "../src/simulation/types";

const order = (id: number, side: RestingOrder["side"], price: number): RestingOrder => ({
  id,
  side,
  price,
  size: 1,
  createdAt: 0,
});

const ignoreOrderSubscription = (): void => {};

test("cancellation returns false when there are no resting orders for the side", () => {
  const canceledOrders: RestingOrder[] = [];
  const state = createCancellationState({
    sampleOrderIndex: () => 0,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  expect(state.simulate("buy")).toBe(false);
  expect(canceledOrders).toEqual([]);
});

test("cancellation samples a simple order index from price-sorted resting orders", () => {
  const canceledOrders: RestingOrder[] = [];
  const state = createCancellationState({
    sampleOrderIndex: () => 1,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  state.addOrder(order(1, "buy", 0.99), ignoreOrderSubscription);
  state.addOrder(order(2, "buy", 0.97), ignoreOrderSubscription);
  state.addOrder(order(3, "buy", 0.98), ignoreOrderSubscription);

  expect(state.simulate("buy")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([3]);
  expect(state.getRestingOrders("buy").map((restingOrder) => restingOrder.id)).toEqual([2, 1]);
});

test("cancellation clamps sampled order indexes to the available orders", () => {
  const canceledOrders: RestingOrder[] = [];
  const state = createCancellationState({
    sampleOrderIndex: () => 99,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  state.addOrder(order(1, "sell", 1.01), ignoreOrderSubscription);
  state.addOrder(order(2, "sell", 1.02), ignoreOrderSubscription);

  expect(state.simulate("sell")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([2]);

  const lowIndexState = createCancellationState({
    sampleOrderIndex: () => -10,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  lowIndexState.addOrder(order(3, "sell", 1.01), ignoreOrderSubscription);
  lowIndexState.addOrder(order(4, "sell", 1.02), ignoreOrderSubscription);

  expect(lowIndexState.simulate("sell")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([2, 3]);
});

test("cancellation removes subscribed orders that leave the market first", () => {
  let onOrderChange: ((change: OrderBookChange) => void) | null = null;
  const state = createCancellationState({
    sampleOrderIndex: () => 0,
    onCancel: () => true,
  });
  const restingOrder = order(1, "buy", 0.99);

  state.addOrder(restingOrder, (_id, callback) => {
    onOrderChange = callback;
  });

  onOrderChange?.({ kind: "remove", order: restingOrder, side: "buy" });

  expect(state.getRestingOrders("buy")).toEqual([]);
  expect(state.simulate("buy")).toBe(false);
});
