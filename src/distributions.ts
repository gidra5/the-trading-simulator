import { clamp } from "./utils";

export const sampleBernoulli = (probability: number): boolean => {
  return Math.random() < probability;
};

export const sampleUniform = (min: number, max: number): number => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;

  return min + Math.random() * (max - min);
};

export const sampleUniformInteger = (min: number, maxExclusive: number): number => {
  if (!Number.isFinite(min) || !Number.isFinite(maxExclusive) || maxExclusive <= min) {
    return min;
  }

  return Math.floor(sampleUniform(min, maxExclusive));
};

export const samplePowerLaw = (exponent: number): number => {
  if (!Number.isFinite(exponent) || exponent <= 0) {
    return 0;
  }

  return (1 - Math.random()) ** -exponent;
};

export const sampleLogNormal = (median: number, volatility: number): number => {
  if (!Number.isFinite(median) || !Number.isFinite(volatility) || median <= 0 || volatility < 0) {
    return 0;
  }

  const radius = Math.sqrt(-2 * Math.log(1 - Math.random()));
  const angle = 2 * Math.PI * Math.random();
  const normal = radius * Math.cos(angle);

  return median * Math.exp(volatility * normal);
};

export const sampleNormal = (mean: number, standardDeviation: number): number => {
  if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
    return 0;
  }

  const radius = Math.sqrt(-2 * Math.log(1 - Math.random()));
  const angle = 2 * Math.PI * Math.random();
  const normal = radius * Math.cos(angle);

  return mean + standardDeviation * normal;
};

export const samplePoisson = (lambda: number): number => {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;

  const limit = Math.exp(-lambda);
  let events = 0;
  let probability = 1;

  do {
    events += 1;
    probability *= Math.random();
  } while (probability > limit);

  return events - 1;
};

export const samplePoissonProcessEvents = (ratePerSecond: number, intervalMs: number): number =>
  samplePoisson((ratePerSecond * intervalMs) / 1000);

const normalizeEventCount = (eventCount: number | undefined): number | null => {
  if (eventCount === undefined) return null;
  if (!Number.isFinite(eventCount) || eventCount <= 0) return 0;

  return Math.floor(eventCount);
};

const sampleSortedUniformEventTimes = (eventCount: number, intervalMs: number): number[] =>
  Array.from({ length: eventCount }, () => sampleUniform(0, intervalMs)).sort((left, right) => left - right);

export const samplePoissonProcessEventTimes = (
  ratePerSecond: number,
  intervalMs: number,
  eventCount?: number,
): number[] => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const exactEventCount = normalizeEventCount(eventCount);

  if (exactEventCount !== null) {
    return sampleSortedUniformEventTimes(exactEventCount, intervalMs);
  }

  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) return [];

  const intervalSeconds = intervalMs / 1000;
  const eventTimes: number[] = [];
  let time = 0;

  while (time < intervalSeconds) {
    time += sampleExponential(1 / ratePerSecond);

    if (time < intervalSeconds) {
      eventTimes.push(time * 1000);
    }
  }

  return eventTimes;
};

export type HawkesProcessEventTimes = {
  events: number[];
  excitedInterest: number;
};

export const sampleHawkesProcessEventTimes = (
  baselineRatePerSecond: number,
  excitationPerEvent: number,
  decayPerSecond: number,
  intervalMs: number,
  initialExcitedRatePerSecond = 0,
  eventCount?: number,
): HawkesProcessEventTimes => {
  if (!Number.isFinite(baselineRatePerSecond) || baselineRatePerSecond < 0) {
    return { events: [], excitedInterest: 0 };
  }

  if (!Number.isFinite(excitationPerEvent) || excitationPerEvent < 0) {
    return { events: [], excitedInterest: 0 };
  }

  if (!Number.isFinite(decayPerSecond) || decayPerSecond < 0) {
    return { events: [], excitedInterest: 0 };
  }

  const startingExcitedRatePerSecond = Number.isFinite(initialExcitedRatePerSecond)
    ? Math.max(0, initialExcitedRatePerSecond)
    : 0;

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return {
      events: [],
      excitedInterest: startingExcitedRatePerSecond,
    };
  }

  const exactEventCount = normalizeEventCount(eventCount);
  const intervalSeconds = intervalMs / 1000;
  const eventTimes: number[] = [];
  let excitedRatePerSecond = startingExcitedRatePerSecond;
  let time = 0;

  if (exactEventCount !== null) {
    for (let i = 0; i < exactEventCount; i += 1) {
      const remainingTime = intervalSeconds - time;

      if (remainingTime <= 0) break;

      const intensityUpperBound = baselineRatePerSecond + excitedRatePerSecond;

      if (intensityUpperBound <= 0) {
        const remainingEvents = exactEventCount - eventTimes.length;

        eventTimes.push(
          ...sampleSortedUniformEventTimes(remainingEvents, remainingTime * 1000).map(
            (eventTime) => time * 1000 + eventTime,
          ),
        );

        break;
      }

      const tailProbability = Math.exp(-intensityUpperBound * remainingTime);
      const truncatedUniform = sampleUniform(tailProbability, 1);
      const waitingTime = -Math.log(truncatedUniform) / intensityUpperBound;

      if (decayPerSecond > 0) {
        excitedRatePerSecond *= Math.exp(-decayPerSecond * waitingTime);
      }

      time += waitingTime;
      eventTimes.push(time * 1000);
      excitedRatePerSecond += excitationPerEvent;
    }

    if (decayPerSecond > 0) {
      excitedRatePerSecond *= Math.exp(-decayPerSecond * (intervalSeconds - time));
    }

    return { events: eventTimes, excitedInterest: excitedRatePerSecond };
  }

  while (time < intervalSeconds) {
    const intensityUpperBound = baselineRatePerSecond + excitedRatePerSecond;

    if (intensityUpperBound <= 0) break;

    const waitingTime = sampleExponential(1 / intensityUpperBound);
    const nextTime = time + waitingTime;

    if (nextTime >= intervalSeconds) {
      if (decayPerSecond > 0) {
        excitedRatePerSecond *= Math.exp(-decayPerSecond * (intervalSeconds - time));
      }

      break;
    }

    if (decayPerSecond > 0) {
      excitedRatePerSecond *= Math.exp(-decayPerSecond * waitingTime);
    }

    time = nextTime;

    const intensity = baselineRatePerSecond + excitedRatePerSecond;

    if (sampleBernoulli(intensity / intensityUpperBound)) {
      eventTimes.push(time * 1000);
      excitedRatePerSecond += excitationPerEvent;
    }
  }

  return { events: eventTimes, excitedInterest: excitedRatePerSecond };
};

export type HawkesProcessEvent = {
  events: number;
  excitedInterest: number;
};
export const sampleHawkesProcessEvents = (
  intervalMs: number,
  publicInterest: number,
  interestDecay: number,
  excitedInterest: number,
  excitation: number,
): HawkesProcessEvent => {
  const intervalSeconds = intervalMs / 1000;
  const decay = Math.exp(-interestDecay * intervalSeconds);

  excitedInterest *= decay;

  const eventRate = publicInterest + excitedInterest;
  const events = samplePoissonProcessEvents(eventRate, intervalMs);

  excitedInterest += events * excitation;

  return { events, excitedInterest };
};

export type MultivariateHawkesProcessEvent = {
  time: number;
  type: number;
};

export type MultivariateHawkesProcessEventTimes = {
  events: MultivariateHawkesProcessEvent[];
  excitedInterest: number[];
};

const positiveFiniteOrZero = (value: number): number =>
  Number.isFinite(value) && value > 0 ? value : 0;

export const sampleMultivariateHawkesProcessEventTimes = (
  baselineRatePerSecond: number[],
  excitationPerEvent: number[][],
  decayPerSecond: number[],
  intervalMs: number,
  initialExcitedRatePerSecond: number[] = [],
): MultivariateHawkesProcessEventTimes => {
  const dimension = baselineRatePerSecond.length;
  const emptyResult: MultivariateHawkesProcessEventTimes = {
    events: [],
    excitedInterest: new Array(dimension).fill(0),
  };

  if (dimension === 0 || !Number.isFinite(intervalMs) || intervalMs <= 0) {
    return emptyResult;
  }

  const intervalSeconds = intervalMs / 1000;
  const baselineRate = baselineRatePerSecond.map(positiveFiniteOrZero);
  const decayRate = baselineRate.map((_, index) =>
    positiveFiniteOrZero(decayPerSecond[index] ?? 0),
  );
  const excitedRate = baselineRate.map((_, index) =>
    positiveFiniteOrZero(initialExcitedRatePerSecond[index] ?? 0),
  );
  const eventExcitation = baselineRate.map((_, sourceIndex) =>
    baselineRate.map((__, targetIndex) =>
      positiveFiniteOrZero(excitationPerEvent[sourceIndex]?.[targetIndex] ?? 0),
    ),
  );
  const events: MultivariateHawkesProcessEvent[] = [];
  let time = 0;

  while (time < intervalSeconds) {
    const intensityUpperBound = baselineRate.reduce(
      (total, baseline, index) => total + baseline + excitedRate[index],
      0,
    );

    if (intensityUpperBound <= 0) break;

    const waitingTime = sampleExponential(1 / intensityUpperBound);
    const nextTime = time + waitingTime;
    const elapsedTime =
      nextTime >= intervalSeconds ? intervalSeconds - time : waitingTime;

    for (let index = 0; index < dimension; index += 1) {
      if (decayRate[index] > 0) {
        excitedRate[index] *= Math.exp(-decayRate[index] * elapsedTime);
      }
    }

    if (nextTime >= intervalSeconds) break;

    time = nextTime;

    const totalIntensity = baselineRate.reduce(
      (total, baseline, index) => total + baseline + excitedRate[index],
      0,
    );

    if (!sampleBernoulli(totalIntensity / intensityUpperBound)) {
      continue;
    }

    let eventType = 0;
    let cursor = sampleUniform(0, totalIntensity);

    for (let index = 0; index < dimension; index += 1) {
      cursor -= baselineRate[index] + excitedRate[index];

      if (cursor <= 0) {
        eventType = index;
        break;
      }
    }

    events.push({ time: time * 1000, type: eventType });

    for (let index = 0; index < dimension; index += 1) {
      excitedRate[index] += eventExcitation[eventType][index];
    }
  }

  return { events, excitedInterest: excitedRate };
};

export const sampleExponential = (mean: number): number => {
  if (!Number.isFinite(mean) || mean <= 0) return 0;

  return -Math.log(1 - Math.random()) * mean;
};
