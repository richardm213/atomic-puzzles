const normalizedCoinValue = (value: number): number => (Number.isFinite(value) ? value : 0);

export const displayedCoinBalance = (value: number): number =>
  Math.max(0, Math.floor(normalizedCoinValue(value)));

export const displayedCoinDeduction = (value: number): number => {
  const rounded = Math.round(Math.abs(Math.min(0, normalizedCoinValue(value))) * 10) / 10;
  return rounded === 0 ? 0 : -rounded;
};

export const formatCoinBalance = (value: number): string =>
  displayedCoinBalance(value).toLocaleString();

export const formatCoinAmount = (value: number): string => {
  const normalized = normalizedCoinValue(value);
  if (normalized < 0) {
    return displayedCoinDeduction(normalized).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    });
  }
  const displayed = Math.round(normalized * 10) / 10;
  return `${displayed > 0 ? "+" : ""}${displayed.toLocaleString(undefined, {
    maximumFractionDigits: 1,
  })}`;
};
