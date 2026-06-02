import { batch, createSignal, type Accessor } from "solid-js";
import { type MarketState } from "../market";
import { type SimulationTimeState } from "../simulation/time";
import { createProgression, type ProgressionSnapshot } from "../progression/interface";
import type { ProgressionGraph } from "../progression/data";
import { createAccount, type AccountSnapshot } from "./account";
import { createCrafting, type CraftingSnapshot } from "./crafting";
import { createNeeds, type Needs, type NeedsSnapshot, type NeedThresholds } from "./needs";
import { createInventory, type InventorySnapshot } from "./inventory";
import { createSleep, type SleepSnapshot } from "./sleep";
import { assert } from "../utils";

let nextActorId = 0;
const sleepingFoodDecayRateMultiplier = 0.25;

type ActorMeta = {
  id: number;
  name: Accessor<string>;
  setName: (name: string) => void;
  birthDate: number;
};

export type ActorSnapshot = {
  account: AccountSnapshot;
  crafting: CraftingSnapshot;
  inventory: InventorySnapshot;
  meta: {
    birthDate: number;
    name: string;
  };
  needs: NeedsSnapshot;
  progression: ProgressionSnapshot;
  sleep: SleepSnapshot;
};

type ActorOptions = {
  name: string;
  market: MarketState;
  time: SimulationTimeState;
  progressionGraph: ProgressionGraph;
  sampleCraftingQuality: (mean: number, standardDeviation: number) => number;
  sampleSleepDuration: (durationMs: number) => number;
  feeRate: Accessor<number>;
  debtCapitalizationRate: Accessor<number>;
  maintenanceMargin: Accessor<number>;
  needs: {
    decayRates: Accessor<Needs>;
    base: Accessor<Needs>;
    thresholds: Accessor<NeedThresholds>;
  };
};

// TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
// TODO: make depend on spread, book depth, volatlity, uncertainty.
// TODO: simulate order spitting for large ones
// TODO: stop loss, take profit liquidation simulations
// TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
// TODO: delays in price reaction
export const createActor = (options: ActorOptions) => {
  const id = nextActorId++;
  const inventory = createInventory();
  const crafting = createCrafting({ sampleQuality: options.sampleCraftingQuality });
  const progression = createProgression(options.progressionGraph, inventory);
  const account = createAccount({ ...options, progression });
  let sleep: ReturnType<typeof createSleep> | undefined;
  const decayRates = (): Needs => {
    const decayRates = options.needs.decayRates();
    if (!sleep?.sleeping()) return decayRates;

    return {
      ...decayRates,
      Food: decayRates.Food * sleepingFoodDecayRateMultiplier,
      Sleep: 0,
      Stress: 0,
    };
  };
  const needs = createNeeds({
    ...options.needs,
    decayRates,
    dt: options.time.dt,
  });
  sleep = createSleep({
    base: options.needs.base,
    dt: options.time.dt,
    needs,
    sampleDuration: options.sampleSleepDuration,
    time: options.time.time,
  });
  assert(sleep);
  const [name, setName] = createSignal(options.name);
  const meta: ActorMeta = { id, name, setName, birthDate: options.time.time() };

  const snapshot = (): ActorSnapshot => ({
    account: account.snapshot(),
    crafting: crafting.snapshot(),
    inventory: inventory.snapshot(),
    meta: {
      birthDate: meta.birthDate,
      name: name(),
    },
    needs: needs.snapshot(),
    progression: progression.snapshot(),
    sleep: sleep.snapshot(),
  });

  const restore = (snapshot: ActorSnapshot): void => {
    batch(() => {
      inventory.restore(snapshot.inventory);
      crafting.restore(snapshot.crafting);
      progression.restore(snapshot.progression);
      account.restore(snapshot.account);
      meta.birthDate = snapshot.meta.birthDate;
      needs.restore(snapshot.needs);
      sleep.restore(snapshot.sleep);
      setName(snapshot.meta.name);
    });
  };

  return { progression, inventory, account, crafting, needs, meta, restore, sleep, snapshot };
};
