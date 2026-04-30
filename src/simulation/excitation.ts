import { sampleMultivariateHawkesProcessEventTypes } from "../distributions";
import { halfLifeToDecay } from "../utils";
import {
  eventExcitationMatrix,
  eventVector,
  normalizeExcitationMatrix,
  simulationEventTypes,
  type MarketBehaviorSettings,
  type SimulationEventType,
} from "./types";

export class SimulationExcitation {
  private excitedInterest = eventVector({
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": 0,
    "cancel-buy": 0,
    "cancel-sell": 0,
  });

  constructor(private getSettings: () => MarketBehaviorSettings) {}

  tick(dt: number): SimulationEventType[] {
    const events: SimulationEventType[] = [];

    this.forEachEvent(dt, (eventType) => events.push(eventType));
    return events;
  }

  forEachEvent(dt: number, handleEvent: (eventType: SimulationEventType) => void): void {
    const excitementDecay = this.excitementDecayVector();

    this.excitedInterest = sampleMultivariateHawkesProcessEventTypes(
      this.publicInterestVector(),
      this.interestExcitationMatrix(excitementDecay),
      excitementDecay,
      dt,
      this.excitedInterest,
      (eventTypeIndex) => {
        const eventType = simulationEventTypes[eventTypeIndex];

        if (eventType !== undefined) {
          handleEvent(eventType);
        }
      },
    );
  }

  private publicInterestVector(): number[] {
    const { publicInterestRate, patience, greed, fear } = this.getSettings();
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
  }

  private excitementDecayVector(): number[] {
    return eventVector(this.getSettings().excitementHalfLife).map(halfLifeToDecay);
  }

  private excitationMatrix(): number[][] {
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
    } = this.getSettings();

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
  }

  private interestExcitationMatrix(decay: number[]): number[][] {
    return normalizeExcitationMatrix(this.excitationMatrix(), decay, eventVector(this.getSettings().branchingRatio));
  }
}
