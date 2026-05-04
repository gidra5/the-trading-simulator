import { Accessor, createMemo } from "solid-js";
import { OrderSide, RegisteredOrder } from "./order";
import { OrderBookChangeset } from "./orderBook";

export type OrderBookHistogramEntry = {
  kind: OrderSide;
  y: number;
  size: number;
};

export type OrderBookHistogramRegion = {
  price: [min: number, max: number];
  resolution: number;
};

export type OrderBookHistogramSeries = {
  cellHeight: number;
  sizes: number[];
};

// todo: ref price?
type TreeState = {
  maxLogPrice: number;
  minLogPrice: number;
  volume: number;
} & (
  | {
      kind: "node";
      count: number;
      children: Array<TreeState>;
    }
  | {
      kind: "leaf";
      value: Array<RegisteredOrder>; // single price point inside the range
    }
);

const FANOUT = 2;

// todo: update to require price reference
const getLogPrice = (price: number, ref = 1) => Math.log2(price / ref);

const makeLeaf = (minLogPrice: number, maxLogPrice: number): TreeState => ({
  minLogPrice,
  maxLogPrice,
  volume: 0,
  kind: "leaf",
  value: [],
});

const getChildIndex = (state: TreeState, logPrice: number): number => {
  const t = (logPrice - state.minLogPrice) / (state.maxLogPrice - state.minLogPrice);

  return Math.max(0, Math.min(FANOUT - 1, Math.floor(t * FANOUT)));
};

const makeChildren = (state: TreeState): Array<TreeState> => {
  const width = (state.maxLogPrice - state.minLogPrice) / FANOUT;

  return Array.from({ length: FANOUT }, (_, i) =>
    makeLeaf(state.minLogPrice + width * i, state.minLogPrice + width * (i + 1)),
  );
};

const leafPriceMatches = (leaf: Extract<TreeState, { kind: "leaf" }>, logPrice: number) => {
  if (leaf.value.length === 0) return true;

  return getLogPrice(leaf.value[0].price) === logPrice;
};

const canSplit = (state: TreeState, depth: number): boolean => {
  return true;
};

const insertOrder = (state: TreeState, order: RegisteredOrder, depth = 0): boolean => {
  const logPrice = getLogPrice(order.price);
  const volume = order.size;

  if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
    return false;
  }

  if (state.kind === "leaf") {
    const canStayLeaf = leafPriceMatches(state, logPrice) || !canSplit(state, depth);

    if (canStayLeaf) {
      //todo: sort/binary insert
      state.value.push(order);
      state.volume += volume;
      return true;
    }

    const existing = state.value;
    const children = makeChildren(state);

    Object.assign(state, {
      kind: "node" as const,
      count: 0,
      children,
      volume: 0,
    });

    for (const oldOrder of existing) {
      insertOrder(state, oldOrder, depth);
    }

    return insertOrder(state, order, depth);
  }

  const childIndex = getChildIndex(state, logPrice);
  const child = state.children[childIndex];

  const inserted = insertOrder(child, order, depth + 1);

  if (inserted) {
    state.volume += volume;
    state.count += 1;
  }

  return inserted;
};

// todo: truncate empty nodes
const removeOrder = (state: TreeState, logPrice: number, id: number): boolean => {
  if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
    return false;
  }

  if (state.kind === "leaf") {
    //todo: binary search, should be sorted by id
    const index = state.value.findIndex((order) => order.id === id);
    if (index === -1) return false;

    state.value.splice(index, 1);
    state.volume = state.value.reduce((sum, order) => sum + order.size, 0);
    return true;
  }

  const childIndex = getChildIndex(state, logPrice);
  const child = state.children[childIndex];

  const removed = removeOrder(child, logPrice, id);

  if (removed) {
    state.volume = state.children.reduce((sum, child) => sum + child.volume, 0);
    state.count -= 1;
  }

  return removed;
};

const partialFillOrder = (state: TreeState, logPrice: number, id: number, order: RegisteredOrder): number => {
  if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
    return 0;
  }

  if (state.kind === "leaf") {
    //todo: binary search, should be sorted by id
    const index = state.value.findIndex((order) => order.id === id);
    if (index === -1) return 0;

    const [removed] = state.value.splice(index, 1, order);
    const delta = removed.size - order.size;
    state.volume -= delta;

    return delta;
  }

  const childIndex = getChildIndex(state, logPrice);
  const child = state.children[childIndex];

  const delta = partialFillOrder(child, logPrice, id, order);
  state.volume -= delta;
  return delta;
};

type Options = {
  orderBookChangeset: Accessor<OrderBookChangeset>;
  priceReference: Accessor<number>;
};

export const createHistogramState = (options: Options) => {
  const treeState = createMemo<{ buyTree: TreeState; sellTree: TreeState }>(
    (state) => {
      const changes = options.orderBookChangeset();

      for (const change of changes) {
        const tree = change.side === "buy" ? state.buyTree : state.sellTree;
        if (change.kind === "add") insertOrder(tree, change.order);
        else if (change.kind === "remove")
          removeOrder(tree, getLogPrice(change.order.price, options.priceReference()), change.order.id);
        else
          partialFillOrder(
            tree,
            getLogPrice(change.order.price, options.priceReference()),
            change.order.id,
            change.order,
          );
      }

      return state;
    },
    {
      buyTree: {
        minLogPrice: -2,
        maxLogPrice: 2,
        volume: 0,
        kind: "leaf",
        value: [],
      },
      sellTree: {
        minLogPrice: -2,
        maxLogPrice: 2,
        volume: 0,
        kind: "leaf",
        value: [],
      },
    },
    { equals: false },
  );
  const buyTreeState = () => treeState().buyTree;
  const sellTreeState = () => treeState().sellTree;

  const queryVolumeInPriceRange = (
    state: TreeState,
    minPrice: number,
    maxPrice: number,
    includeMax = false,
  ): number => {
    if (maxPrice <= 0 || maxPrice < minPrice) return 0;

    const safeMinPrice = Math.max(minPrice, Number.MIN_VALUE);
    const safeMaxPrice = Math.max(maxPrice, safeMinPrice);

    const minLogPrice = getLogPrice(safeMinPrice);
    const maxLogPrice = getLogPrice(safeMaxPrice);

    return queryVolumeInRange(state, minLogPrice, maxLogPrice, minPrice, maxPrice, includeMax);
  };
  const querySideVolumeInPriceRange = (
    side: OrderSide,
    minPrice: number,
    maxPrice: number,
    includeMax = false,
  ): number => {
    const tree = side === "buy" ? buyTreeState() : sellTreeState();
    return queryVolumeInPriceRange(tree, minPrice, maxPrice, includeMax);
  };
  const queryVolumeInRange = (
    state: TreeState,
    minLogPrice: number,
    maxLogPrice: number,
    minPrice: number,
    maxPrice: number,
    includeMax: boolean,
  ): number => {
    if (maxLogPrice <= state.minLogPrice || state.maxLogPrice <= minLogPrice) return 0;
    if (minLogPrice <= state.minLogPrice && state.maxLogPrice <= maxLogPrice) return state.volume;

    if (state.kind === "node") {
      let volume = 0;

      for (const child of state.children) {
        volume += queryVolumeInRange(child, minLogPrice, maxLogPrice, minPrice, maxPrice, includeMax);
      }

      return volume;
    }

    let volume = 0;

    for (const order of state.value) {
      const price = order.price;
      const inside = includeMax ? price >= minPrice && price <= maxPrice : price >= minPrice && price < maxPrice;

      if (inside) volume += order.size;
    }

    return volume;
  };

  const getOrderBookHistogram = (region: OrderBookHistogramRegion): OrderBookHistogramEntry[] => {
    const resolution = region.resolution;
    if (resolution === 0) return [];

    const minPrice = region.price[0];
    const maxPrice = region.price[1];
    const cellHeight = Math.max(maxPrice - minPrice, Number.EPSILON) / resolution;
    const buyTree = buyTreeState();
    const sellTree = sellTreeState();

    const histogram: OrderBookHistogramEntry[] = [];

    for (let y = 0; y < resolution; y += 1) {
      const cellMinPrice = minPrice + y * cellHeight;
      const cellMaxPrice = y === resolution - 1 ? maxPrice + Number.EPSILON : minPrice + (y + 1) * cellHeight;

      histogram.push({
        y,
        kind: "buy",
        size: queryVolumeInPriceRange(buyTree, cellMinPrice, cellMaxPrice),
      });

      histogram.push({
        y,
        kind: "sell",
        size: queryVolumeInPriceRange(sellTree, cellMinPrice, cellMaxPrice),
      });
    }

    return histogram;
  };

  const getOrderBookHistogramSeries = (region: OrderBookHistogramRegion, side: OrderSide): OrderBookHistogramSeries => {
    const resolution = Math.max(0, Math.floor(region.resolution));
    const cellHeight = Math.max(region.price[1] - region.price[0], Number.EPSILON) / Math.max(resolution, 1);
    const sizes = new Array<number>(resolution).fill(0);

    if (resolution === 0) return { cellHeight, sizes };

    const tree = side === "buy" ? buyTreeState() : sellTreeState();
    const minPrice = region.price[0];

    for (let y = 0; y < resolution; y += 1) {
      const cellMinPrice = minPrice + y * cellHeight;
      const cellMaxPrice = minPrice + (y + 1) * cellHeight;
      const includeMax = y === resolution - 1;

      sizes[y] = queryVolumeInPriceRange(tree, cellMinPrice, cellMaxPrice, includeMax);
    }

    return { cellHeight, sizes };
  };
  return { getOrderBookHistogramSeries, getOrderBookHistogram, querySideVolumeInPriceRange };
};
