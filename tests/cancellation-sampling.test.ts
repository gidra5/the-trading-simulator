import { expect, test } from "vitest";
import { createCancellationState } from "../src/simulation/cancellation";
import type { RestingOrder } from "../src/simulation/types";

type OwnedOrders = { buy: RestingOrder[]; sell: RestingOrder[] };

const order = (id: number, side: RestingOrder["side"], price: number): RestingOrder => ({
  id,
  side,
  price,
  size: 1,
  createdAt: 0,
});

test("cancellation returns false when there are no resting orders for the side", () => {
  const ownedOrders: OwnedOrders = { buy: [], sell: [] };
  const canceledOrders: RestingOrder[] = [];
  const state = createCancellationState({
    ownedOrders: () => ownedOrders,
    removeOrder: () => {},
    candidatesCount: () => 0,
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
  const ownedOrders: OwnedOrders = {
    buy: [order(2, "buy", 0.97), order(3, "buy", 0.98), order(1, "buy", 0.99)],
    sell: [],
  };
  const canceledOrders: RestingOrder[] = [];
  const state = createCancellationState({
    candidatesCount: () => 0,
    ownedOrders: () => ownedOrders,
    removeOrder: (canceledOrder) => {
      ownedOrders[canceledOrder.side] = ownedOrders[canceledOrder.side].filter(
        (order) => order.id !== canceledOrder.id,
      );
    },
    sampleOrderIndex: () => 1,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  expect(state.simulate("buy")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([3]);
  expect(ownedOrders.buy.map((restingOrder) => restingOrder.id)).toEqual([2, 1]);
});

test("cancellation clamps sampled order indexes to the available orders", () => {
  const ownedOrders: OwnedOrders = {
    buy: [],
    sell: [order(1, "sell", 1.01), order(2, "sell", 1.02)],
  };
  const canceledOrders: RestingOrder[] = [];
  const removeOrder = (canceledOrder: RestingOrder): void => {
    ownedOrders[canceledOrder.side] = ownedOrders[canceledOrder.side].filter((order) => order.id !== canceledOrder.id);
  };
  const state = createCancellationState({
    candidatesCount: () => 0,
    ownedOrders: () => ownedOrders,
    removeOrder,
    sampleOrderIndex: () => 99,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  expect(state.simulate("sell")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([2]);

  ownedOrders.sell = [order(3, "sell", 1.01), order(4, "sell", 1.02)];
  const lowIndexState = createCancellationState({
    candidatesCount: () => 0,
    ownedOrders: () => ownedOrders,
    removeOrder,
    sampleOrderIndex: () => -10,
    onCancel: (canceledOrder) => {
      canceledOrders.push(canceledOrder);
      return true;
    },
  });

  expect(lowIndexState.simulate("sell")).toBe(true);
  expect(canceledOrders.map((canceledOrder) => canceledOrder.id)).toEqual([2, 3]);
});
