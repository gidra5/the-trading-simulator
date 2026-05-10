import { afterEach, test, vi } from "vitest";
import {
  buildSamplingFixture,
  compareSamplers,
  empiricalSampleWeights,
  totalWeight,
} from "./cancellation-sampling.helpers";
import type { WeightedCancellationOrder } from "../src/simulation/cancellation";

type ComparisonRow = {
  comparison: string;
  // candidates: string;
  unique: string;
  candidatesCoverage: string;
  coverage: string;
  ess: string;
  ratioSpread: string;
  tvd: string;
  excessTvd: string;
  maxFeatureError: string;
  avgFeatureError: string;
};

// type DistributionRow = Pick<ComparisonRow, "comparison" | "candidates" | "unique" | "candidatesCoverage" | "coverage">;
type DistributionRow = Pick<ComparisonRow, "comparison" | "unique" | "candidatesCoverage" | "coverage">;
type AccuracyRow = Pick<ComparisonRow, "comparison" | "ess" | "ratioSpread" | "tvd" | "excessTvd" | "maxFeatureError" | "avgFeatureError">;

type NumericComparisonRow = {
  comparison: string;
  // candidates: number;
  unique: number;
  candidatesCoverage: number;
  coverage: number;
  ess: number;
  ratioSpread: number;
  tvd: number;
  excessTvd: number;
  maxFeatureError: number;
  avgFeatureError: number;
};

type OrderBookProfileBin = {
  minDistance: number;
  maxDistance: number;
  buySize: number;
  sellSize: number;
};

type SignedDistanceDistributionBin = {
  minDistance: number;
  maxDistance: number;
  value: number;
};

const formatNumber = (value: number, digits = 4): string => {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(digits);
};

const average = (values: number[]): number =>
  values.reduce((total, value) => total + value, 0) / Math.max(1, values.length);

const standardDeviation = (values: number[]): number => {
  if (values.length <= 1) return 0;

  const mean = average(values);
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const formatMeanStdDev = (values: number[], formatter = formatNumber): string =>
  `${formatter(average(values))} +/- ${formatter(standardDeviation(values))}`;

const formatPercent = (value: number): string => `${formatNumber(value * 100, 2)}%`;

const getSpread = (values: number[]): number => {
  const positiveValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (positiveValues.length === 0) return 0;

  return Math.max(...positiveValues) / Math.min(...positiveValues);
};

const makeBar = (value: number, maxValue: number, width = 36): string => {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || value <= 0 || maxValue <= 0) return "";

  return "#".repeat(Math.max(1, Math.round((value / maxValue) * width)));
};

const printExactDistributionShape = (preciseOrders: WeightedCancellationOrder[]): void => {
  const total = totalWeight(preciseOrders);
  if (total <= 0) return;

  const probabilityBySignedDistance = preciseOrders.map((order) => ({
    distance: getSignedDistanceFromMid(order),
    probability: order.weight / total,
  }));
  const maxAbsDistance = Math.max(...probabilityBySignedDistance.map((entry) => Math.abs(entry.distance)));
  const safeMaxAbsDistance = Math.max(maxAbsDistance, Number.EPSILON);
  const distanceBinCount = 12;
  const distanceBins = Array.from({ length: distanceBinCount }, (_, index) => ({
    min: -safeMaxAbsDistance + (2 * safeMaxAbsDistance * index) / distanceBinCount,
    max: -safeMaxAbsDistance + (2 * safeMaxAbsDistance * (index + 1)) / distanceBinCount,
    mass: 0,
    count: 0,
  }));

  for (const entry of probabilityBySignedDistance) {
    const index = Math.min(
      distanceBinCount - 1,
      Math.max(0, Math.floor(((entry.distance + safeMaxAbsDistance) / (2 * safeMaxAbsDistance)) * distanceBinCount)),
    );
    const bin = distanceBins[index];
    if (!bin) continue;

    bin.mass += entry.probability;
    bin.count += 1;
  }

  const maxMass = Math.max(...distanceBins.map((bin) => bin.mass));
  console.log("\nExact cancellation probability mass by signed distance-from-mid bucket (first iteration)");
  for (let index = distanceBins.length - 1; index >= 0; index -= 1) {
    const bin = distanceBins[index];
    if (!bin) continue;

    console.log(
      `${formatPercent(bin.min).padStart(8)}..${formatPercent(bin.max).padStart(8)} | ${makeBar(bin.mass, maxMass)} ${formatPercent(bin.mass)} (${bin.count})`,
    );
  }
};

const buildCancellationProbabilityDistribution = (
  preciseOrders: WeightedCancellationOrder[],
  maxAbsDistance: number,
  binCount: number,
): SignedDistanceDistributionBin[] => {
  const total = totalWeight(preciseOrders);

  return buildSignedDistanceDistribution(
    preciseOrders,
    maxAbsDistance,
    binCount,
    (order) => (total > 0 ? order.weight / total : 0),
    false,
  );
};

const getSignedDistanceFromMid = (order: WeightedCancellationOrder): number => {
  const sign = order.order.side === "buy" ? -1 : 1;
  return sign * order.features.distanceFromMid;
};

const buildOrderBookProfile = (
  preciseOrders: WeightedCancellationOrder[],
  maxAbsDistance: number,
  binCount: number,
): OrderBookProfileBin[] => {
  const safeMaxAbsDistance = Math.max(maxAbsDistance, Number.EPSILON);
  const bins = Array.from({ length: binCount }, (_, index) => {
    const minDistance = -safeMaxAbsDistance + (2 * safeMaxAbsDistance * index) / binCount;
    const maxDistance = -safeMaxAbsDistance + (2 * safeMaxAbsDistance * (index + 1)) / binCount;

    return {
      minDistance,
      maxDistance,
      buySize: 0,
      sellSize: 0,
    };
  });

  for (const order of preciseOrders) {
    const signedDistance = getSignedDistanceFromMid(order);
    const binIndex = Math.min(
      binCount - 1,
      Math.max(0, Math.floor(((signedDistance + safeMaxAbsDistance) / (2 * safeMaxAbsDistance)) * binCount)),
    );
    const bin = bins[binIndex];
    if (!bin) continue;

    if (order.order.side === "buy") bin.buySize += order.order.size;
    else bin.sellSize += order.order.size;
  }

  return bins;
};

const averageOrderBookProfiles = (profiles: OrderBookProfileBin[][]): OrderBookProfileBin[] => {
  const firstProfile = profiles[0];
  if (!firstProfile) return [];

  return firstProfile.map((firstBin, index) => {
    const matchingBins = profiles.map((profile) => profile[index]).filter((bin): bin is OrderBookProfileBin => !!bin);

    return {
      minDistance: firstBin.minDistance,
      maxDistance: firstBin.maxDistance,
      buySize: average(matchingBins.map((bin) => bin.buySize)),
      sellSize: average(matchingBins.map((bin) => bin.sellSize)),
    };
  });
};

const printOrderBookProfile = (title: string, profile: OrderBookProfileBin[]): void => {
  const maxSize = Math.max(...profile.flatMap((bin) => [bin.buySize, bin.sellSize]), 0);
  const barWidth = 24;

  console.log(`\n${title}`);
  console.log(`${"buy volume".padStart(barWidth)} | ${"distance from mid".padStart(21)} | sell volume`);

  for (let index = profile.length - 1; index >= 0; index -= 1) {
    const bin = profile[index];
    if (!bin) continue;

    const buyBar = makeBar(bin.buySize, maxSize, barWidth).padStart(barWidth);
    const sellBar = makeBar(bin.sellSize, maxSize, barWidth).padEnd(barWidth);
    const distance = `${formatPercent(bin.minDistance)}..${formatPercent(bin.maxDistance)}`.padStart(21);

    console.log(`${buyBar} | ${distance} | ${sellBar} ${formatNumber(bin.buySize + bin.sellSize, 2)}`);
  }
};

const buildSignedDistanceDistribution = (
  preciseOrders: WeightedCancellationOrder[],
  maxAbsDistance: number,
  binCount: number,
  getValue: (order: WeightedCancellationOrder) => number,
  normalize = true,
): SignedDistanceDistributionBin[] => {
  const safeMaxAbsDistance = Math.max(maxAbsDistance, Number.EPSILON);
  const bins = Array.from({ length: binCount }, (_, index) => {
    const minDistance = -safeMaxAbsDistance + (2 * safeMaxAbsDistance * index) / binCount;
    const maxDistance = -safeMaxAbsDistance + (2 * safeMaxAbsDistance * (index + 1)) / binCount;

    return { minDistance, maxDistance, value: 0 };
  });

  for (const order of preciseOrders) {
    const signedDistance = getSignedDistanceFromMid(order);
    const binIndex = Math.min(
      binCount - 1,
      Math.max(0, Math.floor(((signedDistance + safeMaxAbsDistance) / (2 * safeMaxAbsDistance)) * binCount)),
    );
    const bin = bins[binIndex];
    if (!bin) continue;

    bin.value += getValue(order);
  }

  const total = bins.reduce((sum, bin) => sum + bin.value, 0);
  if (normalize && total > 0) {
    for (const bin of bins) {
      bin.value /= total;
    }
  }

  return bins;
};

const averageSignedDistanceDistributions = (
  distributions: SignedDistanceDistributionBin[][],
): SignedDistanceDistributionBin[] => {
  const firstDistribution = distributions[0];
  if (!firstDistribution) return [];

  return firstDistribution.map((firstBin, index) => {
    const matchingBins = distributions
      .map((distribution) => distribution[index])
      .filter((bin): bin is SignedDistanceDistributionBin => !!bin);

    return {
      minDistance: firstBin.minDistance,
      maxDistance: firstBin.maxDistance,
      value: average(matchingBins.map((bin) => bin.value)),
    };
  });
};

const printSignedDistanceDistribution = (title: string, distribution: SignedDistanceDistributionBin[]): void => {
  const maxValue = Math.max(...distribution.map((bin) => bin.value), 0);

  console.log(`\n${title}`);
  for (let index = distribution.length - 1; index >= 0; index -= 1) {
    const bin = distribution[index];
    if (!bin) continue;

    const distance = `${formatPercent(bin.minDistance)}..${formatPercent(bin.maxDistance)}`.padStart(21);
    console.log(`${distance} | ${makeBar(bin.value, maxValue)} ${formatPercent(bin.value)}`);
  }
};

const measureExactWeightCoverage = (
  preciseOrders: WeightedCancellationOrder[],
  approximateOrders: WeightedCancellationOrder[],
): number => {
  const preciseTotalWeight = totalWeight(preciseOrders);
  if (preciseTotalWeight <= 0) return 0;

  const approximateOrderIds = new Set(approximateOrders.map((order) => order.order.id));

  return (
    preciseOrders.reduce((total, order) => total + (approximateOrderIds.has(order.order.id) ? order.weight : 0), 0) /
    preciseTotalWeight
  );
};

const makeComparisonRow = (
  comparison: string,
  preciseOrders: WeightedCancellationOrder[],
  approximateOrders: WeightedCancellationOrder[],
  baselineTvd: number,
  diagnostics?: {
    candidateCount: number;
    uniqueCandidateCount: number;
    candidateCoverage: number;
    effectiveSampleSize: number;
    weightRatioSpread: number;
  },
): NumericComparisonRow => {
  const comparisonDiagnostics = compareSamplers(preciseOrders, approximateOrders);
  const featureErrors = Object.values(comparisonDiagnostics.featureErrors);
  const maxFeatureError = Math.max(...featureErrors);
  const avgFeatureError = featureErrors.reduce((total, error) => total + error, 0) / featureErrors.length;
  const empiricalCoverage = measureExactWeightCoverage(preciseOrders, approximateOrders);

  return {
    comparison,
    // candidates: diagnostics?.candidateCount ?? preciseOrders.length,
    unique: diagnostics?.uniqueCandidateCount ?? approximateOrders.length,
    candidatesCoverage: diagnostics?.candidateCoverage ?? Number.NaN,
    coverage: empiricalCoverage,
    ess: diagnostics?.effectiveSampleSize ?? Number.NaN,
    ratioSpread: diagnostics?.weightRatioSpread ?? Number.NaN,
    tvd: comparisonDiagnostics.totalVariationDistance,
    excessTvd: comparisonDiagnostics.totalVariationDistance - baselineTvd,
    maxFeatureError,
    avgFeatureError,
  };
};

const summarizeRows = (rows: NumericComparisonRow[]): ComparisonRow[] => {
  const byComparison = new Map<string, NumericComparisonRow[]>();

  for (const row of rows) {
    byComparison.set(row.comparison, [...(byComparison.get(row.comparison) ?? []), row]);
  }

  return [...byComparison.entries()].map(([comparison, comparisonRows]) => ({
    comparison,
    // candidates: formatMeanStdDev(comparisonRows.map((row) => row.candidates)),
    unique: formatMeanStdDev(comparisonRows.map((row) => row.unique)),
    candidatesCoverage: formatMeanStdDev(
      comparisonRows.map((row) => row.candidatesCoverage).filter(Number.isFinite),
      formatPercent,
    ),
    coverage: formatMeanStdDev(comparisonRows.map((row) => row.coverage).filter(Number.isFinite), formatPercent),
    ess: formatMeanStdDev(comparisonRows.map((row) => row.ess).filter(Number.isFinite), (value) =>
      formatNumber(value, 2),
    ),
    ratioSpread: formatMeanStdDev(comparisonRows.map((row) => row.ratioSpread).filter(Number.isFinite), (value) =>
      formatNumber(value, 2),
    ),
    tvd: formatMeanStdDev(
      comparisonRows.map((row) => row.tvd),
      (value) => formatNumber(value, 6),
    ),
    excessTvd: formatMeanStdDev(
      comparisonRows.map((row) => row.excessTvd),
      (value) => formatNumber(value, 6),
    ),
    maxFeatureError: formatMeanStdDev(
      comparisonRows.map((row) => row.maxFeatureError),
      formatPercent,
    ),
    avgFeatureError: formatMeanStdDev(
      comparisonRows.map((row) => row.avgFeatureError),
      formatPercent,
    ),
  }));
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("print cancellation sampling comparison measurements", { timeout: 120_000 }, async () => {
  const iterations = 4;
  const samplesPerOrder = 2;
  const candidateCount = 64;
  const ticks = 128;
  const rows: NumericComparisonRow[] = [];
  const orderCounts: number[] = [];
  const targetWeightSpreads: number[] = [];
  let firstPreciseOrders: WeightedCancellationOrder[] | null = null;
  const preciseOrderRuns: WeightedCancellationOrder[][] = [];

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const { cancellation, options, orders } = await buildSamplingFixture({ seed: 0x5eed + iteration, ticks });
    const preciseOrders = cancellation.getWeightedCancellationOrders(orders, options);
    firstPreciseOrders ??= preciseOrders;
    preciseOrderRuns.push(preciseOrders);
    const empiricalSampleCount = samplesPerOrder * orders.length;
    const empiricalPreciseOrders = empiricalSampleWeights(preciseOrders, empiricalSampleCount);
    const empiricalPreciseDiagnostics = compareSamplers(preciseOrders, empiricalPreciseOrders);
    const baselineTvd = empiricalPreciseDiagnostics.totalVariationDistance;
    orderCounts.push(orders.length);
    targetWeightSpreads.push(getSpread(preciseOrders.map((order) => order.weight)));

    rows.push(
      makeComparisonRow("precise empirical", preciseOrders, empiricalPreciseOrders, baselineTvd, {
        candidateCount: preciseOrders.length,
        uniqueCandidateCount: empiricalPreciseOrders.length,
        candidateCoverage: 1,
        effectiveSampleSize: empiricalPreciseOrders.length,
        weightRatioSpread: getSpread(preciseOrders.map((order) => order.weight)),
      }),
    );

    for (const proposal of ["exact", "age", "uniform"] as const) {
      const approximate = cancellation.getResampledApproximateWeightedCancellationOrders(orders, options, {
        candidateCount,
        proposal,
        sampleCount: empiricalSampleCount,
      });
      rows.push(
        makeComparisonRow(
          `${proposal} resampling`,
          preciseOrders,
          approximate.orders,
          baselineTvd,
          approximate.diagnostics,
        ),
      );
    }
  }

  console.log(
    `\nCancellation sampling comparison measurements (${iterations} iterations, ${samplesPerOrder} samples per order, ${formatMeanStdDev(orderCounts)} resting orders, ${candidateCount} candidates)`,
  );
  const summaryRows = summarizeRows(rows);
  const distributionRows: DistributionRow[] = summaryRows.map(
    ({ comparison, /* candidates, */ unique, candidatesCoverage, coverage }) => ({
      comparison,
      // candidates,
      unique,
      candidatesCoverage,
      coverage,
    }),
  );
  const accuracyRows: AccuracyRow[] = summaryRows.map(
    ({ comparison, ess, ratioSpread, tvd, excessTvd, maxFeatureError, avgFeatureError }) => ({
      comparison,
      ess,
      ratioSpread,
      tvd,
      excessTvd,
      maxFeatureError,
      avgFeatureError,
    }),
  );

  console.log("\nDistribution coverage");
  console.table(distributionRows);
  console.log("\nAccuracy and error");
  console.table(accuracyRows);

  // if (firstPreciseOrders) {
  //   printExactDistributionShape(firstPreciseOrders);

  //   const orderBookBinCount = 18;
  //   const maxAbsDistance = Math.max(
  //     ...preciseOrderRuns.flatMap((orders) => orders.map((order) => Math.abs(getSignedDistanceFromMid(order)))),
  //     0,
  //   );
  //   const profiles = preciseOrderRuns.map((orders) => buildOrderBookProfile(orders, maxAbsDistance, orderBookBinCount));
  //   const cancellationProbabilityDistributions = preciseOrderRuns.map((orders) =>
  //     buildCancellationProbabilityDistribution(orders, maxAbsDistance, orderBookBinCount),
  //   );
  //   const countDistributions = preciseOrderRuns.map((orders) =>
  //     buildSignedDistanceDistribution(orders, maxAbsDistance, orderBookBinCount, () => 1),
  //   );
  //   const ageProposalDistributions = preciseOrderRuns.map((orders) =>
  //     buildSignedDistanceDistribution(orders, maxAbsDistance, orderBookBinCount, (order) => order.features.age),
  //   );
  //   const uniformProposalDistributions = preciseOrderRuns.map((orders) =>
  //     buildSignedDistanceDistribution(orders, maxAbsDistance, orderBookBinCount, () => 1),
  //   );

  //   printOrderBookProfile("Order book volume by signed distance from mid (first iteration)", profiles[0] ?? []);
  //   printOrderBookProfile(
  //     `Average order book volume by signed distance from mid (${iterations} iterations)`,
  //     averageOrderBookProfiles(profiles),
  //   );
  //   printSignedDistanceDistribution(
  //     `Average exact cancellation probability mass by signed distance from mid (${iterations} iterations)`,
  //     averageSignedDistanceDistributions(cancellationProbabilityDistributions),
  //   );
  //   printSignedDistanceDistribution(
  //     "Resting order count distribution by signed distance from mid (first iteration)",
  //     countDistributions[0] ?? [],
  //   );
  //   printSignedDistanceDistribution(
  //     `Average resting order count distribution by signed distance from mid (${iterations} iterations)`,
  //     averageSignedDistanceDistributions(countDistributions),
  //   );
  //   printSignedDistanceDistribution(
  //     "Age proposal distribution by signed distance from mid (first iteration)",
  //     ageProposalDistributions[0] ?? [],
  //   );
  //   printSignedDistanceDistribution(
  //     `Average age proposal distribution by signed distance from mid (${iterations} iterations)`,
  //     averageSignedDistanceDistributions(ageProposalDistributions),
  //   );
  //   printSignedDistanceDistribution(
  //     "Uniform proposal distribution by signed distance from mid (first iteration)",
  //     uniformProposalDistributions[0] ?? [],
  //   );
  //   printSignedDistanceDistribution(
  //     `Average uniform proposal distribution by signed distance from mid (${iterations} iterations)`,
  //     averageSignedDistanceDistributions(uniformProposalDistributions),
  //   );
  // }
});
