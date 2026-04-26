export const sampleBernoulli = (probability: number): boolean => {
  if (!Number.isFinite(probability)) return false;

  return Math.random() < Math.min(Math.max(probability, 0), 1);
};

export const sampleUniform = (min: number, max: number): number => {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return 0;

  return min + Math.random() * (max - min);
};

export const sampleUniformInteger = (
  min: number,
  maxExclusive: number,
): number => {
  if (
    !Number.isFinite(min) ||
    !Number.isFinite(maxExclusive) ||
    maxExclusive <= min
  ) {
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
  if (
    !Number.isFinite(median) ||
    !Number.isFinite(volatility) ||
    median <= 0 ||
    volatility < 0
  ) {
    return 0;
  }

  const radius = Math.sqrt(-2 * Math.log(1 - Math.random()));
  const angle = 2 * Math.PI * Math.random();
  const normal = radius * Math.cos(angle);

  return median * Math.exp(volatility * normal);
};

export const sampleNormal = (mean: number, standardDeviation: number): number => {
  if (
    !Number.isFinite(mean) ||
    !Number.isFinite(standardDeviation) ||
    standardDeviation < 0
  ) {
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

export const samplePoissonProcessEvents = (
  ratePerSecond: number,
  intervalMs: number,
): number => samplePoisson((ratePerSecond * intervalMs) / 1000);

export const sampleExponential = (mean: number): number => {
  if (!Number.isFinite(mean) || mean <= 0) return 0;

  return -Math.log(1 - Math.random()) * mean;
};
