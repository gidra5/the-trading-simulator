import { createMemo, createSignal } from "solid-js";
import {
  defaultMarketBehaviorSettings,
  eventExcitationMatrix,
  eventVector,
  normalizeExcitationMatrix,
  type OrderPriceDistribution,
  type OrderSizeDistribution,
} from "./types";
import { halfLifeToDecay } from "../utils";
import { sampleExponential, sampleLogNormal, sampleNormal, samplePowerLaw, sampleUniform } from "../distributions";

export const createOrchestrator = () => {
  const [marketParameters] = createSignal(defaultMarketBehaviorSettings);
  const [orderPriceDistribution] = createSignal<OrderPriceDistribution>("power-law");
  const [orderSizeDistribution] = createSignal<OrderSizeDistribution>("power-law");
  const cancellationProbabilities = {
    time: createSignal(0.5),
    priceMovement: createSignal(0.5),
    localVolume: createSignal(0.5),
    farOrder: createSignal(0.5),
  };
  const _excitationMatrix = (): number[][] => {
    const {
      fear,
      reflexivity,
      contrarianism,
      passiveMirroring,
      liquidityChasing,
      liquidityFading,
      adverseSelection,
      orderCrowding,
      passiveAdverseSelection,
      cancelCrowding,
      bookRebalancing,
      cancelPanic,
    } = marketParameters();

    return eventExcitationMatrix({
      "market-buy": {
        "market-buy": reflexivity * (1 - fear),
        "market-sell": contrarianism * fear,
        "order-buy": liquidityChasing * (1 - fear),
        "order-sell": passiveMirroring * fear,
        "cancel-buy": liquidityFading * (1 - fear),
        "cancel-sell": adverseSelection * fear,
      },
      "market-sell": {
        "market-buy": contrarianism * (1 - fear),
        "market-sell": reflexivity * fear,
        "order-buy": passiveMirroring * (1 - fear),
        "order-sell": liquidityChasing * fear,
        "cancel-buy": adverseSelection * (1 - fear),
        "cancel-sell": liquidityFading * fear,
      },
      "order-buy": {
        "market-buy": reflexivity * (1 - fear),
        "market-sell": contrarianism * fear,
        "order-buy": orderCrowding * (1 - fear),
        "order-sell": passiveMirroring * fear,
        "cancel-buy": passiveAdverseSelection * (1 - fear),
        "cancel-sell": adverseSelection * fear,
      },
      "order-sell": {
        "market-buy": contrarianism * (1 - fear),
        "market-sell": reflexivity * fear,
        "order-buy": passiveMirroring * (1 - fear),
        "order-sell": orderCrowding * fear,
        "cancel-buy": adverseSelection * (1 - fear),
        "cancel-sell": passiveAdverseSelection * fear,
      },
      "cancel-buy": {
        "market-buy": contrarianism * (1 - fear),
        "market-sell": cancelPanic * fear,
        "order-buy": reflexivity * (1 - fear),
        "order-sell": bookRebalancing * fear,
        "cancel-buy": cancelCrowding * (1 - fear),
        "cancel-sell": passiveMirroring * fear,
      },
      "cancel-sell": {
        "market-buy": cancelPanic * (1 - fear),
        "market-sell": contrarianism * fear,
        "order-buy": bookRebalancing * (1 - fear),
        "order-sell": reflexivity * fear,
        "cancel-buy": passiveMirroring * (1 - fear),
        "cancel-sell": cancelCrowding * fear,
      },
    }); // row event adds rates to column events before branching-ratio scaling
  };

  const excitementDecay = createMemo(() => {
    return eventVector(marketParameters().excitementHalfLife).map(halfLifeToDecay);
  });
  const excitationMatrix = createMemo((): number[][] => {
    return normalizeExcitationMatrix(
      _excitationMatrix(),
      excitementDecay(),
      eventVector(marketParameters().branchingRatio),
    );
  });

  const publicInterest = createMemo((): number[] => {
    const { publicInterestRate, patience, greed, fear } = marketParameters();
    const marketPressure = patience * greed;
    const orderPressure = patience * (1 - greed);
    const cancelPressure = 1 - patience;

    return eventVector({
      "market-buy": marketPressure * (1 - fear),
      "market-sell": marketPressure * fear,
      "order-buy": orderPressure * (1 - fear),
      "order-sell": orderPressure * fear,
      "cancel-buy": cancelPressure * (1 - fear),
      "cancel-sell": cancelPressure * fear,
    }).map((v) => publicInterestRate * v); // event rates per second before self-excitation
  });

  const sampleOrderDistance = (): number => {
    const parameters = marketParameters();
    const scale = parameters.orderSpread;
    const tail = parameters.orderPriceTail;

    switch (orderPriceDistribution()) {
      case "uniform":
        return sampleUniform(0, scale * 2);
      case "abs-normal":
        return Math.abs(sampleNormal(0, scale));
      case "log-normal":
        return sampleLogNormal(scale, tail);
      case "power-law":
        return scale * samplePowerLaw(tail);
      case "exponential":
        return sampleExponential(scale);
    }
  };

  const sampleOrderSize = (): number => {
    const parameters = marketParameters();
    const scale = parameters.orderSizeScale;
    const tail = parameters.orderSizeTail;

    switch (orderSizeDistribution()) {
      case "uniform":
        return sampleUniform(0, scale * 2);
      case "log-normal":
        return sampleLogNormal(scale, tail);
      case "power-law":
        return scale * samplePowerLaw(tail);
      case "exponential":
        return sampleExponential(scale);
    }
  };


  const priceAnchorIntervals = [60_000, 600_000, 1_800_000, 3_600_000];
  return {
    cancellation: {
      ageWeight: cancellationProbabilities.time[0],
      priceMovement: {
        weight: cancellationProbabilities.priceMovement[0],
        recencyDecay: () => marketParameters().cancellationPriceMovementOrderDecay,
      },
      localVolume: {
        weight: cancellationProbabilities.localVolume[0],
        ramp: () => marketParameters().cancellationLocalVolumeRamp,
      },
      farOrder: {
        weight: cancellationProbabilities.farOrder[0],
        minAge: () => marketParameters().cancellationFarOrderMinAge,
        window: () => marketParameters().cancellationFarOrderWindow,
        ramp: () => marketParameters().cancellationFarOrderRamp,
      },
    },
    orderPlacement: {
      anchoringIntervals: () => priceAnchorIntervals,
      sampleOrderSize,
      sampleOrderDistance,
      inSpreadReach: () => marketParameters().inSpreadReach,
      nearSpreadSize: () => marketParameters().nearSpreadSize,
      inSpreadOrderProbability: () => marketParameters().inSpreadOrderProbability,
      nearSpreadProbability: () => marketParameters().nearSpreadProbability,
      anchorPreference: () => marketParameters().anchorPreference,
      liquidityWallAnchorPreference: () => marketParameters().liquidityWallAnchorPreference,
      liquidityWallAnchorRange: () => marketParameters().liquidityWallAnchorRange,
      liquidityWallHistogramResolution: () => marketParameters().liquidityWallHistogramResolution,
      roundPricePreference: () => marketParameters().roundPricePreference,
      roundPriceAnchorMinMidDistance: () => marketParameters().roundPriceAnchorMinMidDistance,
    },
    eventStream: {
      excitementDecay,
      publicInterest,
      excitationMatrix,
    },
  };
};
