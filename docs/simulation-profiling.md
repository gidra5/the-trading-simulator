# Simulation Profiling Report

Date: 2026-04-30

## Long Heatmap Freeze Captures

Longer Playwright/Chromium page profiles confirm that the heatmap stutter grows into multi-second and then 10+ second main-thread freezes. These runs used the actual Vite page at `1440 x 900`, enabled `Show heatmap`, and recorded `requestAnimationFrame` gaps, browser long tasks, and Chromium traces. No page errors, in-page `error` events, or unhandled rejections were captured.

Commands:

```sh
source ~/.nvm/nvm.sh
PAGE_PROFILE_PORT=3400 PAGE_PROFILE_DURATION_MS=30000 npm run profile:page
PAGE_PROFILE_PORT=3400 PAGE_PROFILE_DURATION_MS=60000 npm run profile:page
```

Artifacts:

- 30-second JSON: `profiling/heatmap-page-profile-2026-04-30T14-51-41Z.json`
- 30-second trace: `profiling/heatmap-page-profile-2026-04-30T14-51-41Z.trace.json`
- 60-second JSON: `profiling/heatmap-page-profile-2026-04-30T14-53-07Z.json`
- 60-second trace: `profiling/heatmap-page-profile-2026-04-30T14-53-07Z.trace.json`

30-second capture summary:

| Metric                          |         Value |
| ------------------------------- | ------------: |
| Requested capture after heatmap |      `30.0 s` |
| Actual elapsed after heatmap    |      `45.4 s` |
| Average frame interval          |     `47.3 ms` |
| p99 frame interval              |    `250.1 ms` |
| Max frame interval              | `18,132.7 ms` |
| Frames over 100 ms              |          `50` |
| Long tasks                      |          `85` |
| Max long task                   |   `18,110 ms` |
| Total long-task time            |   `28,514 ms` |

Worst 30-second frame gap:

| Start after heatmap | End after heatmap |      Gap |
| ------------------: | ----------------: | -------: |
|            `27.3 s` |          `45.4 s` | `18.1 s` |

60-second capture summary:

| Metric                          |       Value |
| ------------------------------- | ----------: |
| Requested capture after heatmap |    `60.0 s` |
| Actual elapsed after heatmap    |    `65.1 s` |
| Average frame interval          |   `59.7 ms` |
| p99 frame interval              |  `250.0 ms` |
| Max frame interval              | `15,616 ms` |
| Frames over 100 ms              |        `57` |
| Long tasks                      |       `102` |
| Max long task                   | `15,588 ms` |
| Total long-task time            | `46,299 ms` |

Worst 60-second frame gaps:

| Start after heatmap | End after heatmap |      Gap |
| ------------------: | ----------------: | -------: |
|            `36.0 s` |          `49.4 s` | `13.4 s` |
|            `49.4 s` |          `65.1 s` | `15.6 s` |
|            `32.3 s` |          `35.7 s` |  `3.4 s` |
|            `30.2 s` |          `31.9 s` |  `1.8 s` |

60-second 5-second window summary:

| Window after heatmap | Frames over 50 ms | Frames over 100 ms |     Max frame | Long tasks | Max long task | Total long-task time |
| -------------------: | ----------------: | -----------------: | ------------: | ---------: | ------------: | -------------------: |
|              `0-5 s` |               `0` |                `0` |     `33.3 ms` |        `0` |        `0 ms` |               `0 ms` |
|             `5-10 s` |               `3` |                `0` |     `66.7 ms` |        `1` |       `61 ms` |              `61 ms` |
|            `10-15 s` |              `20` |                `0` |     `83.4 ms` |       `16` |       `77 ms` |             `993 ms` |
|            `15-20 s` |              `27` |               `11` |    `116.8 ms` |       `25` |      `121 ms` |           `2,338 ms` |
|            `20-25 s` |              `37` |               `24` |    `233.3 ms` |       `28` |      `217 ms` |           `3,648 ms` |
|            `25-30 s` |              `21` |               `16` |      `950 ms` |       `24` |      `907 ms` |           `4,550 ms` |
|            `30-35 s` |               `4` |                `3` |  `3,433.2 ms` |        `4` |    `3,407 ms` |           `5,443 ms` |
|            `35-40 s` |               `3` |                `2` | `13,432.9 ms` |        `3` |   `13,396 ms` |          `13,678 ms` |
|            `45-50 s` |               `1` |                `1` |   `15,616 ms` |        `1` |   `15,588 ms` |          `15,588 ms` |

Trace interpretation:

- The long freezes are visible as huge `TimerFire` / JavaScript `FunctionCall` tasks. In the 60-second trace, `TimerFire` totals `50.9 s` with a max single timer task of `15.6 s`.
- GC becomes significant in long captures, but it is still secondary to JavaScript timer work. The 60-second trace reports `MinorGC` at `1.89 s` total and `MajorGC` at `278 ms` total, while `TimerFire` totals `50.9 s`.
- The shape matches heatmap polling work that becomes progressively more expensive as retained order-book history grows. It starts as dropped frames around `5-10 s`, becomes frequent long tasks around `10-25 s`, then turns into multi-second freezes around `30 s+`.

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-30

## Always-On Simulation Slowdown

The browser slowdown was not only caused by heatmap rendering. The page also slowed down with heatmap and histogram disabled because several order-book and simulation paths were doing work proportional to accumulated history or accumulated book size on every simulation step.

Problems found:

- Ordinary order-book deltas reconstructed the previous order book even when compaction auditing was disabled. That made the browser pay reconstruction cost on every revision for data only used by tests.
- `orderBookDeltaLevels` was implemented as a memo that rescanned all retained order-book history whenever a delta snapshot needed compacted changes. With retained history enabled, snapshot bookkeeping became slower as the session grew.
- The first incremental replacement still compacted each delta level on every revision. At the default event rate this was too much work; compaction only needs to happen when emitting a delta snapshot.
- Adding an order used full array sort on the book side after every insert. The book sides are already sorted, so this was avoidable.
- `hasOrder()` scanned live order arrays. Cancellation cleanup calls it for tracked resting orders, so this became expensive as resting orders accumulated.
- Cancellation tracked all resting orders in one mixed list and then filtered by side for each cancellation.
- The implementation default had drifted from the documented snapshot hierarchy. It used five delta levels, making the full snapshot interval `312,500` revisions instead of the documented `2,500`.
- Heatmap computation was optimized earlier, but the renderer path still benefits from receiving a dense typed grid instead of many `{ x, y, size }` objects.

Changes made:

- `appendOrderBookMapEntry()` now only reconstructs the previous order book for ordinary deltas when test compaction auditing is enabled.
- Delta-level accumulation is now maintained incrementally in `market.ts`. Raw pending changes are appended cheaply on ordinary revisions and compacted only when a delta snapshot is emitted.
- The default delta hierarchy is restored to two levels: level 1 every `100`, level 2 every `500`, and full snapshot every `2,500`.
- Full history pruning was tried as a browser-memory cap, but it has been disabled. Full snapshots and prior deltas remain retained.
- `hasOrder()` now uses an active order-key set for O(1) lookup.
- Order insertion now uses binary search plus splice instead of sorting the whole side.
- Histogram series scans now binary-search the sorted book side to only visit prices in the requested range.
- Cancellation now stores tracked resting orders by side, reducing per-cancellation scanning and filtering.
- Heatmap output supports a dense column-major `Float32Array` grid, and the WebGPU texture writer consumes that grid directly while still accepting older sparse formats.

Observed profiling notes:

- A short tick-only profile with `SIM_ORDER_BOOK_REGION_RESOLUTION=1x1` dropped from about `23 ms/tick` to about `2.7 ms/tick` after moving delta-level compaction out of the per-revision path.
- With the documented `2,500` full snapshot interval and history pruning disabled, a one-minute tick-focused run stayed around `11-12 ms/tick`; longer runs still grow because full retained history is intentionally kept.
- Heatmap region work at `1x1` is no longer material in these runs, which confirms the remaining slowdown is simulation/history growth rather than heatmap rendering.

Verification commands:

```sh
source ~/.nvm/nvm.sh
npm test
npm run check
npm run build
SIM_ORDER_BOOK_REGION_RESOLUTION=1x1 node --expose-gc scripts/profile-simulation.mjs 1
```

Node version: loaded through `nvm`.

---

Date: 2026-04-29

## Heatmap Crash Profiling

The simulation tick path is not the source of the heatmap crash. With the default five-level order-book history, five simulated minutes still runs at about `0.19-0.23 ms` per tick and retains about `6-6.5 MB` post-GC heap.

The problem was the heatmap region/render path at canvas-sized resolutions:

| Version | Region resolution | Full range region | Tail region | Main CPU hotspots |
| --- | ---: | ---: | ---: | --- |
| Dense cells | `120 x 120` | `4.31 ms` | `4.09 ms` | region grid fill |
| Dense cells | `800 x 400` | `81.49 ms` | `78.94 ms` | object allocation |
| Dense cells | `1440 x 900` | `317.78-319.17 ms` | `305.23-319.94 ms` | `heatmapKey`, `getOrderBookRegion`, GC |
| Sparse cells | `120 x 120` | `0.13 ms` | `0.11 ms` | simulation tick work |
| Sparse cells | `1440 x 900` | `0.22 ms` | `0.28 ms` | simulation tick work |

The dense implementation returned one `{ x, y, size }` object for every heatmap cell. At `1440 x 900`, that is 1,296,000 objects per heatmap calculation before the WebGPU texture writer allocated its typed arrays. The CPU profile showed `heatmapKey` (`JSON.stringify([x, y])`) alone at about `6,959 ms` self time over the captured run, with GC at about `2,154 ms`.

Changes made:

- `scripts/profile-simulation.mjs` now accepts `SIM_ORDER_BOOK_REGION_RESOLUTION=WIDTHxHEIGHT` so the profiler can test canvas-sized heatmaps.
- `getOrderBookRegion()` now uses numeric cell keys, returns only populated cells, and appends one zero-size sentinel cell to preserve texture dimensions.
- `Chart` now uploads a heatmap texture only when the heatmap array identity changes, instead of rebuilding the same texture every animation frame.

Verification commands:

```sh
source ~/.nvm/nvm.sh
npm run check
npm run build
node --expose-gc scripts/profile-simulation.mjs 5
SIM_ORDER_BOOK_REGION_RESOLUTION=1440x900 node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.heatmap-sparse.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Snapshot Interval Derived From Levels

Order-book delta hierarchy configuration now treats level count as the source of truth. The full snapshot interval is derived as:

```txt
snapshotInterval = deltaSnapshotInterval * deltaSnapshotFanout ^ deltaSnapshotLevelCount
```

Implementation changes:

- `market.ts` now stores `deltaSnapshotLevelCount` instead of a directly-set full snapshot interval.
- `setOrderBookDeltaSnapshotLevels(levels)` updates hierarchy depth.
- `getOrderBookHistoryStats()` reports both the derived `snapshotInterval` and configured `deltaSnapshotLevelCount`.
- The chart settings control now edits book delta levels instead of book snapshot interval.
- The profiling harness maps `SIM_ORDER_BOOK_DELTA_LEVELS` to `setOrderBookDeltaSnapshotLevels()` instead of calculating and setting the full snapshot interval externally.

Verification command:

```sh
source ~/.nvm/nvm.sh
npm run check
SIM_ORDER_BOOK_DELTA_INTERVAL=100 SIM_ORDER_BOOK_DELTA_FANOUT=5 SIM_ORDER_BOOK_DELTA_LEVELS=5 node --expose-gc scripts/profile-simulation.mjs 5
```

Verification result:

- Delta snapshot interval: 100
- Delta snapshot fanout: 5
- Delta snapshot level count: 5
- Derived full snapshot interval: 312,500
- Post-GC heap: 5.99 MB
- Retained entries: 46
- Full snapshots retained: 1
- Delta snapshots retained: 9
- Ordinary deltas retained: 36

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Delta Level Count Sweep

The profiling harness now supports an explicit hierarchy depth override:

```sh
SIM_ORDER_BOOK_DELTA_INTERVAL=100 \
SIM_ORDER_BOOK_DELTA_FANOUT=5 \
SIM_ORDER_BOOK_DELTA_LEVELS=5 \
node --expose-gc scripts/profile-simulation.mjs 60
```

The harness also measures `getOrderBookRegion` reconstruction time with 25 calls each for:

- Full simulated range, `120 x 120` heatmap cells.
- Last 60 simulated seconds, `120 x 120` heatmap cells.

Fanout 2, 60 simulated minutes:

| Levels | Full snapshot | Avg tick | Post-GC heap | Entries | Full snapshots | Delta snapshots | Deltas | Changes | Full range region | Tail region |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 400 | 0.128 ms | 7.51 MB | 2,831 | 2,816 | 2 | 13 | 15 | 5.623 ms | 2.855 ms |
| 4 | 1,600 | 0.128 ms | 6.66 MB | 782 | 706 | 3 | 73 | 76 | 4.515 ms | 3.862 ms |
| 6 | 6,400 | 0.128 ms | 6.37 MB | 267 | 177 | 1 | 89 | 90 | 4.736 ms | 4.111 ms |
| 8 | 25,600 | 0.128 ms | 6.23 MB | 95 | 44 | 6 | 45 | 51 | 3.239 ms | 3.031 ms |
| 10 | 102,400 | 0.130 ms | 6.25 MB | 97 | 12 | 1 | 84 | 85 | 3.969 ms | 3.736 ms |

Fanout 5, 60 simulated minutes:

| Levels | Full snapshot | Avg tick | Post-GC heap | Entries | Full snapshots | Delta snapshots | Deltas | Changes | Full range region | Tail region |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 2,500 | 0.135 ms | 6.50 MB | 548 | 451 | 6 | 91 | 97 | 4.767 ms | 3.881 ms |
| 3 | 12,500 | 0.124 ms | 6.22 MB | 132 | 91 | 5 | 36 | 41 | 3.224 ms | 3.145 ms |
| 4 | 62,500 | 0.129 ms | 6.13 MB | 62 | 19 | 2 | 41 | 43 | 3.341 ms | 3.093 ms |
| 5 | 312,500 | 0.127 ms | 6.31 MB | 28 | 4 | 8 | 16 | 24 | 2.868 ms | 2.913 ms |
| 6 | 1,562,500 | 0.133 ms | 6.18 MB | 87 | 1 | 11 | 75 | 86 | 3.661 ms | 3.485 ms |

Findings:

- More levels mostly reduce retained entries and full snapshots, which helps memory and full-range reconstruction until the full snapshot interval becomes too large.
- Ten levels does not automatically improve reconstruction speed. With fanout 2, 10 levels retained fewer full snapshots than 8 levels but had a longer tail chain, and both full-range and tail reconstruction were slower than 8 levels in this sample.
- With fanout 5, 5 levels was best in this run: 28 retained entries and about 2.9 ms region reconstruction. At 6 levels the run had only the initial full snapshot, so the reader had to traverse a longer delta-snapshot chain and reconstruction slowed down.
- The practical target is enough levels to avoid excessive full snapshots, but not so many that normal viewed ranges sit far from a full snapshot. From this sweep, `100/5/4` or `100/5/5` look better than the current 2-level default for reconstruction-heavy history views.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
SIM_ORDER_BOOK_DELTA_INTERVAL=100 SIM_ORDER_BOOK_DELTA_FANOUT=5 SIM_ORDER_BOOK_DELTA_LEVELS=5 node --expose-gc scripts/profile-simulation.mjs 60
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Delta Interval/Fanout Sweep

The profiling harness can now override order-book delta packing settings with:

```sh
SIM_ORDER_BOOK_DELTA_INTERVAL=100 SIM_ORDER_BOOK_DELTA_FANOUT=10 node --expose-gc scripts/profile-simulation.mjs 5
```

For these sweeps, the full snapshot interval was set to `interval * fanout^2` so the hierarchy shape stays consistent.

Five simulated minutes:

| Delta interval | Fanout | Full snapshot | Avg tick | Post-GC heap | RSS | Entries | Full snapshots | Delta snapshots | Deltas | Changes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 3 | 450 | 0.204 ms | 6.29 MB | 75.41 MB | 234 | 211 | 1 | 22 | 23 |
| 50 | 5 | 1,250 | 0.202 ms | 6.16 MB | 74.58 MB | 118 | 76 | 3 | 39 | 42 |
| 50 | 10 | 5,000 | 0.187 ms | 6.20 MB | 76.39 MB | 46 | 19 | 8 | 19 | 27 |
| 100 | 3 | 900 | 0.183 ms | 6.25 MB | 85.47 MB | 152 | 106 | 0 | 46 | 46 |
| 100 | 5 | 2,500 | 0.178 ms | 6.19 MB | 76.74 MB | 92 | 38 | 7 | 47 | 54 |
| 100 | 10 | 10,000 | 0.175 ms | 6.01 MB | 75.91 MB | 27 | 10 | 7 | 10 | 17 |
| 250 | 3 | 2,250 | 0.175 ms | 6.27 MB | 75.86 MB | 259 | 42 | 4 | 213 | 217 |
| 250 | 5 | 6,250 | 0.184 ms | 6.18 MB | 84.97 MB | 158 | 15 | 6 | 137 | 143 |
| 250 | 10 | 25,000 | 0.177 ms | 6.20 MB | 77.01 MB | 78 | 4 | 10 | 64 | 74 |

Clean 60 simulated minute samples for the most relevant candidates:

| Delta interval | Fanout | Full snapshot | Avg tick | Post-GC heap | RSS | Entries | Full snapshots | Delta snapshots | Deltas | Changes |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 5 | 2,500 | 0.134 ms | 6.50 MB | 92.60 MB | 473 | 452 | 3 | 18 | 21 |
| 100 | 10 | 10,000 | 0.132 ms | 6.28 MB | 92.73 MB | 221 | 113 | 10 | 98 | 108 |
| 250 | 10 | 25,000 | 0.131 ms | 6.27 MB | 93.62 MB | 180 | 46 | 3 | 131 | 134 |
| 50 | 10 | 5,000 | 0.126 ms | 6.36 MB | 95.89 MB | 243 | 226 | 12 | 5 | 17 |

Findings:

- Heap stayed in a narrow range across the useful settings: roughly 6.0-6.5 MB post-GC.
- Larger fanout generally reduced retained entries because full snapshots became less frequent and higher-level delta snapshots collapsed more of the lower-level chain.
- Smaller intervals reduce tail deltas but can create many full snapshots if fanout is low. `50/3` retained 211 full snapshots in five simulated minutes.
- Larger intervals with high fanout minimize snapshots, but retain more ordinary tail deltas. `250/10` kept only 46 full snapshots after 60 simulated minutes, but had 131 ordinary deltas at the tail.
- The best balanced settings from this sweep are `100/10` and `250/10`. `100/10` keeps the tail shorter; `250/10` keeps fewer full snapshots.
- The current `100/5` default is conservative and stable, but it writes many more full snapshots over long runs than the high-fanout options.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
SIM_ORDER_BOOK_DELTA_INTERVAL=100 SIM_ORDER_BOOK_DELTA_FANOUT=10 node --expose-gc scripts/profile-simulation.mjs 60
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Multi-Level Delta Snapshot Update

Order-book history now supports hierarchical delta snapshots.

Default layout:

- Level 1 delta snapshot every 100 revisions.
- Level 2 delta snapshot every 500 revisions.
- Full snapshot every 2,500 revisions.
- The fanout is 5, so each level `n` snapshot accumulates up to 5 snapshots from level `n - 1` before the next level is emitted.

Recovery model:

- Live order-book advancement still applies only the newest raw `changes` payload.
- Each delta snapshot also stores `compactedChanges`, which is the net delta from the nearest checkpoint at the same or higher level.
- To recover a point in history, the reader walks backward through ordinary deltas, then level 1 delta snapshots, then higher-level delta snapshots until it reaches a full snapshot, and then applies the collected changes forward.
- When searching backward for a checkpoint, level 1 can stop at level 1 or above, level 2 can stop at level 2 or above, and so on. This lets retained lower-level entries be collapsed whenever a higher-level checkpoint is written.
- `getOrderBookRegion` now starts at the first retained entry in the requested time range and reconstructs the preceding order book from the closest checkpoint chain, instead of replaying the entire retained map from the beginning.

Cancellation behavior remains compacted:

- Add followed by remove disappears.
- Repeated partial fills collapse into one net size change.
- Partial fills against an added order update the retained add size.

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.368 s
- Average tick time: 0.239 ms
- Post-GC heap: 6.66 MB
- RSS: 89.11 MB
- Heap growth: 0.93 MB
- History entries retained: 65
- Full snapshots retained: 39
- Delta snapshots retained: 2
- Delta snapshot levels retained: level 1 = 1, level 2 = 1
- Ordinary deltas retained: 24
- Compacted retained changes: 26
- Full snapshot interval: 2,500
- Delta snapshot interval: 100
- Delta snapshot fanout: 5

Top self-time functions:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 70.4 ms | 13.9% |
| `updateTouchPriceHistory` | 35.2 ms | 7.0% |
| Node loader compilation | 30.6 ms | 6.1% |
| `updateRecentPriceAnchors` | 28.4 ms | 5.6% |
| `applyOrderBookChange` | 27.2 ms | 5.4% |
| `sampleMultivariateHawkesProcessEventTypes` | 23.8 ms | 4.7% |
| anonymous/profile harness code | 22.7 ms | 4.5% |
| `simulateEvent` | 20.4 ms | 4.0% |
| `appendOrderBookMapEntry` | 17.0 ms | 3.4% |
| `applyOrderPricePsychology` | 15.9 ms | 3.1% |

Compared with the previous running-delta memo profile, the hierarchical layout reduced retained history entries from 972 to 65 and compacted retained changes from 783 to 26 in this sampled 5-minute run. Post-GC heap moved from 6.84 MB to 6.66 MB. Sampled GC self-time was noisy in this run and moved from 63.1 ms to 70.4 ms, so the clear win here is retained-history size and heap stability rather than this specific GC sample.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
node --expose-gc scripts/profile-simulation.mjs 1 2 5
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
npm run build
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Running Delta Memo Update

Delta snapshot packing now uses a running compact-delta memo instead of diffing full order books at pack time.

Implementation:

- `orderBookDeltaChanges` is a Solid memo derived from `orderBookMap`.
- On a full snapshot it resets to an empty delta.
- On an ordinary delta it composes the new change into the existing compacted delta.
- On a delta snapshot it resets to an empty delta, so each delta snapshot stores one 100-revision segment.
- Delta snapshots still keep the raw current `changes` field so the live `orderBook` memo can advance by one revision, while heatmap/history replay uses `compactedChanges`.
- Historical replay applies the full snapshot, then each retained delta snapshot segment in order, then any ordinary deltas after the last delta snapshot.

Cancellation behavior is handled incrementally:

- Add followed by remove deletes the net change.
- Multiple partial fills collapse into one net `partial-fill`.
- Partial fill followed by remove becomes a remove.
- Partial fill of an order added after the checkpoint updates the net add size.

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.377 s
- Average tick time: 0.246 ms
- Post-GC heap: 6.84 MB
- RSS: 85.85 MB
- Heap growth: 1.12 MB
- History entries retained: 972
- Full snapshots retained: 189
- Delta snapshots retained: 754
- Ordinary deltas retained: 29
- Compacted retained changes: 783

Top self-time functions:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 63.1 ms | 12.2% |
| `simulateEvent` | 35.7 ms | 6.9% |
| `sampleMultivariateHawkesProcessEventTypes` | 35.4 ms | 6.9% |
| Node loader compilation | 34.3 ms | 6.6% |
| anonymous/profile harness code | 30.2 ms | 5.8% |
| `updateRecentPriceAnchors` | 25.5 ms | 4.9% |
| `applyOrderBookChange` | 24.2 ms | 4.7% |
| `takeOrder` | 16.6 ms | 3.2% |
| `updateTouchPriceHistory` | 11.7 ms | 2.3% |
| `recordMarketState` | 11.1 ms | 2.1% |

Compared with the previous full-book diff packing profile, retained compacted changes dropped from 1,487 to 783 in this run and post-GC heap stayed low. This reset-every-segment model matches the intended replay chain, though the sampled GC self-time in this run was 63.1 ms.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
node --expose-gc scripts/profile-simulation.mjs 1 2 5
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Delta Snapshot Packing Update

Order-book history now uses packed delta checkpoints:

- Full order-book snapshots are written every 500 market revisions.
- Delta snapshots are written every 100 market revisions between full snapshots.
- Ordinary deltas after the previous checkpoint are removed when a delta snapshot or full snapshot is written.
- Delta snapshots are relative to the previous checkpoint, which can be either a full snapshot or another delta snapshot.
- The packed delta is computed by diffing checkpoint state against final state, so cancelling changes collapse naturally. For example, add-then-remove disappears, repeated partial fills become one net size change, and partial-fill-then-remove becomes a remove.

Implementation notes:

- `OrderBookDeltaSnapshotEntry` was added in `src/market.ts`.
- `diffOrderBooks` computes compact net changes from checkpoint book to current book.
- `latestOrderBookCheckpoint` caches the latest checkpoint book, avoiding expensive replay during each pack operation.
- `getOrderBookRegion` can replay full snapshots, delta snapshots, and ordinary deltas in sequence.

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.389 s
- Average tick time: 0.253 ms
- Post-GC heap: 7.12 MB
- RSS: 93.54 MB
- Heap growth: 1.41 MB
- History entries retained: 1,028
- Full snapshots retained: 188
- Delta snapshots retained: 750
- Ordinary deltas retained: 90
- Compacted retained changes: 1,487
- Full snapshot interval: 500
- Delta snapshot interval: 100

Top self-time functions:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 60.7 ms | 11.7% |
| `simulateEvent` | 40.1 ms | 7.7% |
| `sampleMultivariateHawkesProcessEventTypes` | 32.5 ms | 6.2% |
| anonymous/profile harness code | 32.2 ms | 6.2% |
| `applyOrderBookChange` | 30.9 ms | 5.9% |
| Node loader compilation | 29.8 ms | 5.7% |
| `updateRecentPriceAnchors` | 23.2 ms | 4.5% |
| `makeOrder` | 14.3 ms | 2.8% |
| `samplePowerLaw` | 13.4 ms | 2.6% |
| `forEachEvent` | 13.3 ms | 2.6% |

Compared with the streaming-only reversion benchmark, retained history dropped from 93,964 entries to 1,028 entries, post-GC heap dropped from 27.12 MB to 7.12 MB, and GC self-time dropped from 86.5 ms to 60.7 ms. The tradeoff is that old heatmap/order-book history is now checkpoint-resolution after packing; intermediate per-revision history inside each 100-revision block is intentionally collapsed.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
npm run build
node --expose-gc scripts/profile-simulation.mjs 1 2 5
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.delta-packing.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Reversion Benchmark: Keep Streaming, Revert Cache/Retention/Cancellation SoA

Scope requested:

- Keep streaming Hawkes event handling.
- Revert `ExcitationCache`.
- Revert cancellation touch-history SoA back to `PricePoint[]`.
- Revert order-book history retention/pruning and restore the default snapshot interval to 100.

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.reverted-request.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.396 s
- Average tick time: 0.253 ms
- Post-GC heap: 27.12 MB
- RSS: 112.31 MB
- Heap growth: 21.42 MB
- History entries retained: 93,964
- Snapshots retained: 940
- Deltas retained: 93,024
- Snapshot interval: 100

Top self-time functions:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 86.5 ms | 15.8% |
| `sampleMultivariateHawkesProcessEventTypes` | 37.2 ms | 6.8% |
| anonymous/profile harness code | 36.4 ms | 6.6% |
| Node loader compilation | 32.1 ms | 5.8% |
| `simulateEvent` | 28.3 ms | 5.2% |
| `makeOrder` | 25.2 ms | 4.6% |
| `updateTouchPriceHistory` | 23.3 ms | 4.3% |
| `updateRecentPriceAnchors` | 20.0 ms | 3.6% |
| `forEachEvent` | 16.8 ms | 3.1% |
| `applyOrderPricePsychology` | 16.6 ms | 3.0% |

Finding:

Keeping streaming while reverting the settings cache, retention, and cancellation touch-history SoA lands between the prior full GC pass and the fully reverted event-array path. Compared with the previous latest GC pass (`71.3 ms`, 10.38 MB post-GC heap), removing retention is the dominant regression: retained history returns to about 94k entries and post-GC heap returns to 27.12 MB. Streaming still helps versus the fully reverted event-array run, which measured 91.6 ms GC in the immediately preceding profile.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
npm run build
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.reverted-request.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## GC Optimization Follow-Up

Question: can the 5-minute CPU-profiled simulation run get GC into the 50 ms range?

Result: not reliably with the current simulation and one-minute visual-history retention. The latest run reduced retained heap substantially and brought GC down from the previous 107.6 ms baseline to 71.3 ms in `CPU.simulation.gc-pass.cpuprofile`. Earlier intermediate runs landed in the high-60 ms range, but the result is still not consistently in the 50 ms band.

## Implemented GC Reductions

1. Order-book history is now bounded in memory.

   The default order-book history retention is 60 seconds, matching the default chart viewport span. Pruning keeps the checkpoint snapshot needed to replay retained deltas. `setOrderBookHistoryRetention(retentionMs)` can adjust this, with `0` preserving unbounded history.

2. Order-book checkpoints are less frequent by default.

   The default snapshot interval is now 500 revisions instead of 100. This reduces retained full-book clones while preserving the existing `setOrderBookSnapshotInterval(interval)` override.

3. Single-change deltas no longer retain one-element arrays.

   Most deltas contain exactly one change. `OrderBookDeltaEntry` now stores a single change directly and only stores an array for true multi-change deltas.

4. Hot simulation queues now use numeric arrays instead of point objects.

   Recent price-anchor queues and cancellation touch-price queues now store parallel `time`/`price` number arrays. This cuts short-lived `{ time, price }` allocation churn and reduces retained object count.

5. The excitation sampler avoids per-tick event arrays.

   `SimulationExcitation` caches settings-derived vectors/matrices and streams event types into the simulation callback. The Hawkes sampler also reuses the excited-interest vector instead of allocating a replacement every tick.

6. Order matching no longer copies a full book side.

   `takeOrder` now walks the active book side by index instead of cloning the side with `[...orders]` before every match.

## Latest Measurement

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.gc-pass.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.346 s
- Average tick time: 0.223 ms
- Post-GC heap: 10.38 MB
- RSS: 106.59 MB
- Heap growth: 4.67 MB
- History entries retained: 19,324
- Snapshots retained: 39
- Deltas retained: 19,285
- Retention window: 60,000 ms

Top self-time functions from the latest profile:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 71.3 ms | 14.6% |
| `sampleMultivariateHawkesProcessEventTypes` | 34.9 ms | 7.1% |
| Node loader compilation | 30.0 ms | 6.1% |
| anonymous/profile harness code | 28.1 ms | 5.7% |
| `makeOrder` | 23.5 ms | 4.8% |
| `simulateEvent` | 22.3 ms | 4.6% |
| `pruneOrderBookMap` | 18.6 ms | 3.8% |
| `updateTouchPriceHistory` | 18.3 ms | 3.8% |
| `updateRecentPriceAnchors` | 17.8 ms | 3.6% |
| `takeOrder` | 13.2 ms | 2.7% |

The remaining route to a reliable 50 ms GC profile is a larger history-storage change: either shorten the default live visual-history window below 60 seconds, move older history out of the JS heap, or replace the retained delta object log with a columnar/typed-array representation.

Verification:

```sh
source ~/.nvm/nvm.sh
npm run check
npm run build
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.gc-pass.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## CPU Hotspot Optimization Update

The main measured CPU hotspots from the previous profile were optimized in the simulation path:

1. Histogram construction no longer uses `JSON.stringify` keys or a `Map` per call.

   `getOrderBookHistogram` now accumulates buy/sell bucket sizes in indexed arrays and then emits the same `OrderBookHistogramEntry[]` shape expected by the chart. This removes the previous `histogramKey` hotspot entirely from the top sampled functions.

2. Support/resistance sampling no longer materializes both histogram sides.

   `SimulationOrderPlacement.sampleSupportResistanceAnchor` now uses `getOrderBookHistogramSeries` for the requested side only. That keeps the liquidity-wall behavior but avoids allocating and filtering a two-sided chart histogram during order placement.

3. Cancellation touch-price history no longer expires entries with `Array.shift()`.

   `SimulationCancellation.updateTouchPriceHistory` now advances per-side offsets and compacts occasionally. In the fresh CPU profile, `updateTouchPriceHistory` dropped from the prior 64.7 ms / 6.7% sample to 7.5 ms / 1.4%.

4. Candle generation now uses binary search and a single pass.

   `priceHistoryCandle` no longer scans backward and then allocates filtered/mapped arrays for each candle. It finds the relevant price-history range with upper-bound binary searches and computes open/high/low/close directly.

## Post-Optimization Measurements

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc scripts/profile-simulation.mjs 1 2 5
```

| Virtual duration | Ticks | Wall time | Avg tick time | Post-GC heap | RSS | Heap growth | History entries | Snapshots | Deltas |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 min | 300 | 0.155 s | 0.483 ms | 11.66 MB | 79.05 MB | 6.42 MB | 18,671 | 187 | 18,484 |
| 2 min | 600 | 0.224 s | 0.352 ms | 23.36 MB | 108.73 MB | 11.96 MB | 56,037 | 561 | 55,476 |
| 5 min | 1500 | 0.352 s | 0.218 ms | 52.31 MB | 146.11 MB | 29.26 MB | 150,082 | 1,501 | 148,581 |

The comparable previous 5-minute non-CPU-profiled run was 0.659 s wall time and 0.421 ms average tick time, so this run is about 46.5% lower wall time and 48.3% lower average tick time. The simulation is stochastic, so event counts vary between runs, but the old histogram string-key hotspot is gone in the profile.

Fresh CPU-profiled 5-minute run:

```sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.after-hotspots.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.389 s
- Average tick time: 0.245 ms
- Post-GC heap: 35.39 MB
- RSS: 126.26 MB
- History entries: 93,751
- Snapshots: 938
- Deltas: 92,813
- Raw CPU profile: `CPU.simulation.after-hotspots.cpuprofile`

Top post-optimization self-time functions:

| Function | Self time | Share |
| --- | ---: | ---: |
| Garbage collector | 107.6 ms | 20.3% |
| `tick` | 49.9 ms | 9.4% |
| `sampleMultivariateHawkesProcessEventTimes` | 45.3 ms | 8.6% |
| anonymous/profile harness code | 35.8 ms | 6.8% |
| `updateRecentPriceAnchors` | 34.6 ms | 6.5% |
| Node loader compilation | 30.0 ms | 5.7% |
| `samplePowerLaw` | 15.7 ms | 3.0% |
| `simulateLimitOrderEvent` | 15.6 ms | 3.0% |
| `takeOrder` | 8.9 ms | 1.7% |
| `applyOrderPricePsychology` | 8.1 ms | 1.5% |
| `runProfile` | 7.8 ms | 1.5% |
| `updateTouchPriceHistory` | 7.5 ms | 1.4% |
| `simulateEvent` | 6.8 ms | 1.3% |

## Current Findings

1. The previous dominant histogram keying cost has been removed.

   Neither `histogramKey` nor `getOrderBookHistogram` appears in the top post-change self-time functions. The chart-facing histogram still returns the same entry shape, while simulation order placement uses a cheaper side-specific series.

2. Cancellation history expiry is no longer a main CPU sink.

   Offset-based expiry avoids repeated array reindexing while preserving the retained oldest touch price used by `priceMovedAwayFromOrder`.

3. The remaining largest app-level costs are broader simulation mechanics.

   After removing the obvious allocation/keying hotspots, the profile is led by event scheduling, recent-price anchor maintenance, random distribution sampling, and order matching. These are more central to behavior and need more targeted design work before changing.

4. Long-run visual history remains the main unresolved scaling risk.

   The heatmap path still reconstructs historical books from retained order-book history. The earlier recommendation to chunk or bound old visual history still stands for long browser sessions with heatmap enabled.

## Verification

```sh
source ~/.nvm/nvm.sh
npm run check
npm run build
node --expose-gc scripts/profile-simulation.mjs 1 2 5
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.after-hotspots.cpuprofile scripts/profile-simulation.mjs 5
```

Node version: `v22.12.0`, loaded through `nvm`.

---

Date: 2026-04-29

## Summary

The original page crash was consistent with browser out-of-memory. Before the `appendOrderBookMapEntry` fix, a headless Chromium run of the actual Vite page grew from 1.84 MB to 2061.55 MB of used JS heap in 31 seconds.

After the checkpoint/delta fix, the same 30-second browser probe stayed low: used JS heap ended at 14.15 MB. The simulation-only harness also retained snapshots at the expected checkpoint scale instead of almost one full snapshot per market revision.

Market state is intentionally global and long-lived. The Solid market state now belongs to an explicit long-lived root, preserving the convenient reactive API without making market lifetime depend on the page component.

## Implemented Follow-Ups

1. Global market reactivity is owned by an explicit root.

   `src/market.ts` now creates the module-level signals and memos inside `createRoot`. The exported API is still global and permanent, but Solid no longer treats those computations as ownerless. A post-change browser check did not emit the previous `computations created outside a createRoot or render` warnings.

2. Component-owned chart data is throttled.

   `src/utils.ts` now provides `createThrottledMemo`, which keeps memo-shaped call sites while returning the previous value until the throttle window passes. `src/MarketChart.tsx` uses it for price spread, candles, histogram, and heatmap so expensive derivations are throttled without separate polling state.

3. Candle history is reactive market state.

   `src/market.ts` now derives `priceHistory` from `orderBookMap` revisions, similar to the current `orderBook` memo. `MarketChart` no longer needs a component-level simulation revision signal to invalidate candle or market-view derivations.

## Post-Fix Browser Probe

Command:

```sh
source ~/.nvm/nvm.sh
npm run dev -- --host 127.0.0.1
node -e '<Playwright browser heap sampler>'
```

Environment:

- Vite URL: `http://127.0.0.1:3001/`
- Browser: Playwright Chromium headless
- Viewport: 1440 x 900
- App settings: default page settings, heatmap disabled, histogram enabled
- WebGPU status in this headless run: unavailable (`No available adapters.`)

Used JS heap after the `appendOrderBookMapEntry` fix:

| Wall time | Used heap | Total heap | Page responsive |
| ---: | ---: | ---: | --- |
| 0 sec | 1.84 MB | 3.39 MB | yes |
| 5 sec | 3.85 MB | 13.14 MB | yes |
| 10 sec | 3.98 MB | 20.64 MB | yes |
| 15 sec | 6.49 MB | 23.14 MB | yes |
| 20 sec | 14.07 MB | 40.89 MB | yes |
| 25 sec | 11.09 MB | 44.64 MB | yes |
| 30 sec | 14.15 MB | 79.39 MB | yes |

Short browser sanity check after the explicit root and throttled memo changes:

| Wall time | Used heap | Total heap |
| ---: | ---: | ---: |
| 0 sec | 1.85 MB | 3.39 MB |
| 5 sec | 4.37 MB | 8.93 MB |
| 10 sec | 6.95 MB | 14.18 MB |
| 15 sec | 11.80 MB | 23.68 MB |

After deriving `priceHistory` from `orderBookMap` and removing the component revision signal, a follow-up 15-second browser sanity check ended at 10.90 MB used heap and the spread continued updating.

## Pre-Fix Browser Baseline

The previous browser probe, before the `appendOrderBookMapEntry` fix, showed runaway heap growth:

| Wall time | Used heap | Total heap | Page responsive |
| ---: | ---: | ---: | --- |
| 0 sec | 1.84 MB | 4.14 MB | yes |
| 5 sec | 51.16 MB | 114.39 MB | yes |
| 10 sec | 259.94 MB | 303.64 MB | yes |
| 15 sec | 630.97 MB | 678.39 MB | yes |
| 21 sec | 1101.08 MB | 1147.39 MB | yes |
| 26 sec | 1523.55 MB | 1578.39 MB | yes |
| 31 sec | 2061.55 MB | 2111.14 MB | yes |

That measurement explains the observed page crash after about a minute of running.

## Simulation-Only Measurements

Command:

```sh
source ~/.nvm/nvm.sh
node --expose-gc scripts/profile-simulation.mjs 1 2 5
```

These durations are virtual simulation time. The harness advances `Date.now()` by 200 ms per tick.

| Virtual duration | Ticks | Wall time | Avg tick time | Post-GC heap | RSS | Heap growth | History entries | Snapshots | Deltas |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 min | 300 | 0.248 s | 0.800 ms | 12.80 MB | 98.88 MB | 7.57 MB | 18,661 | 187 | 18,474 |
| 2 min | 600 | 0.316 s | 0.507 ms | 27.13 MB | 117.72 MB | 14.30 MB | 56,679 | 567 | 56,112 |
| 5 min | 1500 | 0.659 s | 0.421 ms | 62.00 MB | 161.98 MB | 35.13 MB | 150,930 | 1,510 | 149,420 |

Fresh CPU-profiled 5-minute run:

```sh
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.cpuprofile scripts/profile-simulation.mjs 5
```

Result:

- Wall time: 0.842 s
- Average tick time: 0.549 ms
- Post-GC heap: 41.33 MB
- RSS: 129.73 MB
- History entries: 93,811
- Snapshots: 939
- Deltas: 92,872
- Raw CPU profile: `CPU.simulation.cpuprofile`

The snapshot count is consistent with `snapshotInterval = 100`.

## CPU Hot Spots

Top self-time functions from `CPU.simulation.cpuprofile`:

| Function | Self time | Share |
| --- | ---: | ---: |
| `histogramKey` | 199.4 ms | 20.5% |
| `getOrderBookHistogram` | 195.6 ms | 20.1% |
| Garbage collector | 149.8 ms | 15.4% |
| `updateTouchPriceHistory` | 64.7 ms | 6.7% |
| `simulateEvent` | 28.7 ms | 2.9% |
| `sampleMultivariateHawkesProcessEventTimes` | 28.6 ms | 2.9% |
| `sampleSupportResistanceAnchor` | 18.7 ms | 1.9% |
| `updateRecentPriceAnchors` | 16.4 ms | 1.7% |
| `tick` | 10.8 ms | 1.1% |
| `simulateLimitOrderEvent` | 9.0 ms | 0.9% |

The biggest CPU issue is repeated histogram work, especially `histogramKey`, which uses `JSON.stringify([y, kind])` in a hot path.

## Findings

1. `appendOrderBookMapEntry` fix materially reduced retained browser heap.

   The previous bug stored a full snapshot on nearly every revision. The fixed code now stores either a delta or a checkpoint snapshot. In the 5-minute simulation-only run, snapshots dropped from about 150,243 in the old measurement to 1,510 in the current measurement.

2. Global market state is intentional.

   The market is designed to run permanently, independent of any one page component. It should remain global, but its Solid lifetime should be explicit.

3. Histogram CPU is now the main measured simulation cost.

   `getOrderBookHistogram` and `histogramKey` together account for about 40.6% of sampled self time in the 5-minute CPU profile. This affects both simulation behavior through `sampleSupportResistanceAnchor` and page rendering when the depth histogram is enabled.

4. Heatmap and long-run visual history still need bounded-history design.

   Checkpointed deltas make history much smaller, but `getOrderBookRegion` still reconstructs historical books and iterates orders across retained history.

## Remaining Recommended Fixes

1. Replace histogram string keys with numeric indexing.

   Use arrays for buy/sell bucket totals instead of a `Map` keyed by `JSON.stringify([y, kind])`.

2. Offload old visual history to persistent storage.

   For long-running sessions, keep recent history in memory and move older history chunks to `localStorage` after a retention period such as 30 minutes. Store each chunk under a separate key, indexed by time range, so `getOrderBookRegion` or the heatmap path can restore only chunks intersecting the current viewport.

3. Re-profile with WebGPU available.

   The headless browser runs reported `No available adapters`, so they measure JS heap and page responsiveness but not the real GPU rendering path.

## Commands Run

```sh
source ~/.nvm/nvm.sh
node --expose-gc scripts/profile-simulation.mjs 1 2 5
node --expose-gc --cpu-prof --cpu-prof-name CPU.simulation.cpuprofile scripts/profile-simulation.mjs 5
npm run dev -- --host 127.0.0.1
node -e '<Playwright browser heap sampler>'
```

Node version: `v22.12.0`, loaded through `nvm`.

---

# Previous Simulation Profiling Report

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
