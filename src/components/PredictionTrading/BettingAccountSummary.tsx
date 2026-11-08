import "./BettingAccountSummary.css";

import { useQuery } from "@tanstack/react-query";

import { useAuth } from "../../context/AuthContext";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinSummaryQueryOptions } from "../../lib/coins/coinQueries";

export const BettingAccountSummary = () => {
  const { isAuthenticated, user } = useAuth();
  const { data } = useQuery({
    ...coinSummaryQueryOptions(user?.username ?? "anonymous"),
    enabled: isAuthenticated,
  });
  if (!isAuthenticated || !data) return null;

  const inBets = data.inBets ?? 0;
  return (
    <dl className="bettingAccountSummary" aria-label="Betting account" aria-live="polite">
      <div>
        <dt>Net worth</dt>
        <dd>{formatCoinBalance(data.balance + inBets)}</dd>
      </div>
      <div>
        <dt>In bets</dt>
        <dd>{formatCoinBalance(inBets)}</dd>
      </div>
      <div>
        <dt>Balance</dt>
        <dd>{formatCoinBalance(data.balance)}</dd>
      </div>
    </dl>
  );
};
