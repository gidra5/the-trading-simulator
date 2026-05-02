import {
  createMemo,
  createSignal,
  onCleanup,
  type Accessor,
} from "solid-js";

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

export const unreachable = (message = "Unreachable code reached"): never => {
  throw new Error(message);
};

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const formatNumber = (value: number, digits: number): string => {
  return value.toFixed(digits);
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

export const positiveFiniteOrZero = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

export const halfLifeToDecay = (halfLifeSeconds: number): number => {
  const halfLife = positiveFiniteOrZero(halfLifeSeconds);

  return halfLife > 0 ? Math.LN2 / halfLife : 0;
};

export const createThrottledMemo = <Value>(
  computation: (previous: Value | undefined) => Value,
  timeoutMs: number,
): Accessor<Value> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let lastUpdatedAt = 0;
  const [timerTick, setTimerTick] = createSignal(0);

  onCleanup(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  });

  const memo = createMemo<Value | undefined>((previous) => {
    timerTick();

    if (timeoutMs <= 0 || previous === undefined) {
      lastUpdatedAt = Date.now();
      return computation(previous);
    }

    const now = Date.now();
    const elapsedMs = now - lastUpdatedAt;

    if (elapsedMs >= timeoutMs) {
      lastUpdatedAt = now;
      return computation(previous);
    }

    if (timeoutId === undefined) {
      timeoutId = setTimeout(() => {
        timeoutId = undefined;
        setTimerTick((current) => current + 1);
      }, timeoutMs - elapsedMs);
    }

    return previous;
  });

  return memo as Accessor<Value>;
};
