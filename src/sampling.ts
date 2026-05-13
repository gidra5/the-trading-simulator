import type { Accessor } from "solid-js";
import { binarySearchIndex } from "./utils";

type ResamplerOptions<T> = {
  candidateCount: Accessor<number>;
  proposalSample: () => { item: T; weight: number } | null;
  weight: (item: T) => number;
};

export const createResampler = <T>(options: ResamplerOptions<T>) => {
  return {
    sample: () => {
      const candidates: { item: T; weight: number; cumulativeWeight: number }[] = [];

      let totalWeight = 0;
      while (candidates.length < options.candidateCount()) {
        const proposal = options.proposalSample();
        if (!proposal) break;
        const weight = options.weight(proposal.item) / proposal.weight;
        totalWeight += weight;
        candidates.push({ item: proposal.item, weight, cumulativeWeight: totalWeight });
      }

      if (candidates.length === 0) return null;
      const targetWeight = Math.random() * totalWeight;
      const index = binarySearchIndex(candidates, (candidate) => (candidate.cumulativeWeight <= targetWeight ? -1 : 1));
      const chosen = candidates[index];
      if (!chosen) return null;
      return chosen.item;
    },
  };
};
