import { createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

export const assert: (condition: unknown, message?: string) => asserts condition = (
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

export const promiseYield = (): Promise<void> =>
  new Promise((resolve) => {
    window.setTimeout(resolve, 0);
  });

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const formatNumber = (value: number, digits: number): string => {
  return value.toFixed(digits);
};

export const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
};

export const base64ToBytes = (base64: string): Uint8Array => {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

export const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);
  return buffer;
};

export const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(" ");


export const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

export const binarySearchIndex = <T>(
  items: readonly T[],
  compare: (item: T, index: number, items: readonly T[]) => number,
): number => {
  let low = 0;
  let high = items.length;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);

    if (compare(items[mid]!, mid, items) < 0) low = mid + 1;
    else high = mid;
  }

  return low;
};

export const positiveFiniteOrZero = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

export const halfLifeToDecay = (halfLifeSeconds: number): number => {
  const halfLife = positiveFiniteOrZero(halfLifeSeconds);

  return halfLife > 0 ? Math.LN2 / halfLife : 0;
};

export const inRangeInclusive = (x: number, min: number, max: number) => x >= min && x <= max;
export const inRange = (x: number, min: number, max: number) => x >= min && x < max;

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
