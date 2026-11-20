export type CoinEarnedDetail = {
  amount: number;
  label: string;
  precise?: boolean;
  preview?: boolean;
};

export const COINS_EARNED_EVENT = "atomic-puzzles:coins-earned";

const dispatchCoinChange = (detail: CoinEarnedDetail): void => {
  if (typeof window === "undefined" || !Number.isFinite(detail.amount) || detail.amount === 0)
    return;
  window.dispatchEvent(new CustomEvent<CoinEarnedDetail>(COINS_EARNED_EVENT, { detail }));
};

export const announceCoinChange = (amount: number, label: string, precise = false): void =>
  dispatchCoinChange({ amount, label, precise });

export const previewCoinChange = (amount: number, label: string): void =>
  dispatchCoinChange({ amount, label, precise: true, preview: true });

export const announceCoinsEarned = (amount: number, label: string): void => {
  if (amount <= 0) return;
  announceCoinChange(amount, label);
};
