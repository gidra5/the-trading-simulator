import { afterEach, expect, test, vi } from "vitest";
import {
  buildSamplingFixture,
  compareSamplers,
  indexApproximateWeights,
} from "./cancellation-sampling.helpers";

const strictErrorMargin = 0.000_01;

afterEach(() => {
  vi.restoreAllMocks();
});

test("precise cancellation sampler matches itself within the strict sampling diagnostics margin", async () => {
  const { cancellation, options, orders } = await buildSamplingFixture({ ticks: 16 });
  const preciseOrders = cancellation.getWeightedCancellationOrders(orders, options);
  const diagnostics = compareSamplers(preciseOrders, preciseOrders);

  expect(diagnostics.totalVariationDistance).toBeLessThanOrEqual(strictErrorMargin);

  for (const [feature, error] of Object.entries(diagnostics.featureErrors)) {
    expect(error, feature).toBeLessThanOrEqual(strictErrorMargin);
  }
}, 30_000);

test("index-based approximate sampler reports distribution and feature drift", async () => {
  const { cancellation, options, orders } = await buildSamplingFixture({ ticks: 16 });
  const preciseOrders = cancellation.getWeightedCancellationOrders(orders, options);
  const estimatedApproximateWeights = indexApproximateWeights(preciseOrders);
  const diagnostics = compareSamplers(preciseOrders, estimatedApproximateWeights);
  const featureErrors = Object.values(diagnostics.featureErrors);

  expect(diagnostics.totalVariationDistance).toBeGreaterThan(strictErrorMargin);
  expect(featureErrors.every(Number.isFinite)).toBe(true);
  expect(featureErrors.some((error) => error > strictErrorMargin)).toBe(true);
}, 30_000);

test("age-proposal approximate cancellation sampler reports accuracy and resampling diagnostics", async () => {
  const { cancellation, options, orders } = await buildSamplingFixture({ ticks: 16 });
  const preciseOrders = cancellation.getWeightedCancellationOrders(orders, options);
  const approximate = cancellation.getResampledApproximateWeightedCancellationOrders(orders, options, {
    candidateCount: 64,
    sampleCount: 8192,
  });
  const diagnostics = compareSamplers(preciseOrders, approximate.orders);
  const featureErrors = Object.values(diagnostics.featureErrors);

  expect(approximate.diagnostics.candidateCount).toBe(64);
  expect(approximate.diagnostics.sampleCount).toBe(8192);
  expect(approximate.diagnostics.uniqueCandidateCount).toBeGreaterThan(0);
  expect(approximate.diagnostics.candidateCoverage).toBeGreaterThan(0.1);
  expect(approximate.diagnostics.effectiveSampleSize).toBeGreaterThan(20);
  expect(approximate.diagnostics.minWeightRatio).toBeGreaterThan(0);
  expect(approximate.diagnostics.maxWeightRatio).toBeGreaterThanOrEqual(approximate.diagnostics.minWeightRatio);
  expect(approximate.diagnostics.weightRatioSpread).toBeGreaterThanOrEqual(1);
  expect(diagnostics.totalVariationDistance).toBeLessThan(0.5);
  expect(Math.max(...featureErrors)).toBeLessThan(0.1);
}, 30_000);
