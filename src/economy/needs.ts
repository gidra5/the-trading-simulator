import { createEffect, createMemo, createSignal, untrack, type Accessor } from "solid-js";

enum Need {
  Food = "Food",
  Sleep = "Sleep",
  Health = "Health",
  Stress = "Stress",
}
const needValues = Object.values(Need) as Need[];
const criticalNeeds = [Need.Food, Need.Health];
export type Needs = Record<Need, number>;

type NeedsOptions = {
  dt: Accessor<number>;
  decayRates: Accessor<Needs>;
  base: Accessor<Needs>;
};

export const createNeeds = (options: NeedsOptions) => {
  const [needs, setNeeds] = createSignal<Needs>(options.base());
  const overflowedNeeds = createMemo(() => needValues.filter((need) => needs()[need] > options.base()[need]));
  const underflowedNeeds = createMemo(() => needValues.filter((need) => needs()[need] < options.base()[need]));
  const dead = createMemo(() => criticalNeeds.some((need) => needs()[need] <= 0));

  const fulfillNeed = (need: Need, amount: number) => {
    setNeeds((needs) => ({ ...needs, [need]: needs[need] + amount }));
  };

  createEffect(() => {
    if (untrack(dead)) return;
    const elapsed = options.dt();
    const decayRates = untrack(options.decayRates);

    setNeeds((current) => {
      const next = { ...current };
      for (const need of needValues) {
        next[need] = current[need] * (1 - decayRates[need] * elapsed);
      }

      return next;
    });
  });

  return {
    needs,
    overflowedNeeds,
    underflowedNeeds,
    fulfillNeed,
    dead,
  };
};
