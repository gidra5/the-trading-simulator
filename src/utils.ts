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
