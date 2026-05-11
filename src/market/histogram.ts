import { Accessor, createMemo } from "solid-js";
import { OrderSide, RestingOrder } from "./order";
import { OrderBookChangeset } from "./orderBook";
import { inRange } from "../utils";

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

  const findOrderIndexById = (orders: Array<RestingOrder>, id: number): number => {
    let low = 0;
    let high = orders.length;

    while (low < high) {
      const mid = Math.floor((low + high) / 2);

      if (orders[mid]!.id < id) low = mid + 1;
      else high = mid;
    }

    return low;
  };

  const insertOrderById = (orders: Array<RestingOrder>, order: RestingOrder): void => {
    const lastOrder = orders[orders.length - 1];
    if (!lastOrder || lastOrder.id < order.id) {
      orders.push(order);
      return;
    }

    const index = findOrderIndexById(orders, order.id);
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

  type TreeNodeState = Extract<TreeState, { kind: "node" }>;
  type InsertOrderTask = {
    state: TreeState;
    order: RestingOrder;
    logPrice: number;
    depth: number;
    ancestorNodes: TreeNodeState[];
    isRequestedOrder: boolean;
  };

  const updateInsertedOrderAncestors = (nodes: TreeNodeState[], volume: number): void => {
    for (const node of nodes) {
      node.volume += volume;
      node.count += 1;
    }
  };

  const insertOrderTasks = (tasks: InsertOrderTask[]): boolean => {
    let insertedRequestedOrder = false;

    while (tasks.length > 0) {
      const task = tasks.pop()!;
      let current = task.state;
      let depth = task.depth;
      const path: TreeNodeState[] = [];

      while (inRange(task.logPrice, current.minLogPrice, current.maxLogPrice)) {
        if (current.kind === "leaf") {
          const volume = task.order.size;
          const canStayLeaf = leafPriceMatches(current, task.logPrice) || !canSplit(current, depth);

          if (canStayLeaf) {
            insertOrderById(current.value, task.order);
            current.volume += volume;
            updateInsertedOrderAncestors(path, volume);
            updateInsertedOrderAncestors(task.ancestorNodes, volume);

            if (task.isRequestedOrder) insertedRequestedOrder = true;
            break;
          }

          const existing = current.value;
          const children = makeChildren(current);

          Object.assign(current, {
            kind: "node" as const,
            count: 0,
            children,
            volume: 0,
          });

          const ancestorNodes = task.ancestorNodes.length === 0 ? path : [...task.ancestorNodes, ...path];
          tasks.push({
            state: current,
            order: task.order,
            logPrice: task.logPrice,
            depth,
            ancestorNodes,
            isRequestedOrder: task.isRequestedOrder,
          });

          for (let index = existing.length - 1; index >= 0; index -= 1) {
            const existingOrder = existing[index]!;
            tasks.push({
              state: current,
              order: existingOrder,
              logPrice: getLogPrice(existingOrder.price),
              depth,
              ancestorNodes: [],
              isRequestedOrder: false,
            });
          }

          break;
        }

        path.push(current);
        current = current.children[getChildIndex(current, task.logPrice)]!;
        depth += 1;
      }
    }

    return insertedRequestedOrder;
  };

  const insertOrder = (state: TreeState, order: RestingOrder): boolean => {
    const logPrice = getLogPrice(order.price);
    if (!inRange(logPrice, state.minLogPrice, state.maxLogPrice)) return false;

    let current = state;
    let depth = 0;
    const path: TreeNodeState[] = [];

    while (inRange(logPrice, current.minLogPrice, current.maxLogPrice)) {
      if (current.kind === "leaf") {
        const volume = order.size;
        const canStayLeaf = leafPriceMatches(current, logPrice) || !canSplit(current, depth);

        if (canStayLeaf) {
          insertOrderById(current.value, order);
          current.volume += volume;
          updateInsertedOrderAncestors(path, volume);
          return true;
        }

        const existing = current.value;
        const children = makeChildren(current);

        Object.assign(current, {
          kind: "node" as const,
          count: 0,
          children,
          volume: 0,
        });

        const tasks: InsertOrderTask[] = [
          {
            state: current,
            order,
            logPrice,
            depth,
            ancestorNodes: path,
            isRequestedOrder: true,
          },
        ];

        for (let index = existing.length - 1; index >= 0; index -= 1) {
          const existingOrder = existing[index]!;
          tasks.push({
            state: current,
            order: existingOrder,
            logPrice: getLogPrice(existingOrder.price),
            depth,
            ancestorNodes: [],
            isRequestedOrder: false,
          });
        }

        return insertOrderTasks(tasks);
      }

      path.push(current);
      current = current.children[getChildIndex(current, logPrice)]!;
      depth += 1;
    }

    return false;
  };

  const removeOrder = (state: TreeState, logPrice: number, id: number): boolean => {
    if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
      return false;
    }

    const path: TreeNodeState[] = [];
    let current = state;

    while (current.kind === "node") {
      path.push(current);
      current = current.children[getChildIndex(current, logPrice)]!;

      if (logPrice < current.minLogPrice || logPrice >= current.maxLogPrice) {
        return false;
      }
    }

    const index = findOrderIndexById(current.value, id);
    const removedOrder = current.value[index];
    if (!removedOrder || removedOrder.id !== id) return false;

    current.value.splice(index, 1);
    current.volume -= removedOrder.size;

    for (let index = path.length - 1; index >= 0; index -= 1) {
      const node = path[index]!;
      node.volume = node.children.reduce((sum, child) => sum + child.volume, 0);
      node.count -= 1;
      truncateEmptyNode(node);
    }

    return true;
  };

  const partialFillOrder = (state: TreeState, logPrice: number, id: number, order: RestingOrder): number => {
    if (logPrice < state.minLogPrice || logPrice >= state.maxLogPrice) {
      return 0;
    }

    const path: TreeNodeState[] = [];
    let current = state;

    while (current.kind === "node") {
      path.push(current);
      current = current.children[getChildIndex(current, logPrice)]!;

      if (logPrice < current.minLogPrice || logPrice >= current.maxLogPrice) {
        return 0;
      }
    }

    const index = findOrderIndexById(current.value, id);
    const previousOrder = current.value[index];
    if (!previousOrder || previousOrder.id !== id) return 0;

    current.value[index] = order;
    const delta = previousOrder.size - order.size;
    current.volume -= delta;

    for (let index = path.length - 1; index >= 0; index -= 1) {
      path[index]!.volume -= delta;
    }

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
    let volume = 0;
    const stack: TreeState[] = [state];

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (maxLogPrice <= current.minLogPrice || current.maxLogPrice <= minLogPrice) continue;
      if (minLogPrice <= current.minLogPrice && current.maxLogPrice <= maxLogPrice) {
        volume += current.volume;
        continue;
      }

      if (minPriceRange > 0) {
        const nodeMinPrice = getPrice(current.minLogPrice);
        const nodeMaxPrice = getPrice(current.maxLogPrice);

        if (nodeMaxPrice - nodeMinPrice <= minPriceRange) {
          const nodeMidPrice = (nodeMinPrice + nodeMaxPrice) / 2;
          const inside = includeMax
            ? nodeMidPrice >= minPrice && nodeMidPrice <= maxPrice
            : nodeMidPrice >= minPrice && nodeMidPrice < maxPrice;

          if (inside) volume += current.volume;
          continue;
        }
      }

      if (current.kind === "node") {
        for (let index = current.children.length - 1; index >= 0; index -= 1) {
          stack.push(current.children[index]!);
        }

        continue;
      }

      for (const order of current.value) {
        const price = order.price;
        const inside = includeMax ? price >= minPrice && price <= maxPrice : price >= minPrice && price < maxPrice;

        if (inside) volume += order.size;
      }
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
