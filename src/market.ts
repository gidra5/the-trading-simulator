type Order = {
  price: number;
  size: number;
};
type RegisteredOrder = Order & { id: number };
type TradeHistoryEntry = {
  buyOrderId: number;
  sellOrderId: number;
  price: number;
  size: number;
};
type PriceSpread = {
  buy: number;
  sell: number;
};
type PriceHistoryEntry = {
  timestamp: number;
  spread: PriceSpread;
};
export type PriceCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};
export type OrderSide = "buy" | "sell";
type OrderBookLevelDelta = {
  price: number;
  sizeDelta: number;
};
type OrderBookDeltaEntry = {
  deltas: OrderBookLevelDelta[];
  timestamp: number;
};
type OrderBookCheckpoint = {
  deltaIndex: number;
  levels: OrderBookLevels;
};
export type OrderBookHeatmapEntry = {
  x: number;
  y: number;
  size: number;
};
export type OrderBookHeatmap = {
  width: number;
  height: number;
  sizes: Float32Array;
  activeColumns: Uint8Array;
  maxSize: number;
  profile: OrderBookHeatmapProfile;
};
export type OrderBookHeatmapProfile = {
  computeMs: number;
  width: number;
  height: number;
  cellCount: number;
  checkpointCount: number;
  checkpointDeltaIndex: number;
  replayedDeltaCount: number;
  inRangeDeltaCount: number;
  columnsAccumulated: number;
  accumulatedLevelCount: number;
  levelCountAtReplayStart: number;
  levelCountAtReplayEnd: number;
  cacheLevel?: [time: number, price: number];
  cacheTileCount?: number;
  cacheTilesBuilt?: number;
  cacheTilesReused?: number;
};
export type OrderBookHistogramEntry = {
  kind: OrderSide;
  y: number;
  size: number;
};
export type OrderBookHeatmapRegion = {
  timestamp: [start: number, end: number];
  price: [min: number, max: number];
  resolution: [time: number, price: number];
};
export type OrderBookHistogramRegion = {
  price: [min: number, max: number];
  resolution: number;
};

type CachedOrderBookHeatmapTile = {
  level: [time: number, price: number];
  tile: [time: number, price: number];
  region: OrderBookHeatmapRegion;
  heatmap: OrderBookHeatmap;
  nearestActiveColumns: Int32Array;
  latestTimestampAtBuild: number;
};

type OrderBookHeatmapCacheState = {
  baseCellSize: [time: number, price: number] | null;
  selectedLevel: [time: number, price: number];
  tiles: Map<string, CachedOrderBookHeatmapTile>;
};

type OrderBook = {
  buy: RegisteredOrder[];
  sell: RegisteredOrder[];
};
type OrderBookLevels = Map<number, number>;

const orderBook: OrderBook = {
  buy: [{ id: -1, price: 0.99, size: 1e2 }],
  sell: [{ id: -2, price: 1.01, size: 1e2 }],
};

const applyOrderBookLevelDelta = (
  levels: OrderBookLevels,
  price: number,
  sizeDelta: number,
): void => {
  if (sizeDelta === 0) {
    return;
  }

  const nextSize = (levels.get(price) ?? 0) + sizeDelta;
  if (Math.abs(nextSize) <= Number.EPSILON) {
    levels.delete(price);
    return;
  }

  levels.set(price, nextSize);
};

const createOrderBookLevels = (source: OrderBook): OrderBookLevels => {
  const levels = new Map<number, number>();

  for (const orders of [source.buy, source.sell]) {
    for (const order of orders) {
      applyOrderBookLevelDelta(levels, order.price, order.size);
    }
  }

  return levels;
};

const initialTimestamp = Date.now();
const orderBookCheckpointInterval = 100;
const initialOrderBookLevels = createOrderBookLevels(orderBook);
const currentOrderBookLevels = new Map(initialOrderBookLevels);
const orderBookDeltaHistory: OrderBookDeltaEntry[] = [];
const orderBookCheckpoints: OrderBookCheckpoint[] = [
  {
    deltaIndex: 0,
    levels: new Map(initialOrderBookLevels),
  },
];
const heatmapTileScaleRate = 1.12;
const maxOrderBookHeatmapCachedTiles = 512;
const heatmapTileResolution: [time: number, price: number] = [128, 1024];
const heatmapPriceOrigin = 0;
const orderBookHeatmapCache: OrderBookHeatmapCacheState = {
  baseCellSize: null,
  selectedLevel: [0, 0],
  tiles: new Map(),
};
const pendingOrderBookLevelDeltas = new Map<number, number>();

const recordPendingOrderBookDelta = (
  price: number,
  sizeDelta: number,
): void => {
  applyOrderBookLevelDelta(pendingOrderBookLevelDeltas, price, sizeDelta);
  applyOrderBookLevelDelta(currentOrderBookLevels, price, sizeDelta);
};

const findFirstOrderBookDeltaAtOrAfter = (timestamp: number): number => {
  let low = 0;
  let high = orderBookDeltaHistory.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (orderBookDeltaHistory[mid]!.timestamp < timestamp) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

const findLastCheckpointAtOrBeforeDeltaIndex = (
  deltaIndex: number,
): OrderBookCheckpoint => {
  let low = 0;
  let high = orderBookCheckpoints.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (orderBookCheckpoints[mid]!.deltaIndex <= deltaIndex) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return orderBookCheckpoints[Math.max(0, low - 1)]!;
};

const buildNearestActiveColumns = (activeColumns: Uint8Array): Int32Array => {
  const nearestActiveColumns = new Int32Array(activeColumns.length * 2).fill(-1);
  let lastActive = -1;

  for (let x = 0; x < activeColumns.length; x += 1) {
    if (activeColumns[x] === 1) {
      lastActive = x;
    }
    nearestActiveColumns[x * 2] = lastActive;
  }

  lastActive = -1;
  for (let x = activeColumns.length - 1; x >= 0; x -= 1) {
    if (activeColumns[x] === 1) {
      lastActive = x;
    }
    nearestActiveColumns[x * 2 + 1] = lastActive;
  }

  return nearestActiveColumns;
};

const getLatestOrderBookTimestamp = (): number =>
  orderBookDeltaHistory[orderBookDeltaHistory.length - 1]?.timestamp ?? initialTimestamp;

const getOrderBookHeatmapCellSize = (
  region: OrderBookHeatmapRegion,
  resolution: readonly [number, number] = region.resolution,
): [time: number, price: number] => [
  Math.max(region.timestamp[1] - region.timestamp[0], 1) / Math.max(1, resolution[0]),
  Math.max(region.price[1] - region.price[0], Number.EPSILON) / Math.max(1, resolution[1]),
];

const shouldBypassOrderBookHeatmapCache = (region: OrderBookHeatmapRegion): boolean =>
  region.resolution[0] <= 1 || region.resolution[1] <= 1;

const selectOrderBookHeatmapLevel = (baseCellSize: number, currentLevel: number, targetCellSize: number): number => {
  let level = currentLevel;
  let selectedCellSize = baseCellSize * heatmapTileScaleRate ** level;

  while (targetCellSize < selectedCellSize / heatmapTileScaleRate) {
    level -= 1;
    selectedCellSize /= heatmapTileScaleRate;
  }

  while (targetCellSize >= selectedCellSize * heatmapTileScaleRate) {
    level += 1;
    selectedCellSize *= heatmapTileScaleRate;
  }

  return level + 1;
};

const getOrderBookHeatmapTileKey = (level: readonly [number, number], tile: readonly [number, number]): string =>
  `${level[0]}:${level[1]}:${tile[0]}:${tile[1]}`;

const getOrderBookHeatmapTileRegion = (
  cellSize: readonly [number, number],
  tile: readonly [number, number],
): OrderBookHeatmapRegion => {
  const timeSpan = cellSize[0] * heatmapTileResolution[0];
  const priceSpan = cellSize[1] * heatmapTileResolution[1];
  const timeStart = initialTimestamp + tile[0] * timeSpan;
  const priceStart = heatmapPriceOrigin + tile[1] * priceSpan;

  return {
    timestamp: [timeStart, timeStart + timeSpan],
    price: [priceStart, priceStart + priceSpan],
    resolution: [...heatmapTileResolution],
  };
};

const touchOrderBookHeatmapTile = (
  key: string,
  tile: CachedOrderBookHeatmapTile,
): CachedOrderBookHeatmapTile => {
  orderBookHeatmapCache.tiles.delete(key);
  orderBookHeatmapCache.tiles.set(key, tile);
  return tile;
};

const evictLeastRecentlyUsedOrderBookHeatmapTiles = (): void => {
  while (orderBookHeatmapCache.tiles.size > maxOrderBookHeatmapCachedTiles) {
    const leastRecentlyUsedKey = orderBookHeatmapCache.tiles.keys().next().value;
    if (!leastRecentlyUsedKey) {
      break;
    }

    orderBookHeatmapCache.tiles.delete(leastRecentlyUsedKey);
  }
};

const sampleOrderBookHeatmapTile = (tile: CachedOrderBookHeatmapTile, x: number, y: number): number => {
  if (x < 0 || x >= tile.heatmap.width || y < 0 || y >= tile.heatmap.height) {
    return 0;
  }

  const offset = y * tile.heatmap.width + x;
  const directSize = tile.heatmap.sizes[offset] ?? 0;
  if (tile.heatmap.activeColumns[x] === 1) {
    return directSize;
  }

  const nearestOffset = x * 2;
  const leftColumn = tile.nearestActiveColumns[nearestOffset] ?? -1;
  const rightColumn = tile.nearestActiveColumns[nearestOffset + 1] ?? -1;
  if (leftColumn >= 0 && rightColumn >= 0 && leftColumn !== rightColumn) {
    const leftSize = tile.heatmap.sizes[y * tile.heatmap.width + leftColumn] ?? 0;
    const rightSize = tile.heatmap.sizes[y * tile.heatmap.width + rightColumn] ?? 0;
    const span = Math.max(rightColumn - leftColumn, 1);
    const t = (x - leftColumn) / span;
    return leftSize + (rightSize - leftSize) * t;
  }
  if (leftColumn >= 0) {
    return tile.heatmap.sizes[y * tile.heatmap.width + leftColumn] ?? 0;
  }
  if (rightColumn >= 0) {
    return tile.heatmap.sizes[y * tile.heatmap.width + rightColumn] ?? 0;
  }

  return 0;
};

const buildOrderBookRegionRaw = (region: OrderBookHeatmapRegion): OrderBookHeatmap => {
  const computeStart = performance.now();
  const width = Math.max(1, region.resolution[0]);
  const height = Math.max(1, region.resolution[1]);
  const cellSize = getOrderBookHeatmapCellSize(region, [width, height]);
  const sizes = new Float32Array(width * height);
  const activeColumns = new Uint8Array(width);
  let maxSize = 0;
  let columnsAccumulated = 0;
  let accumulatedLevelCount = 0;
  let inRangeDeltaCount = 0;

  const addLevelContribution = (x: number, price: number, sizeContribution: number): void => {
    if (price < region.price[0] || price > region.price[1]) {
      return;
    }

    const y = Math.floor((price - region.price[0]) / cellSize[1]);
    if (y < 0 || y >= height) {
      return;
    }

    const offset = y * width + x;
    const nextSize = sizes[offset]! + sizeContribution;
    sizes[offset] = nextSize;
    activeColumns[x] = 1;
    if (nextSize > maxSize) {
      maxSize = nextSize;
    }
  };

  const accumulateLevels = (levels: OrderBookLevels, x: number, sampleCount: number) => {
    if (sampleCount <= 0) {
      return;
    }

    columnsAccumulated += 1;
    accumulatedLevelCount += levels.size;
    for (const [price, size] of levels) {
      addLevelContribution(x, price, size * sampleCount);
    }
  };

  const applyHistoryEntry = (levels: OrderBookLevels, entry: OrderBookDeltaEntry): void => {
    for (const delta of entry.deltas) {
      applyOrderBookLevelDelta(levels, delta.price, delta.sizeDelta);
    }
  };

  const firstDeltaInRange = findFirstOrderBookDeltaAtOrAfter(region.timestamp[0]);
  const checkpoint = findLastCheckpointAtOrBeforeDeltaIndex(firstDeltaInRange);
  const orderBookLevels = new Map(checkpoint.levels);

  for (let deltaIndex = checkpoint.deltaIndex; deltaIndex < firstDeltaInRange; deltaIndex += 1) {
    applyHistoryEntry(orderBookLevels, orderBookDeltaHistory[deltaIndex]!);
  }
  const levelCountAtReplayStart = orderBookLevels.size;
  const initialSampleColumn =
    initialTimestamp >= region.timestamp[0] && initialTimestamp <= region.timestamp[1]
      ? Math.floor((initialTimestamp - region.timestamp[0]) / cellSize[0])
      : -1;
  const columnEventCounts = new Uint32Array(width);
  let lastDeltaIndexExclusive = firstDeltaInRange;

  for (let deltaIndex = firstDeltaInRange; deltaIndex < orderBookDeltaHistory.length; deltaIndex += 1) {
    const entry = orderBookDeltaHistory[deltaIndex]!;
    if (entry.timestamp > region.timestamp[1]) {
      break;
    }

    inRangeDeltaCount += 1;
    const x = Math.floor((entry.timestamp - region.timestamp[0]) / cellSize[0]);
    if (x >= 0 && x < width) {
      columnEventCounts[x] += 1;
    }
    lastDeltaIndexExclusive = deltaIndex + 1;
  }

  let activeColumn = -1;
  let remainingColumnEvents = 0;

  for (let deltaIndex = firstDeltaInRange; deltaIndex < lastDeltaIndexExclusive; deltaIndex += 1) {
    const entry = orderBookDeltaHistory[deltaIndex]!;
    const x = Math.floor((entry.timestamp - region.timestamp[0]) / cellSize[0]);
    if (x >= 0 && x < width && x !== activeColumn) {
      const initialSamples = x === initialSampleColumn ? 1 : 0;
      remainingColumnEvents = columnEventCounts[x]!;
      accumulateLevels(orderBookLevels, x, remainingColumnEvents + initialSamples);
      activeColumn = x;
    }

    for (const delta of entry.deltas) {
      if (x >= 0 && x < width && remainingColumnEvents > 0) {
        addLevelContribution(x, delta.price, delta.sizeDelta * remainingColumnEvents);
      }
      applyOrderBookLevelDelta(orderBookLevels, delta.price, delta.sizeDelta);
    }

    if (x >= 0 && x < width && remainingColumnEvents > 0) {
      remainingColumnEvents -= 1;
    }
  }

  if (initialSampleColumn >= 0 && initialSampleColumn < width && columnEventCounts[initialSampleColumn] === 0) {
    accumulateLevels(initialOrderBookLevels, initialSampleColumn, 1);
  }

  return {
    width,
    height,
    sizes,
    activeColumns,
    maxSize,
    profile: {
      computeMs: performance.now() - computeStart,
      width,
      height,
      cellCount: width * height,
      checkpointCount: orderBookCheckpoints.length,
      checkpointDeltaIndex: checkpoint.deltaIndex,
      replayedDeltaCount: firstDeltaInRange - checkpoint.deltaIndex,
      inRangeDeltaCount,
      columnsAccumulated,
      accumulatedLevelCount,
      levelCountAtReplayStart,
      levelCountAtReplayEnd: orderBookLevels.size,
    },
  };
};

const getOrderBookHeatmapTile = (
  level: readonly [number, number],
  cellSize: readonly [number, number],
  tile: readonly [number, number],
): { tile: CachedOrderBookHeatmapTile; built: boolean } => {
  const key = getOrderBookHeatmapTileKey(level, tile);
  const latestTimestamp = getLatestOrderBookTimestamp();
  const cachedTile = orderBookHeatmapCache.tiles.get(key);
  if (
    cachedTile &&
    !(
      latestTimestamp > cachedTile.latestTimestampAtBuild &&
      cachedTile.region.timestamp[1] > cachedTile.latestTimestampAtBuild
    )
  ) {
    return { tile: touchOrderBookHeatmapTile(key, cachedTile), built: false };
  }

  const region = getOrderBookHeatmapTileRegion(cellSize, tile);
  const heatmap = buildOrderBookRegionRaw(region);
  const nextTile: CachedOrderBookHeatmapTile = {
    level: [level[0], level[1]],
    tile: [tile[0], tile[1]],
    region,
    heatmap,
    nearestActiveColumns: buildNearestActiveColumns(heatmap.activeColumns),
    latestTimestampAtBuild: latestTimestamp,
  };
  orderBookHeatmapCache.tiles.delete(key);
  orderBookHeatmapCache.tiles.set(key, nextTile);
  evictLeastRecentlyUsedOrderBookHeatmapTiles();
  return { tile: nextTile, built: true };
};

export const getOrderBookRegion = (region: OrderBookHeatmapRegion): OrderBookHeatmap => {
  if (shouldBypassOrderBookHeatmapCache(region)) {
    return buildOrderBookRegionRaw(region);
  }

  const computeStart = performance.now();
  const targetCellSize = getOrderBookHeatmapCellSize(region);
  if (!orderBookHeatmapCache.baseCellSize) {
    orderBookHeatmapCache.baseCellSize = [...targetCellSize];
    orderBookHeatmapCache.selectedLevel = [0, 0];
  }

  const [baseTimeCellSize, basePriceCellSize] = orderBookHeatmapCache.baseCellSize;
  const nextLevel: [number, number] = [
    selectOrderBookHeatmapLevel(baseTimeCellSize, orderBookHeatmapCache.selectedLevel[0], targetCellSize[0]),
    selectOrderBookHeatmapLevel(basePriceCellSize, orderBookHeatmapCache.selectedLevel[1], targetCellSize[1]),
  ];
  orderBookHeatmapCache.selectedLevel = nextLevel;

  const levelCellSize: [number, number] = [
    baseTimeCellSize * heatmapTileScaleRate ** nextLevel[0],
    basePriceCellSize * heatmapTileScaleRate ** nextLevel[1],
  ];
  const tileTimeSpan = levelCellSize[0] * heatmapTileResolution[0];
  const tilePriceSpan = levelCellSize[1] * heatmapTileResolution[1];
  const minTileX = Math.floor((region.timestamp[0] - initialTimestamp) / tileTimeSpan);
  const maxTileXExclusive = Math.max(minTileX + 1, Math.ceil((region.timestamp[1] - initialTimestamp) / tileTimeSpan));
  const minTileY = Math.floor((region.price[0] - heatmapPriceOrigin) / tilePriceSpan);
  const maxTileYExclusive = Math.max(minTileY + 1, Math.ceil((region.price[1] - heatmapPriceOrigin) / tilePriceSpan));
  const tileGridWidth = maxTileXExclusive - minTileX;
  const tileGridHeight = maxTileYExclusive - minTileY;
  const tiles = new Array<CachedOrderBookHeatmapTile | undefined>(tileGridWidth * tileGridHeight);
  let cacheTilesBuilt = 0;
  let replayedDeltaCount = 0;
  let inRangeDeltaCount = 0;
  let checkpointDeltaIndex = orderBookDeltaHistory.length;

  for (let tileY = minTileY; tileY < maxTileYExclusive; tileY += 1) {
    for (let tileX = minTileX; tileX < maxTileXExclusive; tileX += 1) {
      const tileEntry = getOrderBookHeatmapTile(nextLevel, levelCellSize, [tileX, tileY]);
      const tileOffset = (tileY - minTileY) * tileGridWidth + (tileX - minTileX);
      tiles[tileOffset] = tileEntry.tile;
      if (tileEntry.built) {
        cacheTilesBuilt += 1;
        replayedDeltaCount += tileEntry.tile.heatmap.profile.replayedDeltaCount;
        inRangeDeltaCount += tileEntry.tile.heatmap.profile.inRangeDeltaCount;
        checkpointDeltaIndex = Math.min(checkpointDeltaIndex, tileEntry.tile.heatmap.profile.checkpointDeltaIndex);
      }
    }
  }

  const requestedWidth = Math.max(1, region.resolution[0]);
  const requestedHeight = Math.max(1, region.resolution[1]);
  const timeSpan = Math.max(region.timestamp[1] - region.timestamp[0], 1);
  const priceSpan = Math.max(region.price[1] - region.price[0], Number.EPSILON);
  const width = Math.max(1, Math.min(requestedWidth, Math.ceil(timeSpan / levelCellSize[0])));
  const height = Math.max(1, Math.min(requestedHeight, Math.ceil(priceSpan / levelCellSize[1])));
  const sizes = new Float32Array(width * height);
  const activeColumns = new Uint8Array(width);
  const sampledColumns = new Int32Array(width * 2);
  const sampledRows = new Int32Array(height * 2);

  for (let x = 0; x < width; x += 1) {
    const sampleTime = region.timestamp[0] + ((x + 0.5) * timeSpan) / width;
    const globalColumn = Math.floor((sampleTime - initialTimestamp) / levelCellSize[0]);
    const tileX = Math.floor(globalColumn / heatmapTileResolution[0]);
    sampledColumns[x * 2] = tileX;
    sampledColumns[x * 2 + 1] = globalColumn - tileX * heatmapTileResolution[0];
  }

  for (let y = 0; y < height; y += 1) {
    const samplePrice = region.price[0] + ((y + 0.5) * priceSpan) / height;
    const globalRow = Math.floor((samplePrice - heatmapPriceOrigin) / levelCellSize[1]);
    const tileY = Math.floor(globalRow / heatmapTileResolution[1]);
    sampledRows[y * 2] = tileY;
    sampledRows[y * 2 + 1] = globalRow - tileY * heatmapTileResolution[1];
  }

  let maxSize = 0;
  let columnsAccumulated = 0;
  let accumulatedLevelCount = 0;

  for (let x = 0; x < width; x += 1) {
    const tileX = sampledColumns[x * 2]!;
    const localX = sampledColumns[x * 2 + 1]!;
    let columnActive = false;

    for (let y = 0; y < height; y += 1) {
      const tileY = sampledRows[y * 2]!;
      const localY = sampledRows[y * 2 + 1]!;
      let size = 0;

      if (tileX >= minTileX && tileX < maxTileXExclusive && tileY >= minTileY && tileY < maxTileYExclusive) {
        const tile = tiles[(tileY - minTileY) * tileGridWidth + (tileX - minTileX)];
        if (tile) {
          size = sampleOrderBookHeatmapTile(tile, localX, localY);
        }
      }

      sizes[y * width + x] = size;
      if (size > 0) {
        columnActive = true;
        accumulatedLevelCount += 1;
        if (size > maxSize) {
          maxSize = size;
        }
      }
    }

    if (columnActive) {
      activeColumns[x] = 1;
      columnsAccumulated += 1;
    }
  }

  return {
    width,
    height,
    sizes,
    activeColumns,
    maxSize,
    profile: {
      computeMs: performance.now() - computeStart,
      width,
      height,
      cellCount: width * height,
      checkpointCount: orderBookCheckpoints.length,
      checkpointDeltaIndex: cacheTilesBuilt > 0 ? checkpointDeltaIndex : 0,
      replayedDeltaCount,
      inRangeDeltaCount,
      columnsAccumulated,
      accumulatedLevelCount,
      levelCountAtReplayStart: 0,
      levelCountAtReplayEnd: 0,
      cacheLevel: [...nextLevel],
      cacheTileCount: tileGridWidth * tileGridHeight,
      cacheTilesBuilt,
      cacheTilesReused: tileGridWidth * tileGridHeight - cacheTilesBuilt,
    },
  };
};

export const getOrderBookHistogram = (
  region: OrderBookHistogramRegion,
): OrderBookHistogramEntry[] => {
  const cellHeight =
    Math.max(region.price[1] - region.price[0], Number.EPSILON) /
    region.resolution;
  const histogram = new Map<string, OrderBookHistogramEntry>();
  const histogramKey = (y: number, kind: OrderSide): string =>
    JSON.stringify([y, kind]);

  for (let y = 0; y < region.resolution; y += 1) {
    histogram.set(histogramKey(y, "buy"), { y, kind: "buy", size: 0 });
    histogram.set(histogramKey(y, "sell"), { y, kind: "sell", size: 0 });
  }

  for (const [kind, orders] of [
    ["buy", orderBook.buy],
    ["sell", orderBook.sell],
  ] as const) {
    for (const order of orders) {
      if (order.price < region.price[0] || order.price > region.price[1]) {
        continue;
      }

      const y = Math.floor((order.price - region.price[0]) / cellHeight);
      const entry = histogram.get(histogramKey(y, kind));
      if (!entry) continue;

      entry.size += order.size;
    }
  }

  return Array.from(histogram.values()).sort((left, right) => left.y - right.y);
};

const priceHistory: PriceHistoryEntry[] = [
  {
    timestamp: initialTimestamp,
    spread: {
      buy: 1.01,
      sell: 0.99,
    },
  },
];

const recordMarketState = () => {
  if (pendingOrderBookLevelDeltas.size === 0) {
    return;
  }

  const timestamp = Date.now();

  priceHistory.push({
    timestamp,
    spread: marketPriceSpread(),
  });
  orderBookDeltaHistory.push({
    timestamp,
    deltas: Array.from(
      pendingOrderBookLevelDeltas,
      ([price, sizeDelta]): OrderBookLevelDelta => ({
        price,
        sizeDelta,
      }),
    ),
  });
  if (orderBookDeltaHistory.length % orderBookCheckpointInterval === 0) {
    orderBookCheckpoints.push({
      deltaIndex: orderBookDeltaHistory.length,
      levels: new Map(currentOrderBookLevels),
    });
  }
  pendingOrderBookLevelDeltas.clear();
};

const candleHistoryEntries = (
  start: number,
  end: number,
): PriceHistoryEntry[] => {
  const open = (() => {
    for (let i = priceHistory.length - 1; i >= 0; i -= 1) {
      const entry = priceHistory[i];
      if (entry.timestamp <= start) {
        return entry;
      }
    }

    return priceHistory[0];
  })();
  const entries = priceHistory.filter(
    (entry) => entry.timestamp > start && entry.timestamp <= end,
  );
  return [open, ...entries];
};

export const priceHistoryCandle = (
  start: number,
  end: number,
  side: OrderSide,
): PriceCandle => {
  const entries = candleHistoryEntries(start, end);
  const open = entries[0].spread[side];
  const close = entries[entries.length - 1].spread[side];
  const prices = entries.map((entry) => entry.spread[side]);
  const high = prices.reduce((current, price) => Math.max(current, price));
  const low = prices.reduce((current, price) => Math.min(current, price));

  return { time: start, open, high, low, close };
};

// // for each order id, tradeHistory.filter(id).sum() == order.size
// const tradeHistory: TradeHistoryEntry[] = [];

let nextOrderId = 0;
export const makeOrder = (side: OrderSide, order: Order): number => {
  const id = nextOrderId++;
  const orderWithId = { ...order, id };
  const result = takeOrder(side, order.size, order.price);
  if (result.fulfilled === order.size) {
    return id;
  }

  orderWithId.size = order.size - result.fulfilled;

  orderBook[side].push(orderWithId);
  recordPendingOrderBookDelta(orderWithId.price, orderWithId.size);
  orderBook[side].sort((a, b) =>
    side === "sell" ? b.price - a.price : a.price - b.price,
  );

  recordMarketState();

  return id;
};

export const takeOrder = (
  side: OrderSide,
  size: number,
  price?: number,
): { id: number; fulfilled: number } => {
  let fulfilled = 0;
  const id = nextOrderId++;
  const orders = orderBook[oppositeSide(side)];

  while (fulfilled < size) {
    const order = orders.pop();
    if (!order) {
      if (fulfilled > 0) recordMarketState();
      return { id, fulfilled };
    }

    if (price !== undefined && side === "buy" && order.price > price) {
      orders.push(order);
      if (fulfilled > 0) recordMarketState();
      return { id, fulfilled };
    }

    if (price !== undefined && side === "sell" && order.price < price) {
      orders.push(order);
      if (fulfilled > 0) recordMarketState();
      return { id, fulfilled };
    }

    if (fulfilled + order.size > size) {
      const remainingSize = size - fulfilled;
      fulfilled += remainingSize;
      recordPendingOrderBookDelta(order.price, -remainingSize);
      // tradeHistory.push({
      //   buyOrderId: side === "buy" ? id : order.id,
      //   sellOrderId: side === "sell" ? id : order.id,
      //   price: order.price,
      //   size: remainingSize,
      // });
      orders.push({
        id: order.id,
        price: order.price,
        size: order.size - remainingSize,
      });
      recordMarketState();

      return { id, fulfilled };
    }

    fulfilled += order.size;
    recordPendingOrderBookDelta(order.price, -order.size);
    // tradeHistory.push({
    //   buyOrderId: side === "buy" ? id : order.id,
    //   sellOrderId: side === "sell" ? id : order.id,
    //   price: order.price,
    //   size: order.size,
    // });
  }

  recordMarketState();
  return { id, fulfilled };
};

export const marketPriceSpread = (): PriceSpread => {
  const lastSpread = priceHistory[priceHistory.length - 1]?.spread;

  return {
    buy:
      orderBook.sell[orderBook.sell.length - 1]?.price ?? lastSpread.buy ?? 0,
    sell:
      orderBook.buy[orderBook.buy.length - 1]?.price ?? lastSpread.sell ?? 0,
  };
};

export const oppositeSide = (side: OrderSide): OrderSide =>
  side === "buy" ? "sell" : "buy";
