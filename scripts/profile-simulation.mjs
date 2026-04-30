import { build } from "esbuild";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = resolve(root, "node_modules/.cache/simulation-profile");
const entry = resolve(tempDir, "entry.ts");
const bundled = resolve(tempDir, "entry.mjs");
const tickMs = 200;
const sampleEveryTicks = 50;
const orderBookDeltaSnapshotInterval = Number(process.env.SIM_ORDER_BOOK_DELTA_INTERVAL);
const orderBookDeltaSnapshotFanout = Number(process.env.SIM_ORDER_BOOK_DELTA_FANOUT);
const orderBookDeltaSnapshotLevels = Number(process.env.SIM_ORDER_BOOK_DELTA_LEVELS);
const randomSeed = Number(process.env.SIM_RANDOM_SEED);
const orderBookRegionResolution = (process.env.SIM_ORDER_BOOK_REGION_RESOLUTION ?? "")
  .split("x")
  .map((value) => Number(value));

const durations = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);
const durationMinutes = durations.length > 0 ? durations : [1, 2, 3, 5];

await rm(tempDir, { recursive: true, force: true });
await mkdir(tempDir, { recursive: true });

await writeFile(
  entry,
  `
let simulatedNow = Date.now();
Date.now = () => simulatedNow;

const seededRandom = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const randomSeed = ${JSON.stringify(randomSeed)};
if (Number.isFinite(randomSeed)) {
  Math.random = seededRandom(randomSeed);
}

const formatMb = (bytes: number) => bytes / 1024 / 1024;

const runProfile = async (durationMinutes: number[]) => {
  const [{ TradingSimulation }, market] = await Promise.all([
    import("${resolve(root, "src/simulation/index.ts")}"),
    import("${resolve(root, "src/market/index.ts")}"),
  ]);
  const orderBookDeltaSnapshotInterval = ${JSON.stringify(orderBookDeltaSnapshotInterval)};
  const orderBookDeltaSnapshotFanout = ${JSON.stringify(orderBookDeltaSnapshotFanout)};
  const orderBookDeltaSnapshotLevels = ${JSON.stringify(orderBookDeltaSnapshotLevels)};
  const orderBookRegionResolutionInput = ${JSON.stringify(orderBookRegionResolution)};
  const orderBookRegionResolution = [
    Number.isFinite(orderBookRegionResolutionInput[0]) && orderBookRegionResolutionInput[0] > 0
      ? Math.floor(orderBookRegionResolutionInput[0])
      : 120,
    Number.isFinite(orderBookRegionResolutionInput[1]) && orderBookRegionResolutionInput[1] > 0
      ? Math.floor(orderBookRegionResolutionInput[1])
      : 120,
  ];

  if (Number.isFinite(orderBookDeltaSnapshotInterval) && orderBookDeltaSnapshotInterval > 0) {
    market.setOrderBookDeltaSnapshotInterval(orderBookDeltaSnapshotInterval);
  }

  if (Number.isFinite(orderBookDeltaSnapshotFanout) && orderBookDeltaSnapshotFanout >= 2) {
    market.setOrderBookDeltaSnapshotFanout(orderBookDeltaSnapshotFanout);
  }

  if (Number.isFinite(orderBookDeltaSnapshotLevels) && orderBookDeltaSnapshotLevels > 0) {
    market.setOrderBookDeltaSnapshotLevels(orderBookDeltaSnapshotLevels);
  }

  const results = [];

  for (const minutes of durationMinutes) {
    const simulation = new TradingSimulation();
    const ticks = Math.round((minutes * 60 * 1000) / ${tickMs});
    const samples = [];
    let tickTimeMs = 0;

    globalThis.gc?.();
    const startMemory = process.memoryUsage();
    const start = performance.now();

    for (let tick = 1; tick <= ticks; tick += 1) {
      const tickStart = performance.now();
      simulation.tick(${tickMs});
      tickTimeMs += performance.now() - tickStart;
      simulatedNow += ${tickMs};

      if (tick % ${sampleEveryTicks} === 0 || tick === ticks) {
        const memory = process.memoryUsage();
        samples.push({
          tick,
          simulatedSeconds: (tick * ${tickMs}) / 1000,
          heapUsedMb: formatMb(memory.heapUsed),
          rssMb: formatMb(memory.rss),
          spread: market.marketPriceSpread(),
        });
      }
    }

    globalThis.gc?.();
    const endMemory = process.memoryUsage();
    const elapsedMs = performance.now() - start;
    const histogram = market.getOrderBookHistogram({
      price: [0, 2],
      resolution: 200,
    });
    const depthSize = histogram.reduce((total, entry) => total + entry.size, 0);
    const regionStart = simulatedNow - minutes * 60 * 1000;
    const regionEnd = simulatedNow;
    const regionWindowMs = Math.min(60 * 1000, Math.max(regionEnd - regionStart, 1));
    const regionIterations = 25;
    let fullRegionTimeMs = 0;
    let tailRegionTimeMs = 0;
    let orderBookRegionError = null;
    let completedRegionIterations = 0;

    for (let index = 0; index < regionIterations; index += 1) {
      try {
        const fullRegionStart = performance.now();
        market.getOrderBookRegion({
          timestamp: [regionStart, regionEnd],
          price: [0, 2],
          resolution: orderBookRegionResolution,
        });
        fullRegionTimeMs += performance.now() - fullRegionStart;

        const tailRegionStart = performance.now();
        market.getOrderBookRegion({
          timestamp: [regionEnd - regionWindowMs, regionEnd],
          price: [0, 2],
          resolution: orderBookRegionResolution,
        });
        tailRegionTimeMs += performance.now() - tailRegionStart;
        completedRegionIterations += 1;
      } catch (error) {
        orderBookRegionError = error instanceof Error ? error.message : String(error);
        break;
      }
    }

    results.push({
      minutes,
      ticks,
      elapsedMs,
      tickTimeMs,
      avgTickMs: tickTimeMs / ticks,
      ticksPerSecondWall: ticks / (elapsedMs / 1000),
      startHeapUsedMb: formatMb(startMemory.heapUsed),
      endHeapUsedMb: formatMb(endMemory.heapUsed),
      endRssMb: formatMb(endMemory.rss),
      heapGrowthMb: formatMb(endMemory.heapUsed - startMemory.heapUsed),
      depthSize,
      orderBookRegion: {
        iterations: regionIterations,
        completedIterations: completedRegionIterations,
        resolution: orderBookRegionResolution,
        fullRangeAvgMs: completedRegionIterations > 0 ? fullRegionTimeMs / completedRegionIterations : null,
        tailRangeAvgMs: completedRegionIterations > 0 ? tailRegionTimeMs / completedRegionIterations : null,
        error: orderBookRegionError,
      },
      orderBookHistory: market.getOrderBookHistoryStats?.(),
      finalSpread: market.marketPriceSpread(),
      samples,
    });
  }

  return results;
};

const durations = JSON.parse(process.argv[2]);
console.log(JSON.stringify(await runProfile(durations), null, 2));
`,
);

await build({
  entryPoints: [entry],
  bundle: true,
  outfile: bundled,
  platform: "node",
  format: "esm",
  sourcemap: false,
  logLevel: "silent",
  external: ["solid-js"],
});

const moduleUrl = pathToFileURL(bundled).href;
const originalArgv = process.argv;
process.argv = [process.argv[0], bundled, JSON.stringify(durationMinutes)];
try {
  await import(`${moduleUrl}?t=${Date.now()}`);
} finally {
  process.argv = originalArgv;
}
