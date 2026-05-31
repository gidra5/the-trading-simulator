export const createRngSeed = (): number => {
  const seed = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(seed);

  return seed[0] || Date.now() >>> 0;
};

export type RngSnapshot = { state: number };

// Mulberry32: small non-cryptographic PRNG suitable for deterministic simulation.
export const createRng = (seed: number) => {
  let state = seed >>> 0;

  const sample = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return ((value ^ (value >>> 14)) >>> 0) / 2 ** 32;
  };

  return {
    sample,
    restore: (snapshot: RngSnapshot): void => {
      state = snapshot.state;
    },
    snapshot: (): RngSnapshot => ({ state }),
  };
};
