import { assert, positiveFiniteOrZero } from "./utils";

export type HawkesProcessEventTimes = {
  events: number[];
  excitedInterest: number;
};

export type HawkesProcessEvent = {
  events: number;
  excitedInterest: number;
};

export type MultivariateHawkesProcessEvent = {
  time: number;
  type: number;
};

export type MultivariateHawkesProcessEventTimes = {
  events: MultivariateHawkesProcessEvent[];
  excitedInterest: number[];
};

const normalizeEventCount = (eventCount: number | undefined): number | null => {
  if (eventCount === undefined) return null;
  if (!Number.isFinite(eventCount) || eventCount <= 0) return 0;

  return Math.floor(eventCount);
};

export const createDistributions = (rng: () => number) => {
  const sampleBernoulli = (probability: number): boolean => {
    return rng() < probability;
  };

  const sampleUniform = (min: number, max: number): number => {
    if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;

    return min + rng() * (max - min);
  };

  const sampleUniformInteger = (min: number, maxExclusive: number): number => {
    if (!Number.isFinite(min) || !Number.isFinite(maxExclusive) || maxExclusive <= min) {
      return min;
    }

    return Math.floor(sampleUniform(min, maxExclusive));
  };

  const samplePowerLaw = (exponent: number): number => {
    if (!Number.isFinite(exponent) || exponent <= 0) {
      return 0;
    }

    return (1 - rng()) ** -exponent;
  };

  const sampleLogNormal = (median: number, volatility: number): number => {
    const radius = Math.sqrt(-2 * Math.log(1 - rng()));
    const angle = 2 * Math.PI * rng();
    const normal = radius * Math.cos(angle);

    return median * Math.exp(volatility * normal);
  };

  const sampleNormal = (mean: number, standardDeviation: number): number => {
    if (!Number.isFinite(mean) || !Number.isFinite(standardDeviation) || standardDeviation < 0) {
      return 0;
    }

    const radius = Math.sqrt(-2 * Math.log(1 - rng()));
    const angle = 2 * Math.PI * rng();
    const normal = radius * Math.cos(angle);

    return mean + standardDeviation * normal;
  };

  const samplePoisson = (lambda: number): number => {
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

  const samplePoissonProcessEvents = (ratePerSecond: number, intervalMs: number): number =>
    samplePoisson((ratePerSecond * intervalMs) / 1000);

  const sampleSortedUniformEventTimes = (eventCount: number, intervalMs: number): number[] =>
    Array.from({ length: eventCount }, () => sampleUniform(0, intervalMs)).sort((left, right) => left - right);

  const samplePoissonProcessEventTimes = (ratePerSecond: number, intervalMs: number, eventCount?: number): number[] => {
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

  const sampleHawkesProcessEventTimes = (
    baselineRatePerSecond: number,
    excitationPerEvent: number,
    decayPerSecond: number,
    intervalMs: number,
    initialExcitedRatePerSecond = 0,
    eventCount?: number,
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

  const sampleHawkesProcessEvents = (
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

  const sampleMultivariateHawkesProcessEventTimes = (
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

      const waitingTime = sampleExponential(1 / intensityUpperBound);
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

  const sampleMultivariateHawkesProcessEventTypes = (
    baselineRatePerSecond: number[],
    excitationPerEvent: number[][],
    decayPerSecond: number[],
    intervalMs: number,
    excitedRate: number[],
    handleEventType: (eventType: number, dt: number) => void,
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

      const dt = sampleExponential(1 / intensityUpperBound);
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

      if (!sampleBernoulli(totalIntensity / intensityUpperBound)) continue;

      let eventType = 0;
      let cursor = sampleUniform(0, totalIntensity);

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

  const sampleExponential = (mean: number): number => {
    return -Math.log(1 - rng()) * mean;
  };

  // if size >> mean, behaves like sampleExponential with avg at mean
  // if size << mean, behaves like sampleUniform with avg at size/2
  // for a fixed mean, it basically interpolates between the two based on size
  const sampleTruncatedExponential = (mean: number, size: number): number => {
    const u = rng();
    const lambda = 1 / mean;

    if (Math.abs(lambda) < 1e-9) {
      return u * size;
    }

    return -Math.log(1 - u * (1 - Math.exp(-lambda * size))) / lambda;
  };

  return {
    sampleBernoulli,
    sampleExponential,
    sampleHawkesProcessEvents,
    sampleHawkesProcessEventTimes,
    sampleLogNormal,
    sampleMultivariateHawkesProcessEventTimes,
    sampleMultivariateHawkesProcessEventTypes,
    sampleNormal,
    samplePoisson,
    samplePoissonProcessEvents,
    samplePoissonProcessEventTimes,
    samplePowerLaw,
    sampleTruncatedExponential,
    sampleUniform,
    sampleUniformInteger,
  };
};

export type Distributions = ReturnType<typeof createDistributions>;
