# Simulation Profiling Report

Date: 2026-04-28

## Delta Encoding Update

`orderBookMap` was refactored from full snapshots on every market change into a checkpointed delta log:

- Full snapshots are stored at revision 0 and then every 100 market-history revisions by default.
- The snapshot interval is configurable with `setOrderBookSnapshotInterval(interval)`.
- Non-snapshot entries store explicit change records:
  - `add`: a new resting order was added.
  - `remove`: a resting order was fully removed by fill or cancellation.
  - `partial-fill`: an existing resting order had its size reduced.
- `getOrderBookRegion` reconstructs historical books by replaying deltas between snapshots.
- `getOrderBookHistoryStats` reports retained snapshot/delta counts for profiling.

The implementation lives in `src/market.ts`:

- Change and history entry types: lines 35-69.
- Snapshot interval and stats API: lines 152-200.
- Delta replay in heatmap reconstruction: lines 202-247.
- Snapshot-or-delta recording: lines 290-318.
- Mutation records for adds/fills/cancels: lines 369-486.

## Before/After Impact

The same Node profiling harness was run before and after the refactor. Durations are virtual simulation time, with 200 ms per simulation tick.

| Virtual duration | Before result | Before post-GC heap | Before avg tick | After result | After post-GC heap | After avg tick |
| --- | --- | ---: | ---: | --- | ---: | ---: |
| 15 sec | completed | 399.88 MB | 22.68 ms | completed | 10.38 MB | 3.72 ms |
| 30 sec | completed | 1355.78 MB | 34.99 ms | completed | 25.43 MB | 10.35 ms |
| 60 sec | OOM near 4 GB | unavailable | unavailable | completed | 58.12 MB | 14.42 ms |

After-refactor retained history at 60 seconds:

| Metric | Value |
| --- | ---: |
| History entries | 19,349 |
| Full snapshots | 194 |
| Delta entries | 19,155 |
| Delta changes | 26,541 |
| Snapshot interval | 100 |
| RSS after final GC | 147.90 MB |

The memory improvement is large: the 30-second post-GC heap dropped from 1355.78 MB to 25.43 MB, about a 98.1% reduction. The 60-second run no longer crashes.

The remaining long-run limit is CPU, not retained heap. A 5-minute virtual run passed the previous OOM point but was not useful as an interactive profiling run because cancellation/order-book CPU cost grew enough that it did not finish promptly.

## After CPU Profile

CPU profile from a 15-second virtual run after delta encoding:

| Function | Self time | Share |
| --- | ---: | ---: |
| `SimulationCancellation.randomRestingOrder` | 89.9 ms | 15.9% |
| Garbage collector | 59.5 ms | 10.5% |
| `hasOrder` | 48.3 ms | 8.5% |
| `getOrderBookHistogram` | 43.6 ms | 7.7% |
| `histogramKey` | 36.6 ms | 6.5% |
| `makeOrder` | 20.7 ms | 3.7% |
| `simulateCancellationEvent` | 13.2 ms | 2.3% |
| `simulateEvent` | 12.3 ms | 2.2% |
| `candidateWeight` | 8.0 ms | 1.4% |
| `updateRecentPriceAnchors` | 5.6 ms | 1.0% |

Compared with the original 15-second CPU profile, GC dropped from 45.8% to 10.5%. The hottest remaining path is cancellation selection over a growing set of resting orders.

## Original Baseline Summary

Before the delta-encoding refactor, the simulation reproduced an out-of-memory failure in Node before completing 1 minute of virtual market time under the default settings. A 30-second virtual run retained about 1.35 GB of heap after GC, and an isolated 1-minute run reached the V8 heap limit at about 4 GB.

The largest issue was memory growth in `src/market.ts`: every market state change appended to `priceHistory` and appended a full cloned order book to `orderBookMap`. As the live order book grew, each later snapshot became larger, so memory growth was worse than linear.

The original CPU profile was already GC-dominated after only 15 seconds of virtual time: 45.8% of sampled CPU time was spent in the garbage collector.

## Environment

- Working directory: `/home/roman/code/the-trading-simulator`
- Node: `v22.12.0`, loaded through `nvm`
- npm: `10.9.0`
- Profiling harness: `scripts/profile-simulation.mjs`
- Raw CPU profile: `CPU.simulation.cpuprofile`
- Type check: `npm run check` passed

## Commands

```sh
source ~/.nvm/nvm.sh
node --expose-gc scripts/profile-simulation.mjs 0.25
node --expose-gc scripts/profile-simulation.mjs 0.5
node --expose-gc scripts/profile-simulation.mjs 1
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.cpuprofile scripts/profile-simulation.mjs 0.25
npm run check
```

Before the refactor, the 1-minute command did not complete; it failed with:

```text
FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
```

## Original Baseline Measurements

These are virtual simulation durations. The harness advances `Date.now()` by 200 ms per tick so it can run faster than real time while preserving simulation time behavior.

| Virtual duration | Ticks | Wall time | Avg tick time | Post-GC heap | RSS | Heap growth | Result |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 15 sec | 75 | 1.87 s | 22.68 ms | 399.88 MB | 486.52 MB | 394.66 MB | completed |
| 30 sec | 150 | 5.71 s | 34.99 ms | 1355.78 MB | 1463.09 MB | 1350.56 MB | completed |
| 60 sec | 300 | ~26 s before failure | unavailable | ~4 GB at failure | unavailable | unavailable | OOM |

Sample heap growth inside completed runs:

| Virtual time | Heap used |
| ---: | ---: |
| 10 sec | 135-165 MB |
| 15 sec | 322-402 MB |
| 20 sec | 532.57 MB |
| 30 sec | 1358.22 MB before final GC |

The exact values vary because the simulation uses random sampling, but the trend is stable: retained heap rises extremely quickly.

## Original CPU Profile

CPU profile from a 15-second virtual run:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 540.2 ms | 45.8% |
| `SimulationCancellation.randomRestingOrder` | 78.7 ms | 6.7% |
| `recordMarketState` | 35.1 ms | 3.0% |
| `makeOrder` | 33.8 ms | 2.9% |
| `histogramKey` | 30.7 ms | 2.6% |
| `takeOrder` | 21.9 ms | 1.9% |
| `cloneOrderBook` | 21.2 ms | 1.8% |
| `getOrderBookHistogram` | 19.7 ms | 1.7% |
| `hasOrder` | 18.7 ms | 1.6% |
| `updateTouchPriceHistory` | 15.3 ms | 1.3% |

The original profile was dominated by GC, which is consistent with allocation pressure and retained snapshot history.

## Original Findings

1. `recordMarketState` is unbounded and stores full book snapshots.

   In `src/market.ts`, `recordMarketState` appends one price entry and one cloned order-book snapshot on every recorded state change:

   - `priceHistory.push(...)`
   - `orderBookMap.push({ timestamp, orderBook: cloneOrderBook() })`

   `cloneOrderBook` copies every buy and sell order. Later snapshots therefore get more expensive as the book grows.

2. The heatmap history model is the main OOM risk.

   `getOrderBookRegion` iterates `orderBookMap` and then iterates all orders in each retained snapshot. This makes heatmap memory and CPU scale with historical snapshots multiplied by book depth. Even when the heatmap is disabled, the snapshots are still recorded.

3. Cancellation selection becomes increasingly expensive.

   `SimulationCancellation.randomRestingOrder` scans `restingOrders`, calls `hasOrder`, allocates candidate arrays, may sort candidates by price, and then loops candidates twice for weighting. As resting orders grow, cancellation cost grows with book depth.

4. Histogram and support/resistance anchoring add repeated full-book scans.

   `SimulationOrderPlacement.sampleSupportResistanceAnchor` calls `getOrderBookHistogram`, which scans the current order book and uses stringified map keys. This is less severe than full snapshot retention, but it contributes noticeable CPU time.

5. Candle history lookup is also unbounded.

   `priceHistoryCandle` uses `candleHistoryEntries`, which scans and filters `priceHistory`. This has not yet dominated the short Node profiles, but it will get worse during longer browser runs.

## Original Browser Failure Mode

The original page crash after a few minutes was consistent with OOM:

- Simulation state is retained without a cap.
- Full order-book snapshots are retained even when the heatmap is off.
- Retained memory growth reaches GB scale in less than a minute of virtual time in Node.
- GC consumes nearly half the profiled CPU after only 15 virtual seconds.

Browser timings will differ because the UI only ticks every 200 ms in real time and rendering adds work, but the underlying state growth path is the same.

## Remaining Recommended Fixes

1. Replace checkpointed snapshots with compact heatmap buckets if heatmap history still becomes expensive.

   Instead of storing cloned order books, maintain time/price aggregate buckets for heatmap rendering. This changes memory from `snapshots * orders` to `timeBuckets * priceBuckets`.

2. Cap or compact `priceHistory`.

   Keep only the raw tick history needed to build visible candles, or pre-aggregate candles by interval and discard old raw entries.

3. Avoid repeated array allocation in cancellation.

   Keep tracked resting orders by side and remove stale entries incrementally. Avoid rebuilding `{ order, index }` arrays on every cancellation.

4. Replace string keys in hot histogram paths.

   Use numeric indexing for histogram buckets instead of `JSON.stringify([y, kind])`.

## Reproduction Notes

The profiling harness imports the actual simulation and market modules. It does not patch application behavior, but it does replace `Date.now()` inside the profiling process so simulated time advances deterministically.

The raw profile can be loaded in Chrome DevTools or VS Code from `CPU.simulation.cpuprofile`.
