import { afterEach, test, vi } from "vitest";
import {
  buildSamplingFixture,
  compareSamplers,
  empiricalSampleWeights,
  indexApproximateWeights,
  totalWeight,
} from "./cancellation-sampling.helpers";
import type { WeightedCancellationOrder } from "../src/simulation/cancellation";

type ComparisonRow = {
  comparison: string;
  candidates: string;
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

const formatNumber = (value: number, digits = 4): string => {
  if (!Number.isFinite(value)) return String(value);
  if (Math.abs(value) >= 1000) return value.toFixed(0);
  return value.toFixed(digits);
};

const formatPercent = (value: number): string => `${formatNumber(value * 100, 2)}%`;

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
): ComparisonRow => {
  const comparisonDiagnostics = compareSamplers(preciseOrders, approximateOrders);
  const featureErrors = Object.values(comparisonDiagnostics.featureErrors);
  const maxFeatureError = Math.max(...featureErrors);
  const avgFeatureError = featureErrors.reduce((total, error) => total + error, 0) / featureErrors.length;
  const empiricalCoverage = measureExactWeightCoverage(preciseOrders, approximateOrders);

  return {
    comparison,
    candidates: diagnostics ? String(diagnostics.candidateCount) : "-",
    unique: diagnostics ? String(diagnostics.uniqueCandidateCount) : String(approximateOrders.length),
    candidatesCoverage: diagnostics ? formatPercent(diagnostics.candidateCoverage) : "-",
    coverage: formatPercent(empiricalCoverage),
    ess: diagnostics ? formatNumber(diagnostics.effectiveSampleSize, 2) : "-",
    ratioSpread: diagnostics ? formatNumber(diagnostics.weightRatioSpread, 2) : "-",
    tvd: formatNumber(comparisonDiagnostics.totalVariationDistance, 6),
    excessTvd: formatNumber(comparisonDiagnostics.totalVariationDistance - baselineTvd, 6),
    maxFeatureError: formatPercent(maxFeatureError),
    avgFeatureError: formatPercent(avgFeatureError),
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

test("print cancellation sampling comparison measurements", { timeout: 60_000 }, async () => {
  const { cancellation, options, orders } = await buildSamplingFixture({ ticks: 128 });
  const preciseOrders = cancellation.getWeightedCancellationOrders(orders, options);
  const empiricalSampleCount = 8 * orders.length;
  const empiricalPreciseOrders = empiricalSampleWeights(preciseOrders, empiricalSampleCount);
  const empiricalPreciseDiagnostics = compareSamplers(preciseOrders, empiricalPreciseOrders);
  const baselineTvd = empiricalPreciseDiagnostics.totalVariationDistance;
  const rows: ComparisonRow[] = [
    makeComparisonRow("precise empirical", preciseOrders, empiricalPreciseOrders, baselineTvd, {
      candidateCount: preciseOrders.length,
      uniqueCandidateCount: empiricalPreciseOrders.length,
      candidateCoverage: 1,
      effectiveSampleSize: empiricalPreciseOrders.length,
      weightRatioSpread: 1,
    }),
    makeComparisonRow("index proposal", preciseOrders, indexApproximateWeights(preciseOrders), baselineTvd),
  ];

    const approximate = cancellation.getResampledApproximateWeightedCancellationOrders(orders, options, {
      candidateCount: 4,
      sampleCount: empiricalSampleCount,
    });
    rows.push(
      makeComparisonRow(`approximate`, preciseOrders, approximate.orders, baselineTvd, approximate.diagnostics),
    );

  console.log(`\nCancellation sampling comparison measurements (${orders.length} resting orders)`);
  console.table(rows);
});
