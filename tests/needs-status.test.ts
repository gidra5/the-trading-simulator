import { createRoot, createSignal } from "solid-js";
import { expect, test } from "vitest";
import { createNeeds, Need, NeedStatus, type Needs, type NeedThresholds } from "../src/economy/needs";

const baseNeeds: Needs = { Food: 100, Health: 100, Sleep: 100, Stress: 100 };
const thresholds = {
  Food: [0.35, 0.7, 0.9, 1.5],
  Health: [0.35, 0.7, 0.9, 1.5],
  Sleep: [0.35, 0.7, 0.9, 1.5],
  Stress: [0.35, 0.7, 0.9, 1.5],
} satisfies NeedThresholds;

const createTestNeeds = () =>
  createRoot(() =>
    createNeeds({
      base: () => baseNeeds,
      decayRates: () => ({ Food: 0, Health: 0, Sleep: 0, Stress: 0 }),
      dt: () => 0,
      thresholds: () => thresholds,
    }),
  );

const createDecayingTestNeeds = () =>
  createRoot(() => {
    const [dt, setDt] = createSignal(0, { equals: false });
    const needs = createNeeds({
      base: () => baseNeeds,
      decayRates: () => ({ Food: 0, Health: 1, Sleep: 0, Stress: 0 }),
      dt,
      thresholds: () => thresholds,
    });

    return { needs, tick: setDt };
  });

test("need status classifies ratios with configured thresholds", () => {
  const needs = createTestNeeds();

  needs.restore({
    needs: {
      Food: 96,
      Health: 80,
      Sleep: 50,
      Stress: 20,
    },
  });

  expect([Need.Food, Need.Sleep, Need.Health, Need.Stress].map((need) => [need, needs.needStatus(need)])).toEqual([
    [Need.Food, NeedStatus.Perfect],
    [Need.Sleep, NeedStatus.Warning],
    [Need.Health, NeedStatus.Ok],
    [Need.Stress, NeedStatus.Critical],
  ]);
});

test("need progress maps ratios into status bands", () => {
  const needs = createTestNeeds();

  needs.restore({
    needs: {
      Food: 160,
      Health: 96,
      Sleep: 80,
      Stress: 20,
    },
  });

  expect(needs.needProgress(Need.Food)).toBeCloseTo(1 - Math.exp(-0.1));
  expect(needs.needProgress(Need.Health)).toBeCloseTo((0.96 - 0.9) / (1.5 - 0.9));
  expect(needs.needProgress(Need.Sleep)).toBeCloseTo((0.8 - 0.7) / (0.9 - 0.7));
  expect(needs.needProgress(Need.Stress)).toBeCloseTo(0.2 / 0.35);
});

test("health does not decay when support needs are ok", () => {
  const { needs, tick } = createDecayingTestNeeds();

  needs.restore({
    needs: {
      Food: 70,
      Health: 80,
      Sleep: 70,
      Stress: 70,
    },
  });
  tick(1);

  expect(needs.needs()[Need.Health]).toBe(80);
});

test("health slowly recovers when support needs are perfect", () => {
  const { needs, tick } = createDecayingTestNeeds();

  needs.restore({
    needs: {
      Food: 90,
      Health: 80,
      Sleep: 90,
      Stress: 90,
    },
  });
  tick(1);

  expect(needs.needs()[Need.Health]).toBeGreaterThan(80);
});
