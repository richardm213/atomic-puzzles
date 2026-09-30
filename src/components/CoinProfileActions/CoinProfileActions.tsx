import "./CoinProfileActions.css";

import { faCoins, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { coinQueryKeys } from "../../lib/coins/coinQueries";
import { giveCoins } from "../../lib/coins/coins";
import { normalizeUsername } from "../../utils/playerNames";

type CoinProfileActionsProps = {
  recipientUsername: string;
  displayUsername: string;
};

export const CoinProfileActions = ({
  recipientUsername,
  displayUsername,
}: CoinProfileActionsProps) => {
  const { isAuthenticated, user } = useAuth();
  const queryClient = useQueryClient();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("10");
  const [message, setMessage] = useState("");
  const viewerUsername = user?.username ?? "";
  const parsedAmount = Number(amount);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount >= 1 && parsedAmount <= 100000;

  const mutation = useMutation({
    mutationFn: () =>
      giveCoins({ recipientUsername, amount: parsedAmount, message: message.trim() }),
    onSuccess: (result) => {
      queryClient.setQueryData(coinQueryKeys.summary(viewerUsername), {
        balance: result.balance,
        dailyClaimAvailable: result.dailyClaimAvailable,
      });
      setMessage("");
    },
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  if (
    !isAuthenticated ||
    !viewerUsername ||
    normalizeUsername(viewerUsername) === normalizeUsername(recipientUsername)
  ) {
    return null;
  }

  const openDialog = () => {
    mutation.reset();
    setAmount("10");
    setMessage("");
    setIsOpen(true);
  };

  const closeDialog = () => {
    if (!mutation.isPending) setIsOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validAmount || mutation.isPending) return;
    mutation.mutate();
  };

  return (
    <>
      <div className="coinProfileTriggers">
        <button type="button" onClick={openDialog}>
          <FontAwesomeIcon icon={faCoins} aria-hidden="true" />
          Give coins
        </button>
      </div>

      <dialog
        ref={dialogRef}
        className="coinProfileDialog"
        aria-labelledby="coin-profile-action-title"
        onCancel={(event) => {
          if (mutation.isPending) event.preventDefault();
          else setIsOpen(false);
        }}
        onClose={() => setIsOpen(false)}
      >
        <section className="coinProfilePanel">
          <header>
            <h2 id="coin-profile-action-title">Give coins to {displayUsername}</h2>
            <button
              className="coinProfileClose"
              type="button"
              aria-label="Close coin form"
              disabled={mutation.isPending}
              onClick={closeDialog}
            >
              <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
            </button>
          </header>

          {mutation.isSuccess ? (
            <div className="coinProfileSuccess" role="status">
              <FontAwesomeIcon icon={faCoins} aria-hidden="true" />
              <p>
                {parsedAmount.toLocaleString()} coins sent to {displayUsername}.
              </p>
              <button type="button" onClick={closeDialog}>
                Done
              </button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>
                Amount
                <input
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  inputMode="numeric"
                  required
                  autoFocus
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Message <span>Optional</span>
                <textarea
                  maxLength={280}
                  rows={3}
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                />
              </label>
              {mutation.error ? (
                <p className="coinProfileError" role="alert">
                  {mutation.error instanceof Error
                    ? mutation.error.message
                    : "Unable to send coins."}
                </p>
              ) : null}
              <button
                className="coinProfileSubmit"
                type="submit"
                disabled={!validAmount || mutation.isPending}
              >
                {mutation.isPending
                  ? "Sending…"
                  : `Give ${validAmount ? parsedAmount.toLocaleString() : ""} coins`}
              </button>
            </form>
          )}
        </section>
      </dialog>
    </>
  );
};
