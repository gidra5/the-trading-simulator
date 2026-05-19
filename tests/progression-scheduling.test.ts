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

  progression.scheduler.toggle(ProgressionNode.Handwork);
  progression.scheduler.toggle(ProgressionNode.Hardworking);

  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBe(1);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(2);

  progression.scheduler.toggle(ProgressionNode.Handwork);

  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(1);
});

test("progression nodes can be added to the start of the schedule", () => {
  const { progression } = createTestProgression();

  progression.scheduler.toggle(ProgressionNode.Handwork);
  progression.scheduler.scheduleFirst(ProgressionNode.Hardworking);

  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(1);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBe(2);

  progression.scheduler.scheduleFirst(ProgressionNode.Handwork);

  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBe(1);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(2);
});

test("progression scheduled nodes can be moved earlier and later", () => {
  const { progression } = createTestProgression();

  progression.scheduler.toggle(ProgressionNode.Handwork);
  progression.scheduler.toggle(ProgressionNode.Hardworking);

  expect(progression.scheduler.nodes()).toEqual([ProgressionNode.Handwork, ProgressionNode.Hardworking]);

  progression.scheduler.move(ProgressionNode.Hardworking, -1);

  expect(progression.scheduler.nodes()).toEqual([ProgressionNode.Hardworking, ProgressionNode.Handwork]);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(1);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBe(2);

  progression.scheduler.move(ProgressionNode.Hardworking, 1);

  expect(progression.scheduler.nodes()).toEqual([ProgressionNode.Handwork, ProgressionNode.Hardworking]);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBe(1);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(2);
});

test("progression schedule completes queued nodes when their requirements are met", () => {
  const { inventory, progression } = createTestProgression();
  const handworkPrice = progressionGraph[ProgressionNode.Handwork].prices[Resource.Money]!;

  progression.scheduler.toggle(ProgressionNode.Handwork);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(false);

  inventory.addResource(Resource.Money, handworkPrice);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(true);
  expect(inventory.resources().Money).toBe(0);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
});

test("progression schedule completes nodes in queue order", () => {
  const { inventory, progression } = createTestProgression();
  const handworkPrice = progressionGraph[ProgressionNode.Handwork].prices[Resource.Money]!;
  const hardworkingMilestone = progressionGraph[ProgressionNode.Hardworking].milestones[ProgressionMetric.Handwork]!;

  progression.scheduler.toggle(ProgressionNode.Handwork);
  progression.scheduler.toggle(ProgressionNode.Hardworking);
  progression.addMetric(ProgressionMetric.Handwork, hardworkingMilestone);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(false);
  expect(progression.isComplete(ProgressionNode.Hardworking)).toBe(false);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBe(2);

  inventory.addResource(Resource.Money, handworkPrice);

  expect(progression.isComplete(ProgressionNode.Handwork)).toBe(true);
  expect(progression.isComplete(ProgressionNode.Hardworking)).toBe(true);
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Handwork)).toBeUndefined();
  expect(progression.scheduler.getNodeOrder(ProgressionNode.Hardworking)).toBeUndefined();
});
