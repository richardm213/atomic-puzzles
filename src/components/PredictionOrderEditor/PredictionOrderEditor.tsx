import "./PredictionOrderEditor.css";

import { faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import {
  amendPredictionOrder,
  cancelPredictionOrder,
  predictionDisplayedOrderPrice,
  type PredictionOrder,
  type PredictionOrderMutationResult,
  type PredictionOutcome,
} from "../../lib/predictionMarkets/predictionMarkets";

export const PredictionOrderEditor = ({
  marketId,
  outcome,
  orders,
  onClose,
  onUpdated,
}: {
  marketId: string;
  outcome: PredictionOutcome;
  orders: PredictionOrder[];
  onClose: () => void;
  onUpdated: (result: PredictionOrderMutationResult) => Promise<unknown> | unknown;
}) => {
  const [selectedOrderId, setSelectedOrderId] = useState(orders[0]?.id ?? 0);
  const selectedOrder = useMemo(
    () => orders.find((order) => order.id === selectedOrderId) ?? orders[0],
    [orders, selectedOrderId],
  );
  const [quantityInput, setQuantityInput] = useState("");
  const [priceInput, setPriceInput] = useState("");

  useEffect(() => {
    if (!selectedOrder) return;
    setQuantityInput(String(selectedOrder.remainingQuantity));
    setPriceInput(String(predictionDisplayedOrderPrice(selectedOrder, outcome)));
  }, [outcome, selectedOrder]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  const finish = (result: PredictionOrderMutationResult) => {
    onClose();
    void onUpdated(result);
  };
  const amendMutation = useMutation({
    mutationFn: amendPredictionOrder,
    onSuccess: finish,
  });
  const cancelMutation = useMutation({
    mutationFn: (orderId: number) => cancelPredictionOrder(marketId, orderId),
    onSuccess: finish,
  });
  const pending = amendMutation.isPending || cancelMutation.isPending;
  const quantity = Number(quantityInput);
  const displayedPrice = Number(priceInput);
  const valid =
    selectedOrder &&
    Number.isInteger(quantity) &&
    quantity >= 1 &&
    quantity <= 10_000 &&
    Number.isInteger(displayedPrice) &&
    displayedPrice >= 1 &&
    displayedPrice <= 99;
  const mutationError = amendMutation.error ?? cancelMutation.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedOrder || !valid) return;
    amendMutation.mutate({
      marketId,
      orderId: selectedOrder.id,
      quantity,
      priceCents: selectedOrder.outcome === outcome ? displayedPrice : 100 - displayedPrice,
    });
  };

  if (!selectedOrder) return null;

  return (
    <div className="predictionOrderEditorBackdrop" onMouseDown={onClose}>
      <section
        className="predictionOrderEditor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prediction-order-editor-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="predictionOrderEditorHeader">
          <h2 id="prediction-order-editor-title">Edit order</h2>
          <button type="button" aria-label="Close order editor" onClick={onClose}>
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>
        <form onSubmit={submit}>
          {orders.length > 1 ? (
            <label>
              Order
              <select
                value={selectedOrder.id}
                onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                disabled={pending}
              >
                {orders.map((order) => (
                  <option value={order.id} key={order.id}>
                    {order.remainingQuantity.toLocaleString()} contracts · {order.side}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Contracts
            <input
              type="number"
              min="1"
              max="10000"
              step="1"
              inputMode="numeric"
              value={quantityInput}
              onChange={(event) => setQuantityInput(event.target.value)}
              disabled={pending}
              autoFocus
            />
          </label>
          <label>
            Limit price
            <span className="predictionOrderEditorPrice">
              <input
                type="number"
                min="1"
                max="99"
                step="1"
                inputMode="numeric"
                value={priceInput}
                onChange={(event) => setPriceInput(event.target.value)}
                disabled={pending}
              />
              <span aria-hidden="true">¢</span>
            </span>
          </label>
          {mutationError ? (
            <p className="predictionOrderEditorError" role="alert">
              {mutationError instanceof Error ? mutationError.message : "Unable to update order."}
            </p>
          ) : null}
          <div className="predictionOrderEditorActions">
            <button
              type="button"
              className="predictionOrderEditorDelete"
              disabled={pending}
              onClick={() => cancelMutation.mutate(selectedOrder.id)}
            >
              <FontAwesomeIcon icon={faTrash} />
              Delete order
            </button>
            <button
              type="submit"
              className="predictionOrderEditorSave"
              disabled={!valid || pending}
            >
              {amendMutation.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
};
