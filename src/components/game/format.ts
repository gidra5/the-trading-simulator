export const digits = 6;

export const formatMoney = (value: number): string =>
  value.toLocaleString(undefined, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
    currency: "USD",
  });

export const formatAmount = (value: number): string => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
