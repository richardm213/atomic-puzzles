import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import type { PredictionTraderHistoryEntry } from "../../../shared/domain/predictionTraderHistory";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import { predictionTraderHistoryQueryOptions } from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  type PredictionMarketDefinition,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import { DataTable } from "../DataTable/DataTable";
import { InlineState } from "../InlineState/InlineState";

const actionLabels: Record<PredictionTraderHistoryEntry["action"], string> = {
  buy: "Buy",
  sell: "Sell",
  fee: "Fee",
  settlement: "Settlement",
  correction: "Correction",
  refund: "Refund",
  payment: "Payment",
};
const pnl = (amount: number) => `${amount > 0 ? "+" : ""}${formatCoinValue(amount)}`;

export const PredictionTraderHistory = ({
  definition,
  username,
  onBack,
}: {
  definition: PredictionMarketDefinition;
  username: string;
  onBack: () => void;
}) => {
  const history = useQuery(predictionTraderHistoryQueryOptions(definition.id, username));
  const totalPnl = history.data?.at(-1)?.runningPnl ?? 0;
  const back = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    back.current?.focus();
  }, []);
  return (
    <section className="predictionTraderHistory" aria-label={`Transactions for ${username}`}>
      <button ref={back} type="button" className="predictionHistoryBack" onClick={onBack}>
        ← P&amp;L
      </button>
      {history.isPending ? (
        <p role="status">Loading transactions…</p>
      ) : history.error ? (
        <InlineState kind="error">
          {getErrorMessage(history.error, "Unable to load transactions.")}
          <button type="button" onClick={() => void history.refetch()}>
            Retry
          </button>
        </InlineState>
      ) : history.data.length === 0 ? (
        <InlineState kind="empty">No transactions on this strike.</InlineState>
      ) : (
        <>
          <p className="predictionHistoryTotal">
            Total P&amp;L <strong data-pnl={Math.sign(totalPnl)}>{pnl(totalPnl)}</strong>
          </p>
          <DataTable className="predictionTraderHistoryTable">
            <caption>Transactions for {username}</caption>
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Action</th>
                <th scope="col">Selection</th>
                <th scope="col">Avg. price</th>
                <th scope="col">Quantity</th>
                <th scope="col">P&amp;L change</th>
              </tr>
            </thead>
            <tbody>
              {history.data.map((row) => (
                <tr key={row.id}>
                  <td>
                    <time dateTime={row.createdAt}>{formatLocalDateTime(row.createdAt)}</time>
                  </td>
                  <td>{actionLabels[row.action]}</td>
                  <td data-outcome={row.outcome ?? undefined}>
                    {row.outcome
                      ? predictionOutcomeLabel(definition, row.outcome)
                      : row.action === "sell"
                        ? "Both sides"
                        : "—"}
                  </td>
                  <td>
                    {row.averagePriceCents === null
                      ? "—"
                      : `${formatCoinValue(row.averagePriceCents)}¢`}
                  </td>
                  <td>{row.quantity === null ? "—" : formatCoinValue(row.quantity)}</td>
                  <td data-pnl={Math.sign(row.pnlChange)}>{pnl(row.pnlChange)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row" colSpan={5}>
                  Total P&amp;L
                </th>
                <td data-pnl={Math.sign(totalPnl)}>
                  <strong>{pnl(totalPnl)}</strong>
                </td>
              </tr>
            </tfoot>
          </DataTable>
        </>
      )}
    </section>
  );
};
