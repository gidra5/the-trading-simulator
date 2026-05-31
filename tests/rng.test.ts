import { expect, test } from "vitest";
import { createRng, createRngSeed } from "../src/rng";

const sampleSequence = (seed: number): number[] => {
  const rng = createRng(seed);

  return Array.from({ length: 5 }, rng);
};

test("seeded rng repeats the same sequence for the same seed", () => {
  expect(sampleSequence(0x5eed)).toEqual(sampleSequence(0x5eed));
});

test("seeded rng changes the sequence for different seeds", () => {
  expect(sampleSequence(0x5eed)).not.toEqual(sampleSequence(0x5eee));
});

test("rng seed generator returns a uint32 seed", () => {
  const seed = createRngSeed();

  expect(Number.isInteger(seed)).toBe(true);
  expect(seed).toBeGreaterThanOrEqual(0);
  expect(seed).toBeLessThan(2 ** 32);
});
