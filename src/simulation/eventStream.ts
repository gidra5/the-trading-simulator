import { type Accessor } from "solid-js";
import { sampleMultivariateHawkesProcessEventTypes } from "../distributions";
import { eventVector, simulationEventTypes, type SimulationEventType } from "./types";
import { assert } from "../utils";

type SimulationExcitationOptions = {
  publicInterest: Accessor<number[]>;
  excitementDecay: Accessor<number[]>;
  excitationMatrix: Accessor<number[][]>;
};

export const createSimulationEventStream = (options: SimulationExcitationOptions) => {
  let excitedInterest = eventVector({
    "market-buy": 0,
    "market-sell": 0,
    "order-buy": 0,
    "order-sell": 0,
    "cancel-buy": 0,
    "cancel-sell": 0,
  });

  const sampleEvents = (dt: number, handleEvent: (eventType: SimulationEventType, dt: number) => void) => {
    sampleMultivariateHawkesProcessEventTypes(
      options.publicInterest(),
      options.excitationMatrix(),
      options.excitementDecay(),
      dt,
      excitedInterest,
      (eventTypeIndex, dt) => {
        const eventType = simulationEventTypes[eventTypeIndex];
        assert(eventType !== undefined);
        handleEvent(eventType, dt);
      },
    );
  };

  return { sampleEvents };
};

export type SimulationExcitationState = ReturnType<typeof createSimulationEventStream>;
