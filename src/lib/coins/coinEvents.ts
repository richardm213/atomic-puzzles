export type CoinEarnedDetail = {
  amount: number;
  label: string;
};

export const COINS_EARNED_EVENT = "atomic-puzzles:coins-earned";

export const announceCoinsEarned = (amount: number, label: string): void => {
  if (typeof window === "undefined" || !Number.isFinite(amount) || amount <= 0) return;
  window.dispatchEvent(
    new CustomEvent<CoinEarnedDetail>(COINS_EARNED_EVENT, {
      detail: { amount: Math.round(amount), label },
    }),
  );
};
