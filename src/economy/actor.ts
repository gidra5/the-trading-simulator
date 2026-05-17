import { createSignal, type Accessor } from "solid-js";
import { type MarketState } from "../market";
import { type SimulationTimeState } from "../simulation/time";
import { createProgression } from "../progression/interface";
import type { ProgressionGraph } from "../progression/data";
import { createAccount } from "./account";
import { createNeeds, type Needs } from "./needs";

let nextActorId = 0;

type ActorMeta = {
  id: number;
  name: Accessor<string>;
  setName: (name: string) => void;
  birthDate: number;
};

type ActorOptions = {
  name: string;
  market: MarketState;
  time: SimulationTimeState;
  progressionGraph: ProgressionGraph;
  feeRate: Accessor<number>;
  debtCapitalizationRate: Accessor<number>;
  maintenanceMargin: Accessor<number>;
  needsDecayRates: Accessor<Needs>;
  needsBase: Accessor<Needs>;
};

export const createActor = (options: ActorOptions) => {
  const id = nextActorId++;
  const progression = createProgression(options.progressionGraph);
  const account = createAccount(options);
  const needs = createNeeds({
    dt: options.time.dt,
    decayRates: options.needsDecayRates,
    base: options.needsBase,
  });
  const [name, setName] = createSignal(options.name);
  const meta: ActorMeta = { id, name, setName, birthDate: options.time.time() };

  return { progression, account, needs, meta };
};
