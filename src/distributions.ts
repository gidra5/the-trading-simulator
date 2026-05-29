import { assert, positiveFiniteOrZero } from "./utils";

export const sampleBernoulli = (probability: number, rng = Math.random): boolean => {
  return rng() < probability;
};

export const sampleUniform = (min: number, max: number, rng = Math.random): number => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;

  return min + rng() * (max - min);
};

export const sampleUniformInteger = (min: number, maxExclusive: number, rng = Math.random): number => {
  if (!Number.isFinite(min) || !Number.isFinite(maxExclusive) || maxExclusive <= min) {
    return min;
  }

  return Math.floor(sampleUniform(min, maxExclusive, rng));
};

export const samplePowerLaw = (exponent: number, rng = Math.random): number => {
  if (!Number.isFinite(exponent) || exponent <= 0) {
    return 0;
  }

  return (1 - rng()) ** -exponent;
};

export const sampleLogNormal = (median: number, volatility: number, rng = Math.random): number => {
  if (!Number.isFinite(median) || !Number.isFinite(volatility) || median <= 0 || volatility < 0) {
    return 0;
  }

  const radius = Math.sqrt(-2 * Math.log(1 - rng()));
  const angle = 2 * Math.PI * rng();
  const normal = radius * Math.cos(angle);

  return median * Math.exp(volatility * normal);
};

export const sampleNormal = (mean: number, standardDeviation: number, rng = Math.random): number => {
  if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
    return 0;
  }

  const radius = Math.sqrt(-2 * Math.log(1 - rng()));
  const angle = 2 * Math.PI * rng();
  const normal = radius * Math.cos(angle);

  return mean + standardDeviation * normal;
};

export const samplePoisson = (lambda: number, rng = Math.random): number => {
  if (!Number.isFinite(lambda) || lambda <= 0) return 0;

  const limit = Math.exp(-lambda);
  let events = 0;
  let probability = 1;

  do {
    events += 1;
    probability *= rng();
  } while (probability > limit);

  return events - 1;
};

export const samplePoissonProcessEvents = (ratePerSecond: number, intervalMs: number, rng = Math.random): number =>
  samplePoisson((ratePerSecond * intervalMs) / 1000, rng);

const normalizeEventCount = (eventCount: number | undefined): number | null => {
  if (eventCount === undefined) return null;
  if (!Number.isFinite(eventCount) || eventCount <= 0) return 0;

  return Math.floor(eventCount);
};

const sampleSortedUniformEventTimes = (eventCount: number, intervalMs: number, rng = Math.random): number[] =>
  Array.from({ length: eventCount }, () => sampleUniform(0, intervalMs, rng)).sort((left, right) => left - right);

export const samplePoissonProcessEventTimes = (
  ratePerSecond: number,
  intervalMs: number,
  eventCount?: number,
  rng = Math.random,
): number[] => {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return [];

  const exactEventCount = normalizeEventCount(eventCount);

  if (exactEventCount !== null) {
    return sampleSortedUniformEventTimes(exactEventCount, intervalMs, rng);
  }

  if (!Number.isFinite(ratePerSecond) || ratePerSecond <= 0) return [];

  const intervalSeconds = intervalMs / 1000;
  const eventTimes: number[] = [];
  let time = 0;

  while (time < intervalSeconds) {
    time += sampleExponential(1 / ratePerSecond, rng);

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
  rng = Math.random,
): HawkesProcessEventTimes => {
  const startingExcitedRatePerSecond = Number.isFinite(initialExcitedRatePerSecond)
    ? Math.max(0, initialExcitedRatePerSecond)
    : 0;

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
          ...sampleSortedUniformEventTimes(remainingEvents, remainingTime * 1000, rng).map(
            (eventTime) => time * 1000 + eventTime,
          ),
        );

        break;
      }

      const tailProbability = Math.exp(-intensityUpperBound * remainingTime);
      const truncatedUniform = sampleUniform(tailProbability, 1, rng);
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

    const waitingTime = sampleExponential(1 / intensityUpperBound, rng);
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

    if (sampleBernoulli(intensity / intensityUpperBound, rng)) {
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
  rng = Math.random,
): HawkesProcessEvent => {
  const intervalSeconds = intervalMs / 1000;
  const decay = Math.exp(-interestDecay * intervalSeconds);

  excitedInterest *= decay;

  const eventRate = publicInterest + excitedInterest;
  const events = samplePoissonProcessEvents(eventRate, intervalMs, rng);

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

export const sampleMultivariateHawkesProcessEventTimes = (
  baselineRatePerSecond: number[],
  excitationPerEvent: number[][],
  decayPerSecond: number[],
  intervalMs: number,
  initialExcitedRatePerSecond: number[] = [],
  rng = Math.random,
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
  const decayRate = baselineRate.map((_, index) => positiveFiniteOrZero(decayPerSecond[index] ?? 0));
  const excitedRate = baselineRate.map((_, index) => positiveFiniteOrZero(initialExcitedRatePerSecond[index] ?? 0));
  const eventExcitation = baselineRate.map((_, sourceIndex) =>
    baselineRate.map((__, targetIndex) => positiveFiniteOrZero(excitationPerEvent[sourceIndex]?.[targetIndex] ?? 0)),
  );
  const events: MultivariateHawkesProcessEvent[] = [];
  let time = 0;

  while (time < intervalSeconds) {
    const intensityUpperBound = baselineRate.reduce(
      (total, baseline, index) => total + baseline + excitedRate[index],
      0,
    );

    if (intensityUpperBound <= 0) break;

    const waitingTime = sampleExponential(1 / intensityUpperBound, rng);
    const nextTime = time + waitingTime;
    const elapsedTime = nextTime >= intervalSeconds ? intervalSeconds - time : waitingTime;

    for (let index = 0; index < dimension; index += 1) {
      if (decayRate[index] > 0) {
        excitedRate[index] *= Math.exp(-decayRate[index] * elapsedTime);
      }
    }

    if (nextTime >= intervalSeconds) break;

    time = nextTime;

    const totalIntensity = baselineRate.reduce((total, baseline, index) => total + baseline + excitedRate[index], 0);

    if (!sampleBernoulli(totalIntensity / intensityUpperBound, rng)) {
      continue;
    }

    let eventType = 0;
    let cursor = sampleUniform(0, totalIntensity, rng);

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

export const sampleMultivariateHawkesProcessEventTypes = (
  baselineRatePerSecond: number[],
  excitationPerEvent: number[][],
  decayPerSecond: number[],
  intervalMs: number,
  excitedRate: number[],
  handleEventType: (eventType: number, dt: number) => void,
  rng = Math.random,
) => {
  const dimension = baselineRatePerSecond.length;
  assert(excitedRate.length === dimension);

  if (dimension === 0 || intervalMs <= 0) return excitedRate;

  const intervalSeconds = intervalMs / 1000;
  let time = 0;

  while (time < intervalSeconds) {
    let intensityUpperBound = 0;

    for (let index = 0; index < dimension; index += 1) {
      intensityUpperBound += baselineRatePerSecond[index] + excitedRate[index];
    }
    if (intensityUpperBound === 0) break;

    const dt = sampleExponential(1 / intensityUpperBound, rng);
    const nextTime = time + dt;
    const elapsedTime = nextTime >= intervalSeconds ? intervalSeconds - time : dt;

    for (let index = 0; index < dimension; index += 1) {
      excitedRate[index] *= Math.exp(-decayPerSecond[index] * elapsedTime);
    }

    if (nextTime >= intervalSeconds) break;
    time = nextTime;

    let totalIntensity = 0;
    for (let index = 0; index < dimension; index += 1) {
      totalIntensity += baselineRatePerSecond[index] + excitedRate[index];
    }

    if (!sampleBernoulli(totalIntensity / intensityUpperBound, rng)) continue;

    let eventType = 0;
    let cursor = sampleUniform(0, totalIntensity, rng);

    for (let index = 0; index < dimension; index += 1) {
      cursor -= baselineRatePerSecond[index] + excitedRate[index];
      if (cursor > 0) continue;

      eventType = index;
      break;
    }

    handleEventType(eventType, dt * 1000);
    const eventExcitation = excitationPerEvent[eventType];
    for (let index = 0; index < dimension; index += 1) {
      excitedRate[index] += eventExcitation[index];
    }
  }
};

export const sampleExponential = (mean: number, rng = Math.random): number => {
  return -Math.log(1 - rng()) * mean;
};

// if size >> mean, behaves like sampleExponential with avg at mean
// if size << mean, behaves like sampleUniform with avg at size/2
// for a fixed mean, it basically interpolates between the two based on size
export const sampleTruncatedExponential = (mean: number, size: number, rng = Math.random): number => {
  const u = rng();
  const lambda = 1 / mean;

  if (Math.abs(lambda) < 1e-9) {
    return u * size;
  }

  return -Math.log(1 - u * (1 - Math.exp(-lambda * size))) / lambda;
};
