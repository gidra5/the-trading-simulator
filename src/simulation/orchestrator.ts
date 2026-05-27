import { createMemo, createSignal } from "solid-js";
import {
  cloneMarketModelSettings,
  defaultMarketModelSettings,
  eventExcitationMatrix,
  eventVector,
  type MarketModelSettings,
  type MarketEventSetting,
  type OrderPriceDistribution,
  type OrderSelectionDistribution,
  type OrderSizeDistribution,
  type SimulationEventSettingGroup,
} from "./types";
import { clamp, halfLifeToDecay } from "../utils";
import { sampleNormal, sampleUniform } from "../distributions";

type ScalarMarketModelSetting = Exclude<
  keyof MarketModelSettings,
  "excitementHalfLife" | "excitationMatrix" | "publicInterest"
>;

// todo: orchestrator modes/events
// mode - baseline model parameters describing a particular crowd behavior archetype
// events - deviations from an archetype that eventually dies, or a permanent archetype change.
export const createOrchestrator = () => {
  const [modelSettings, setModelSettings] = createSignal(defaultMarketModelSettings);
  const [orderPriceDistribution, setOrderPriceDistribution] = createSignal<OrderPriceDistribution>("normal");
  const [orderSizeDistribution, setOrderSizeDistribution] = createSignal<OrderSizeDistribution>("normal");
  const [orderSelectionDistribution, setOrderSelectionDistribution] =
    createSignal<OrderSelectionDistribution>("uniform");
  const getMarketModelSettings = (): MarketModelSettings => cloneMarketModelSettings(modelSettings());
  const setMarketModelSettings = (settings: MarketModelSettings): void => {
    setModelSettings(cloneMarketModelSettings(settings));
  };
  const setMarketModelSetting = (key: ScalarMarketModelSetting, value: number): void => {
    setModelSettings((current) => ({ ...current, [key]: value }));
  };
  const setMarketModelEventSetting = (
    group: SimulationEventSettingGroup,
    eventType: MarketEventSetting,
    value: number,
  ): void => {
    setModelSettings((current) => ({
      ...current,
      [group]: { ...current[group], [eventType]: value },
    }));
  };
  const setMarketModelExcitation = (source: MarketEventSetting, target: MarketEventSetting, value: number): void => {
    setModelSettings((current) => ({
      ...current,
      excitationMatrix: {
        ...current.excitationMatrix,
        [source]: { ...current.excitationMatrix[source], [target]: value },
      },
    }));
  };
  const updateOrderPriceDistribution = (distribution: OrderPriceDistribution): void => {
    setOrderPriceDistribution(distribution);
  };
  const updateOrderSizeDistribution = (distribution: OrderSizeDistribution): void => {
    setOrderSizeDistribution(distribution);
  };
  const updateOrderSelectionDistribution = (distribution: OrderSelectionDistribution): void => {
    setOrderSelectionDistribution(distribution);
  };

  const excitementDecay = createMemo(() => {
    return eventVector(modelSettings().excitementHalfLife).map(halfLifeToDecay);
  });
  const excitationMatrix = createMemo((): number[][] => {
    return eventExcitationMatrix(modelSettings().excitationMatrix);
  });

  const baselineActivity = createMemo((): number[] => {
    return eventVector(modelSettings().publicInterest);
  });

  const sampleUniformWithStandardDeviation = (mean: number, standardDeviation: number, min: number): number => {
    const halfRange = Math.max(0, standardDeviation) * Math.sqrt(3);
    const low = Math.max(min, mean - halfRange);
    const high = Math.max(low, mean + halfRange);

    return sampleUniform(low, high);
  };

  const sampleOrderDistance = (): number => {
    const parameters = modelSettings();
    const mean = parameters.meanPrice;
    const standardDeviation = parameters.priceVariance;

    const distance = (() => {
      switch (orderPriceDistribution()) {
        case "uniform":
          return sampleUniformWithStandardDeviation(mean, standardDeviation, -Infinity);
        case "normal":
          return sampleNormal(mean, standardDeviation);
      }
    })();
    return Math.max(Number.EPSILON, Math.abs(distance));
  };

  const sampleOrderSize = (): number => {
    const parameters = modelSettings();
    const mean = parameters.meanSize;
    const standardDeviation = parameters.sizeVariance;

    switch (orderSizeDistribution()) {
      case "uniform":
        return sampleUniformWithStandardDeviation(mean, standardDeviation, Number.EPSILON);
      case "normal":
        return Math.max(Number.EPSILON, Math.abs(sampleNormal(mean, standardDeviation)));
    }
  };

  const sampleCancellationOrderIndex = (orderCount: number): number => {
    if (orderCount <= 1) return 0;

    switch (orderSelectionDistribution()) {
      case "uniform":
      case "normal": {
        const parameters = modelSettings();
        const mean = clamp(parameters.cancellationCenter, 0, 1) * (orderCount - 1);
        const standardDeviation = Math.max(0, parameters.cancellationVariance) * orderCount;
        const sample =
          orderSelectionDistribution() === "uniform"
            ? sampleUniformWithStandardDeviation(mean, standardDeviation, 0)
            : sampleNormal(mean, standardDeviation);

        return Math.round(clamp(sample, 0, orderCount - 1));
      }
    }
  };

  return {
    cancellation: {
      // todo: price movement - if moved awy from order, increase cancel prob and decrease if moved to the order
      // todo: distance?
      // todo: time
      // todo: queue volume
      sampleOrderIndex: sampleCancellationOrderIndex,
    },
    orderPlacement: {
      // todo: anchoring - min, max in interval(s)
      // todo: anchoring - round anchor,
      // todo: anchoring - liquidity anchors (place right before a wall)
      // todo: inspread/near/far distributions.
      sampleOrderSize,
      sampleOrderDistance,
    },
    eventStream: {
      excitementDecay,
      baselineActivity,
      excitationMatrix,
    },
    getMarketModelSettings,
    getOrderPriceDistribution: orderPriceDistribution,
    getOrderSelectionDistribution: orderSelectionDistribution,
    getOrderSizeDistribution: orderSizeDistribution,
    setMarketModelEventSetting,
    setMarketModelExcitation,
    setMarketModelSetting,
    setMarketModelSettings,
    setOrderPriceDistribution: updateOrderPriceDistribution,
    setOrderSelectionDistribution: updateOrderSelectionDistribution,
    setOrderSizeDistribution: updateOrderSizeDistribution,
  };
};

export type SimulationOrchestrator = ReturnType<typeof createOrchestrator>;
