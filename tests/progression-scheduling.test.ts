import { createRoot } from "solid-js";
import { expect, test } from "vitest";
import { createInventory, Resource } from "../src/economy/inventory";
import { progressionGraph, ProgressionMetric, ProgressionNode } from "../src/progression/data";
import { createProgression } from "../src/progression/interface";

const createTestProgression = () =>
  createRoot(() => {
    const inventory = createInventory();
    const progression = createProgression(progressionGraph, inventory);
    return { inventory, progression };
  });

test("progression nodes can be added to and removed from the schedule", () => {
  const { progression } = createTestProgression();

  progression.toggleScheduledNode(ProgressionNode.Handwork);
  progression.toggleScheduledNode(ProgressionNode.Hardworking);

  expect(progression.getScheduledNodeOrder(ProgressionNode.Handwork)).toBe(1);
  expect(progression.getScheduledNodeOrder(ProgressionNode.Hardworking)).toBe(2);

  progression.toggleScheduledNode(ProgressionNode.Handwork);

  expect(progression.getScheduledNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
  expect(progression.getScheduledNodeOrder(ProgressionNode.Hardworking)).toBe(1);
});

test("progression schedule completes queued nodes when their requirements are met", () => {
  const { inventory, progression } = createTestProgression();

  progression.toggleScheduledNode(ProgressionNode.Handwork);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(false);

  inventory.addResource(Resource.Money, 5);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(true);
  expect(inventory.resources().Money).toBe(0);
  expect(progression.getScheduledNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
});

test("progression schedule completes nodes in queue order", () => {
  const { inventory, progression } = createTestProgression();

  progression.toggleScheduledNode(ProgressionNode.Handwork);
  progression.toggleScheduledNode(ProgressionNode.Hardworking);
  progression.addMetric(ProgressionMetric.Handwork, 50);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(false);
  expect(progression.isComplete(ProgressionNode.Hardworking)).toBe(false);
  expect(progression.getScheduledNodeOrder(ProgressionNode.Hardworking)).toBe(2);

  inventory.addResource(Resource.Money, 5);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(true);
  expect(progression.isComplete(ProgressionNode.Hardworking)).toBe(true);
  expect(progression.getScheduledNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
  expect(progression.getScheduledNodeOrder(ProgressionNode.Hardworking)).toBeUndefined();
});
