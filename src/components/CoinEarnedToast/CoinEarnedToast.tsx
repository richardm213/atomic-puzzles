import "./CoinEarnedToast.css";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { type CoinEarnedDetail, COINS_EARNED_EVENT } from "../../lib/coins/coinEvents";
import { appAssetPath } from "../../utils/appAssetPath";

type Reward = CoinEarnedDetail & { id: number };

export const CoinEarnedToast = () => {
  const [rewards, setRewards] = useState<Reward[]>([]);
  const nextId = useRef(0);
  const queryClient = useQueryClient();

  useEffect(() => {
    const onCoinsEarned = (event: Event) => {
      const detail = (event as CustomEvent<CoinEarnedDetail>).detail;
      if (!detail || detail.amount === 0) return;
      const id = ++nextId.current;
      setRewards((current) => [...current.slice(-2), { ...detail, id }]);
      void queryClient.invalidateQueries({ queryKey: ["coins"] });
      window.setTimeout(() => {
        setRewards((current) => current.filter((reward) => reward.id !== id));
      }, 2600);
    };
    window.addEventListener(COINS_EARNED_EVENT, onCoinsEarned);
    return () => window.removeEventListener(COINS_EARNED_EVENT, onCoinsEarned);
  }, [queryClient]);

  return (
    <div className="coinEarnedRegion" aria-live="polite" aria-atomic="false">
      {rewards.map((reward) => (
        <div className={`coinEarnedToast${reward.amount < 0 ? " isPenalty" : ""}`} key={reward.id}>
          <span className="coinEarnedBurst" aria-hidden="true">
            <img src={appAssetPath("/images/coins/gold-coin-stack-v2.png")} alt="" />
          </span>
          <span className="coinEarnedCopy">
            <strong>
              {reward.amount > 0 ? "+" : ""}
              {reward.amount} coins
            </strong>
            <span>{reward.label}</span>
          </span>
        </div>
      ))}
    </div>
  );
};
