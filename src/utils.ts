export const assert: (
  condition: unknown,
  message?: string,
) => asserts condition = (
  condition: unknown,
  message = "Assertion failed",
): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const positiveFiniteOrZero = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

export const halfLifeToDecay = (halfLifeSeconds: number): number => {
  const halfLife = positiveFiniteOrZero(halfLifeSeconds);

  return halfLife > 0 ? Math.LN2 / halfLife : 0;
};
