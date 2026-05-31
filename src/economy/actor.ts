import { batch, createSignal, type Accessor } from "solid-js";
import { type MarketState } from "../market";
import { type SimulationTimeState } from "../simulation/time";
import { createProgression, type ProgressionSnapshot } from "../progression/interface";
import type { ProgressionGraph } from "../progression/data";
import { createAccount, type AccountSnapshot } from "./account";
import { createNeeds, type Needs, type NeedsSnapshot } from "./needs";
import { createInventory, type InventorySnapshot } from "./inventory";

let nextActorId = 0;

type ActorMeta = {
  id: number;
  name: Accessor<string>;
  setName: (name: string) => void;
  birthDate: number;
};

export type ActorSnapshot = {
  account: AccountSnapshot;
  inventory: InventorySnapshot;
  meta: {
    birthDate: number;
    name: string;
  };
  needs: NeedsSnapshot;
  progression: ProgressionSnapshot;
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

// TODO: depend on recent returns for buy/sell with two "populations" of trend following and contrarians
// TODO: make depend on spread, book depth, volatlity, uncertainty.
// TODO: simulate order spitting for large ones
// TODO: stop loss, take profit liquidation simulations
// TODO: increase size if many wins for one actor, decrease for losses (or vice versa, depending on the gamblingness?)
// TODO: delays in price reaction
export const createActor = (options: ActorOptions) => {
  const id = nextActorId++;
  const inventory = createInventory();
  const progression = createProgression(options.progressionGraph, inventory);
  const account = createAccount({ ...options, progression });
  const needs = createNeeds({
    dt: options.time.dt,
    decayRates: options.needsDecayRates,
    base: options.needsBase,
  });
  const [name, setName] = createSignal(options.name);
  const meta: ActorMeta = { id, name, setName, birthDate: options.time.time() };

  const snapshot = (): ActorSnapshot => ({
    account: account.snapshot(),
    inventory: inventory.snapshot(),
    meta: {
      birthDate: meta.birthDate,
      name: name(),
    },
    needs: needs.snapshot(),
    progression: progression.snapshot(),
  });

  const restore = (snapshot: ActorSnapshot): void => {
    batch(() => {
      inventory.restore(snapshot.inventory);
      progression.restore(snapshot.progression);
      account.restore(snapshot.account);
      meta.birthDate = snapshot.meta.birthDate;
      needs.restore(snapshot.needs);
      setName(snapshot.meta.name);
    });
  };

  return { progression, inventory, account, needs, meta, restore, snapshot };
};
