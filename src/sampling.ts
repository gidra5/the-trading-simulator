import { createEffect, type Accessor } from "solid-js";

type ResamplerOptions<T> = {
  candidateCount: Accessor<number>;
  proposalSample: () => { item: T; weight: number } | null;
  weight: (item: T) => number;
};

export const createResampler = <T>(options: ResamplerOptions<T>) => {
  const candidates: { item: T; weight: number; cumulativeWeight: number }[] = [];
  let totalWeight = 0;

  createEffect(() => {
    while (candidates.length < options.candidateCount()) {
      const proposal = options.proposalSample();
      if (!proposal) break;
      const weight = options.weight(proposal.item) / proposal.weight;
      totalWeight += weight;
      // todo: binary tree array with cumulative weight as sum of cumulative weights of children
      candidates.push({ item: proposal.item, weight, cumulativeWeight: totalWeight });
    }
  });

  return {
    sample: () => {
      const targetWeight = Math.random() * totalWeight;
      let left = 0;
      let right = candidates.length;

      while (left < right) {
        const mid = Math.floor((left + right) / 2);

        if (candidates[mid]!.cumulativeWeight <= targetWeight) left = mid + 1;
        else right = mid;
      }

      return candidates[left];
    },
  };
};
