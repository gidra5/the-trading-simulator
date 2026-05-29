export const priceScaleKinds = ["linear", "logarithmic"] as const;

export type PriceScaleKind = (typeof priceScaleKinds)[number];

const logPriceRangeFactor = 1_000;

export const minimumPriceForScale = (range: readonly [min: number, max: number], scale: PriceScaleKind): number => {
  if (scale === "linear") return 0;

  return Math.max(range[1] / logPriceRangeFactor, Number.MIN_VALUE);
};

export const normalizePriceRangeForScale = (
  range: readonly [min: number, max: number],
  scale: PriceScaleKind,
): [min: number, max: number] => {
  if (scale === "linear" || range[0] > 0) return [range[0], range[1]];

  return [minimumPriceForScale(range, scale), range[1]];
};

export const scalePrice = (price: number, scale: PriceScaleKind): number =>
  scale === "logarithmic" ? Math.log2(price) : price;

export const unscalePrice = (price: number, scale: PriceScaleKind): number =>
  scale === "logarithmic" ? 2 ** price : price;

export const priceAtScalePosition = (
  range: readonly [min: number, max: number],
  position: number,
  scale: PriceScaleKind,
): number => {
  const normalizedRange = normalizePriceRangeForScale(range, scale);
  const min = scalePrice(normalizedRange[0], scale);
  const max = scalePrice(normalizedRange[1], scale);

  return unscalePrice(min + (max - min) * position, scale);
};

export const priceScalePosition = (
  range: readonly [min: number, max: number],
  price: number,
  scale: PriceScaleKind,
): number => {
  const normalizedRange = normalizePriceRangeForScale(range, scale);
  const min = scalePrice(normalizedRange[0], scale);
  const max = scalePrice(normalizedRange[1], scale);

  return (scalePrice(price, scale) - min) / (max - min);
};

export const scaledPriceRange = (
  range: readonly [min: number, max: number],
  scale: PriceScaleKind,
): [min: number, max: number] => {
  const normalizedRange = normalizePriceRangeForScale(range, scale);

  return [scalePrice(normalizedRange[0], scale), scalePrice(normalizedRange[1], scale)];
};

export const normalizeScaleValue = (value: number, maxValue: number, scale: PriceScaleKind): number => {
  if (value <= 0 || maxValue <= 0) return 0;

  return scale === "logarithmic" ? Math.log1p(value) / Math.log1p(maxValue) : value / maxValue;
};
