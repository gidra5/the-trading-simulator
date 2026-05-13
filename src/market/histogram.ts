import { Accessor, createMemo } from "solid-js";
import { OrderSide, RestingOrder } from "./order";
import { OrderBookChangeset } from "./orderBook";
import { binarySearchIndex, inRange } from "../utils";

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

type HistogramAccelerationStructureOptions = {
  orderBookChangeset: Accessor<OrderBookChangeset>;
  priceReference: Accessor<number>;
  fanout: Accessor<number>;
};

// todo: lower gc runtime to avoid stutters
// todo: lazy update propagation?
const createHistogramAccelerationStructure = (options: HistogramAccelerationStructureOptions) => {
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
        value: Array<RestingOrder>; // single price point inside the range
      }
  );

  const getLogPrice = (price: number) => Math.log2(price / options.priceReference()) / Math.log2(options.fanout());
  const getPrice = (logPrice: number) => options.priceReference() * options.fanout() ** logPrice;

  const makeLeaf = (minLogPrice: number, maxLogPrice: number): TreeState => ({
    minLogPrice,
    maxLogPrice,
    volume: 0,
    kind: "leaf",
    value: [],
  });

  const makeTree = () => makeLeaf(-2, 2);

  const getChildIndex = (state: TreeState, logPrice: number): number => {
    const childCount = state.kind === "node" ? state.children.length : options.fanout();
    const t = (logPrice - state.minLogPrice) / (state.maxLogPrice - state.minLogPrice);

    return Math.max(0, Math.min(childCount - 1, Math.floor(t * childCount)));
  };

  const makeChildren = (state: TreeState): Array<TreeState> => {
    const childCount = options.fanout();
    const width = (state.maxLogPrice - state.minLogPrice) / childCount;

    return Array.from({ length: childCount }, (_, i) =>
      makeLeaf(state.minLogPrice + width * i, state.minLogPrice + width * (i + 1)),
    );
  };

  const leafPriceMatches = (leaf: Extract<TreeState, { kind: "leaf" }>, logPrice: number) => {
    if (leaf.value.length === 0) return true;

    return getLogPrice(leaf.value[0].price) === logPrice;
  };


  const insertOrderById = (orders: Array<RestingOrder>, order: RestingOrder): void => {
    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || lastOrder.id < order.id) {
      orders.push(order);
      return;
    }

    const index = binarySearchIndex(orders, (_order) => _order.id - order.id);
    orders.splice(index, 0, order);
  };

  const truncateEmptyNode = (state: Extract<TreeState, { kind: "node" }>): void => {
    if (state.count !== 0) return;

    const leaf = state as unknown as Extract<TreeState, { kind: "leaf" }> & {
      count?: number;
      children?: Array<TreeState>;
    };

    leaf.kind = "leaf";
    leaf.volume = 0;
    leaf.value = [];
    leaf.count = undefined;
    leaf.children = undefined;
  };

  const canSplit = (state: TreeState, depth: number): boolean => {
    return true;
  };

  const insertOrder = (state: TreeState, order: RestingOrder, depth = 0): boolean => {
    const logPrice = getLogPrice(order.price);
    if (!inRange(logPrice, state.minLogPrice, state.maxLogPrice)) return false;

    const volume = order.size;

    if (state.kind === "leaf") {
      const canStayLeaf = leafPriceMatches(state, logPrice) || !canSplit(state, depth);

      if (canStayLeaf) {
        insertOrderById(state.value, order);
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

  const removeOrder = (state: TreeState, logPrice: number, id: number): boolean => {
    if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
      return false;
    }

    if (state.kind === "leaf") {
      const index = binarySearchIndex(state.value, (order) => order.id - id);
      const removedOrder = state.value[index];
      if (!removedOrder || removedOrder.id !== id) return false;

      state.value.splice(index, 1);
      state.volume -= removedOrder.size;
      return true;
    }

    const childIndex = getChildIndex(state, logPrice);
    const child = state.children[childIndex];

    const removed = removeOrder(child, logPrice, id);

    if (removed) {
      state.volume = state.children.reduce((sum, child) => sum + child.volume, 0);
      state.count -= 1;
      truncateEmptyNode(state);
    }

    return removed;
  };

  const partialFillOrder = (state: TreeState, logPrice: number, id: number, order: RestingOrder): number => {
    if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
      return 0;
    }

    if (state.kind === "leaf") {
      const index = binarySearchIndex(state.value, (order) => order.id - id);
      const previousOrder = state.value[index];
      if (!previousOrder || previousOrder.id !== id) return 0;

      state.value[index] = order;
      const delta = previousOrder.size - order.size;
      state.volume -= delta;

      return delta;
    }

    const childIndex = getChildIndex(state, logPrice);
    const child = state.children[childIndex];

    const delta = partialFillOrder(child, logPrice, id, order);
    state.volume -= delta;
    return delta;
  };

  const treeState = createMemo<{ buyTree: TreeState; sellTree: TreeState }>(
    (state) => {
      const changes = options.orderBookChangeset();

      for (const change of changes) {
        const tree = change.side === "buy" ? state.buyTree : state.sellTree;
        if (change.kind === "add") insertOrder(tree, change.order);
        else if (change.kind === "remove") removeOrder(tree, getLogPrice(change.order.price), change.order.id);
        else partialFillOrder(tree, getLogPrice(change.order.price), change.order.id, change.order);
      }

      return state;
    },
    {
      buyTree: makeTree(),
      sellTree: makeTree(),
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
    minPriceRange = 0,
  ): number => {
    if (maxPrice <= 0 || maxPrice < minPrice) return 0;

    const safeMinPrice = Math.max(minPrice, Number.MIN_VALUE);
    const safeMaxPrice = Math.max(maxPrice, safeMinPrice);

    const minLogPrice = getLogPrice(safeMinPrice);
    const maxLogPrice = getLogPrice(safeMaxPrice);

    return queryVolumeInRange(state, minLogPrice, maxLogPrice, minPrice, maxPrice, includeMax, minPriceRange);
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
  const querySideVolumeInPriceRangeAtResolution = (
    side: OrderSide,
    minPrice: number,
    maxPrice: number,
    minPriceRange: number,
    includeMax = false,
  ): number => {
    const tree = side === "buy" ? buyTreeState() : sellTreeState();
    return queryVolumeInPriceRange(tree, minPrice, maxPrice, includeMax, minPriceRange);
  };
  const queryVolumeInRange = (
    state: TreeState,
    minLogPrice: number,
    maxLogPrice: number,
    minPrice: number,
    maxPrice: number,
    includeMax: boolean,
    minPriceRange: number,
  ): number => {
    if (maxLogPrice <= state.minLogPrice || state.maxLogPrice <= minLogPrice) return 0;
    if (minLogPrice <= state.minLogPrice && state.maxLogPrice <= maxLogPrice) return state.volume;

    if (minPriceRange > 0) {
      const nodeMinPrice = getPrice(state.minLogPrice);
      const nodeMaxPrice = getPrice(state.maxLogPrice);

      if (nodeMaxPrice - nodeMinPrice <= minPriceRange) {
        const nodeMidPrice = (nodeMinPrice + nodeMaxPrice) / 2;
        const inside = includeMax
          ? nodeMidPrice >= minPrice && nodeMidPrice <= maxPrice
          : nodeMidPrice >= minPrice && nodeMidPrice < maxPrice;

        return inside ? state.volume : 0;
      }
    }

    if (state.kind === "node") {
      let volume = 0;

      for (const child of state.children) {
        volume += queryVolumeInRange(child, minLogPrice, maxLogPrice, minPrice, maxPrice, includeMax, minPriceRange);
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

  return { querySideVolumeInPriceRange, querySideVolumeInPriceRangeAtResolution };
};

type Options = {
  orderBookChangeset: Accessor<OrderBookChangeset>;
  priceReference: Accessor<number>;
  fanout: Accessor<number>;
};

export const createHistogramState = (options: Options) => {
  const accelerationStructure = createHistogramAccelerationStructure({
    orderBookChangeset: options.orderBookChangeset,
    priceReference: options.priceReference,
    fanout: options.fanout,
  });
  const querySideVolumeInPriceRange = accelerationStructure.querySideVolumeInPriceRange;
  const querySideVolumeInPriceRangeAtResolution = accelerationStructure.querySideVolumeInPriceRangeAtResolution;

  const getOrderBookHistogram = (region: OrderBookHistogramRegion): OrderBookHistogramEntry[] => {
    const resolution = region.resolution;
    if (resolution === 0) return [];

    const minPrice = region.price[0];
    const maxPrice = region.price[1];
    const cellHeight = Math.max(maxPrice - minPrice, Number.EPSILON) / resolution;
    const histogram: OrderBookHistogramEntry[] = [];

    for (let y = 0; y < resolution; y += 1) {
      const cellMinPrice = minPrice + y * cellHeight;
      const cellMaxPrice = y === resolution - 1 ? maxPrice + Number.EPSILON : minPrice + (y + 1) * cellHeight;

      histogram.push({
        y,
        kind: "buy",
        size: querySideVolumeInPriceRangeAtResolution("buy", cellMinPrice, cellMaxPrice, cellHeight),
      });

      histogram.push({
        y,
        kind: "sell",
        size: querySideVolumeInPriceRangeAtResolution("sell", cellMinPrice, cellMaxPrice, cellHeight),
      });
    }

    return histogram;
  };

  const getOrderBookHistogramSeries = (region: OrderBookHistogramRegion, side: OrderSide): OrderBookHistogramSeries => {
    const resolution = Math.max(0, Math.floor(region.resolution));
    const cellHeight = Math.max(region.price[1] - region.price[0], Number.EPSILON) / Math.max(resolution, 1);
    const sizes = new Array<number>(resolution).fill(0);

    if (resolution === 0) return { cellHeight, sizes };

    const minPrice = region.price[0];

    for (let y = 0; y < resolution; y += 1) {
      const cellMinPrice = minPrice + y * cellHeight;
      const cellMaxPrice = minPrice + (y + 1) * cellHeight;
      const includeMax = y === resolution - 1;

      sizes[y] = querySideVolumeInPriceRange(side, cellMinPrice, cellMaxPrice, includeMax);
    }

    return { cellHeight, sizes };
  };
  return { getOrderBookHistogramSeries, getOrderBookHistogram, querySideVolumeInPriceRange };
};
