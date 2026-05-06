import { sampleUniform } from "./distributions";

export type WeightedListItem = {
  weight: number;
};

export const sampleWeightedList = <Item extends WeightedListItem>(items: readonly Item[]): Item | null => {
  const totalWeight = items.reduce((total, item) => total + item.weight, 0);

  if (totalWeight <= 0) return null;

  let targetWeight = sampleUniform(0, totalWeight);

  for (const item of items) {
    targetWeight -= item.weight;

    if (targetWeight <= 0) return item;
  }

  return null;
};
