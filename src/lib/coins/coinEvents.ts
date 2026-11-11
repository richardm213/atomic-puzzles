export type CoinEarnedDetail = {
  amount: number;
  label: string;
  username?: string;
  precise?: boolean;
};

export const COINS_EARNED_EVENT = "atomic-puzzles:coins-earned";

export const announceCoinChange = (
  amount: number,
  label: string,
  username?: string,
  precise = false,
): void => {
  if (typeof window === "undefined" || !Number.isFinite(amount) || amount === 0) return;
  window.dispatchEvent(
    new CustomEvent<CoinEarnedDetail>(COINS_EARNED_EVENT, {
      detail: { amount, label, ...(username ? { username } : {}), ...(precise ? { precise } : {}) },
    }),
  );
};

export const announceCoinsEarned = (amount: number, label: string): void => {
  if (amount <= 0) return;
  announceCoinChange(amount, label);
};
