import { expect, test } from "vitest";
import { createRng, createRngSeed } from "../src/rng";

const sampleSequence = (seed: number): number[] => {
  const rng = createRng(seed);

  return Array.from({ length: 5 }, rng.sample);
};

test("seeded rng repeats the same sequence for the same seed", () => {
  expect(sampleSequence(0x5eed)).toEqual(sampleSequence(0x5eed));
});

test("seeded rng changes the sequence for different seeds", () => {
  expect(sampleSequence(0x5eed)).not.toEqual(sampleSequence(0x5eee));
});

test("rng restores from a snapshot", () => {
  const expected = createRng(0x5eed);
  const restored = createRng(0x5eed);

  expected.sample();
  restored.sample();
  const snapshot = restored.snapshot();

  const expectedNext = expected.sample();
  restored.sample();
  restored.restore(snapshot);

  expect(restored.sample()).toBe(expectedNext);
});

test("rng seed generator returns a uint32 seed", () => {
  const seed = createRngSeed();

  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBeGreaterThanOrEqual(0);
  expect(seed).toBeLessThan(2 ** 32);
});
