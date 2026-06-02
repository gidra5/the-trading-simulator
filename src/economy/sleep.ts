import { batch, createEffect, createSignal, untrack, type Accessor } from "solid-js";
import { Need, type Needs } from "./needs";

export type SleepSnapshot = {
  startedAt: number;
  wakeAt: number;
};

type SleepOptions = {
  base: Accessor<Needs>;
  dt: Accessor<number>;
  sampleDuration: (durationMs: number) => number;
  time: Accessor<number>;
  needs: {
    fulfillNeed: (need: Need, amount: number) => void;
    needs: Accessor<Needs>;
  };
};

const inactiveSleepSnapshot: SleepSnapshot = {
  startedAt: 0,
  wakeAt: 0,
};
const sleepRampDurationMs = 90 * 60 * 1_000;
const sleepRecoveryRate = 0.00125;
const stressRecoveryRate = 0.00115;
const healthRecoveryFoodRatio = 0.7;
const healthRecoveryRate = 0.00005;

const sleepRamp = (elapsedMs: number): number => 1 - Math.exp(-elapsedMs / sleepRampDurationMs);

export const createSleep = (options: SleepOptions) => {
  const [sleep, setSleep] = createSignal<SleepSnapshot>(inactiveSleepSnapshot);
  const sleeping = (): boolean => sleep().wakeAt > options.time();
  const wakeAt = (): number => sleep().wakeAt;

  const start = (durationMs: number): number => {
    const startedAt = options.time();
    const wakeAt = startedAt + options.sampleDuration(durationMs);
    setSleep({
      startedAt,
      wakeAt,
    });
    return wakeAt;
  };

  const interrupt = (): void => {
    setSleep(inactiveSleepSnapshot);
  };

  createEffect(() => {
    const dt = options.dt();
    const currentTime = options.time();
    const currentSleep = untrack(sleep);
    if (currentSleep.wakeAt <= currentTime - dt) return;

    const previousTime = currentTime - dt;
    const segmentStart = Math.max(previousTime, currentSleep.startedAt);
    const segmentEnd = Math.min(currentTime, currentSleep.wakeAt);
    const sleepDt = segmentEnd - segmentStart;
    if (sleepDt <= 0) return;

    const base = untrack(options.base);
    const currentNeeds = untrack(options.needs.needs);
    const ramp = sleepRamp(segmentStart - currentSleep.startedAt);
    batch(() => {
      options.needs.fulfillNeed(Need.Sleep, sleepDt * sleepRecoveryRate * ramp);
      options.needs.fulfillNeed(Need.Stress, sleepDt * stressRecoveryRate * ramp);
      if (currentNeeds[Need.Food] / base[Need.Food] >= healthRecoveryFoodRatio) {
        options.needs.fulfillNeed(Need.Health, sleepDt * healthRecoveryRate * ramp);
      }
      if (currentTime >= currentSleep.wakeAt) setSleep(inactiveSleepSnapshot);
    });
  });

  const snapshot = (): SleepSnapshot => sleep();

  const restore = (snapshot: SleepSnapshot): void => {
    setSleep(snapshot);
  };

  return {
    interrupt,
    restore,
    sleeping,
    snapshot,
    start,
    wakeAt,
  };
};
