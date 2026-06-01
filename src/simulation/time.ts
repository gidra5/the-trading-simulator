import { batch, createSignal } from "solid-js";

const durationUnitMs = {
  y: 365 * 24 * 60 * 60 * 1_000,
  M: 30 * 24 * 60 * 60 * 1_000,
  w: 7 * 24 * 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
  h: 60 * 60 * 1_000,
  m: 60 * 1_000,
  ms: 1,
  s: 1_000,
} as const;

export const parseSimulationDuration = (input: string): number | null => {
  const text = input.trim().toLowerCase();
  const tokenPattern = /\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|M|y)/gy;
  let offset = 0;
  let duration = 0;

  while (offset < text.length) {
    tokenPattern.lastIndex = offset;
    const match = tokenPattern.exec(text);
    if (!match) return null;

    const value = Number(match[1]);
    const unit = match[2] as keyof typeof durationUnitMs;
    duration += value * durationUnitMs[unit];
    offset = tokenPattern.lastIndex;
  }

  return duration > 0 ? duration : null;
};

export type SimulationTimeSnapshot = {
  time: number;
};

export const createSimulationTimeState = () => {
  const [dt, setDt] = createSignal(0, { equals: false, name: "time step" });
  const [time, setTime] = createSignal(0, { name: "clock" });

  const advance = (dt: number) => {
    batch(() => {
      setDt(dt);
      setTime((time) => time + dt);
    });
  };

  const snapshot = (): SimulationTimeSnapshot => ({ time: time() });

  const restore = (snapshot: SimulationTimeSnapshot): void => {
    batch(() => {
      setTime(snapshot.time);
    });
  };

  return { dt, time, advance, restore, snapshot };
};

export type SimulationTimeState = ReturnType<typeof createSimulationTimeState>;
