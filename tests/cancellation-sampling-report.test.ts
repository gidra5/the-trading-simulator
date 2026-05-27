import { createRoot } from "solid-js";
import { afterEach, expect, test, vi } from "vitest";
import { createOrchestrator } from "../src/simulation/orchestrator";
import {
  cloneMarketModelSettings,
  defaultMarketModelSettings,
  type OrderSelectionDistribution,
} from "../src/simulation/types";

const sampleCount = 20_000;
const orderCount = 100;

type DistributionMeasurement = {
  centerBucketShare: number;
  distribution: OrderSelectionDistribution;
  max: number;
  mean: number;
  min: number;
  standardDeviation: number;
};

const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;

  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
};

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);

const standardDeviation = (values: number[]): number => {
  if (values.length <= 1) return 0;

  const mean = average(values);
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const measureDistribution = (distribution: OrderSelectionDistribution): DistributionMeasurement => {
  return createRoot((dispose) => {
    const orchestrator = createOrchestrator();
    const settings = cloneMarketModelSettings(defaultMarketModelSettings);
    settings.cancellationSelectionCenter = 0.5;
    settings.cancellationSelectionStandardDeviation = 0.15;
    orchestrator.setMarketModelSettings(settings);
    orchestrator.setOrderSelectionDistribution(distribution);

    const samples = Array.from({ length: sampleCount }, () => orchestrator.cancellation.sampleOrderIndex(orderCount));
    const centerBucketSamples = samples.filter((sample) => sample >= 40 && sample < 60);
    const measurement = {
      centerBucketShare: centerBucketSamples.length / samples.length,
      distribution,
      max: Math.max(...samples),
      mean: average(samples),
      min: Math.min(...samples),
      standardDeviation: standardDeviation(samples),
    };

    dispose();
    return measurement;
  });
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("print cancellation order selection measurements", () => {
  vi.spyOn(Math, "random").mockImplementation(seededRandom(0x5eed));

  const measurements: DistributionMeasurement[] = [measureDistribution("uniform"), measureDistribution("normal")];

  console.table(
    measurements.map((measurement) => ({
      distribution: measurement.distribution,
      min: measurement.min.toFixed(0),
      max: measurement.max.toFixed(0),
      mean: measurement.mean.toFixed(2),
      "std dev": measurement.standardDeviation.toFixed(2),
      "center 20%": `${(measurement.centerBucketShare * 100).toFixed(2)}%`,
    })),
  );

  const [uniform, normal] = measurements;
  expect(uniform).toBeDefined();
  expect(normal).toBeDefined();
  expect(normal!.centerBucketShare).toBeGreaterThan(uniform!.centerBucketShare);
});
