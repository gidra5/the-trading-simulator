import { createSignal } from "solid-js";
import { Resource } from "./inventory";

export type ResourceQualities = Record<Resource, { mean: number; stddev: number }>;
export type CraftingSnapshot = {
  skills: ResourceQualities;
};

const createDefaultResourceQualities = (): ResourceQualities => ({
  [Resource.Commodities]: { mean: 1, stddev: 0.1 },
  [Resource.Food]: { mean: 1, stddev: 0.1 },
  [Resource.Medicine]: { mean: 1, stddev: 0.1 },
  [Resource.Money]: { mean: 1, stddev: 0.1 },
});

type CraftingOptions = {
  sampleQuality: (mean: number, standardDeviation: number) => number;
};

export const createCrafting = (options: CraftingOptions) => {
  const [skills, setSkills] = createSignal<ResourceQualities>(createDefaultResourceQualities());

  const craftResource = (resource: Resource): number => {
    const skill = skills()[resource];
    return options.sampleQuality(skill.mean, skill.stddev);
  };

  const snapshot = (): CraftingSnapshot => ({
    skills: skills(),
  });

  const restore = (snapshot: CraftingSnapshot): void => {
    setSkills(snapshot.skills);
  };

  return {
    craftResource,
    skills,
    restore,
    snapshot,
  };
};
