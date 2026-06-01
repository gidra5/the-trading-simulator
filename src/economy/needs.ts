import { createEffect, createMemo, createSignal, untrack, type Accessor } from "solid-js";
import { clamp, interpolate } from "../utils";

export enum Need {
  Food = "Food",
  Sleep = "Sleep",
  Health = "Health",
  Stress = "Stress",
}
const needValues = Object.values(Need) as Need[];
const criticalNeeds = [Need.Food, Need.Health];
export enum NeedStatus {
  Overflow = "overflow",
  Perfect = "perfect",
  Ok = "ok",
  Warning = "warning",
  Critical = "critical",
}
const statusValues = [
  NeedStatus.Critical,
  NeedStatus.Warning,
  NeedStatus.Ok,
  NeedStatus.Perfect,
  NeedStatus.Overflow,
] as const;
export type Needs = Record<Need, number>;
export type NeedThresholds = Record<Need, number[]>;
export type NeedsSnapshot = {
  needs: Needs;
};

type NeedsOptions = {
  dt: Accessor<number>;
  decayRates: Accessor<Needs>;
  base: Accessor<Needs>;
  thresholds: Accessor<NeedThresholds>;
};

export const createNeeds = (options: NeedsOptions) => {
  const [needs, setNeeds] = createSignal<Needs>(options.base());
  const needRatio = (need: Need) => needs()[need] / options.base()[need];
  const thresholdIdx = (need: Need) => options.thresholds()[need].findIndex((threshold) => needRatio(need) < threshold);
  const needStatus = (need: Need): NeedStatus => {
    return statusValues[thresholdIdx(need)] ?? NeedStatus.Overflow;
  };
  const needProgress = (need: Need): number => {
    const thresholds = options.thresholds()[need];
    const idx = thresholdIdx(need);
    const status = statusValues[idx] ?? NeedStatus.Overflow;
    const ratio = needRatio(need);
    if (status === NeedStatus.Overflow) {
      const overflow = thresholds[thresholds.length - 1];
      return 1 - Math.exp(-(ratio - overflow));
    }

    return interpolate(ratio, thresholds[idx - 1] ?? 0, thresholds[idx]);
  };
  const overflowedNeeds = createMemo(() => needValues.filter((need) => needs()[need] > options.base()[need]));
  const underflowedNeeds = createMemo(() => needValues.filter((need) => needs()[need] < options.base()[need]));
  const dead = createMemo(() => criticalNeeds.some((need) => needs()[need] <= 0));

  const fulfillNeed = (need: Need, amount: number) => {
    setNeeds((needs) => ({ ...needs, [need]: needs[need] + amount }));
  };
  const consumeNeed = (need: Need, amount: number) => {
    setNeeds((needs) => ({ ...needs, [need]: Math.max(0, needs[need] - amount) }));
  };

  createEffect(() => {
    if (untrack(dead)) return;
    const elapsed = options.dt();
    const decayRates = untrack(options.decayRates);

    setNeeds((current) => {
      const next = { ...current };
      for (const need of needValues) {
        next[need] = current[need] - decayRates[need] * elapsed;
      }

      return next;
    });
  });

  const snapshot = (): NeedsSnapshot => ({
    needs: needs(),
  });

  const restore = (snapshot: NeedsSnapshot): void => {
    setNeeds(snapshot.needs);
  };

  return {
    needs,
    needProgress,
    needStatus,
    overflowedNeeds,
    underflowedNeeds,
    fulfillNeed,
    consumeNeed,
    dead,
    restore,
    snapshot,
  };
};
