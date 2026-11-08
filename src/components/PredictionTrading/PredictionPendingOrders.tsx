import "../PredictionOrderEditor/PredictionOrderEditor.css";

import { faClock, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "../../context/AuthContext";
import { updateCachedCoinBalance } from "../../lib/coins/coinQueries";
import { patchPredictionMarketState } from "../../lib/predictionMarkets/predictionMarketQueries";
import {
  cancelPredictionOrder,
  isPendingPredictionOrder,
  type PredictionMarketDefinition,
  type PredictionOrder,
  predictionOutcomeLabel,
} from "../../lib/predictionMarkets/predictionMarkets";
import { getErrorMessage } from "../../utils/errors";
import { PredictionPrice } from "./PredictionPrice";

export const PredictionPendingOrders = ({
  definition,
  orders,
}: {
  definition: PredictionMarketDefinition;
  orders: readonly PredictionOrder[];
}) => {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const pending = orders.filter((order) => isPendingPredictionOrder(order));
  const quantity = pending.reduce((sum, order) => sum + order.remainingQuantity, 0);
  const cancel = useMutation({
    mutationFn: (orderId: number) => cancelPredictionOrder(definition.id, orderId),
    onSuccess: (result) => {
      patchPredictionMarketState(queryClient, result.state);
      if (user) updateCachedCoinBalance(queryClient, user.username, result.balance);
    },
  });

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, [open]);

  return (
    <>
      {pending.length ? (
        <button
          className="predictionPendingOrdersButton"
          type="button"
          aria-label={`View your pending orders for ${definition.username}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          title={`${quantity.toLocaleString()} contracts in ${pending.length} pending ${pending.length === 1 ? "order" : "orders"}`}
          onClick={() => {
            cancel.reset();
            setOpen(true);
          }}
        >
          <span className="predictionPendingOrderIcon" aria-hidden="true">
            <FontAwesomeIcon icon={faClock} />
          </span>
        </button>
      ) : null}
      {open
        ? createPortal(
            <dialog
              ref={dialog}
              className="predictionOrderEditorBackdrop"
              aria-labelledby={titleId}
              onCancel={(event) => {
                event.preventDefault();
                setOpen(false);
              }}
            >
              <section className="predictionOrderEditor">
                <div className="predictionOrderEditorHeader">
                  <h2 id={titleId}>Your orders · {definition.username}</h2>
                  <button
                    type="button"
                    aria-label="Close pending orders"
                    onClick={() => setOpen(false)}
                  >
                    <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                  </button>
                </div>
                <div className="predictionPendingOrdersBody">
                  {pending.length ? (
                    <table className="predictionPendingOrdersTable">
                      <thead>
                        <tr>
                          <th scope="col">Order</th>
                          <th scope="col">Price</th>
                          <th scope="col">Contracts</th>
                          <th scope="col" aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {pending.map((order) => (
                          <tr key={order.id}>
                            <th scope="row">
                              {order.side === "buy" ? "Buy" : "Sell"}
                              {predictionOutcomeLabel(definition, order.outcome)}
                            </th>
                            <td>
                              <PredictionPrice cents={order.priceCents} />
                            </td>
                            <td>{order.remainingQuantity.toLocaleString()}</td>
                            <td>
                              <button
                                type="button"
                                disabled={cancel.isPending}
                                aria-label={`Cancel order for ${order.remainingQuantity.toLocaleString()} ${predictionOutcomeLabel(definition, order.outcome)} contracts at ${order.priceCents} cents`}
                                onClick={() => cancel.mutate(order.id)}
                              >
                                <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p>No pending orders.</p>
                  )}
                  {cancel.error ? (
                    <p role="alert" className="predictionOrderEditorError">
                      {getErrorMessage(cancel.error, "Unable to cancel this order.")}
                    </p>
                  ) : null}
                </div>
              </section>
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
};
