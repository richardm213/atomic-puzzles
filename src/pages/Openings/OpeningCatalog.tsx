import "./Openings.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "../../context/AuthContext";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import {
  changeOpening,
  fetchOpeningCatalog,
  fetchOpeningLibrary,
  type OpeningListing,
} from "../../lib/openings/api";
import { getErrorMessage } from "../../utils/errors";

export const OpeningCatalog = () => {
  const auth = useAuth();
  const user = (auth.user?.username ?? "").toLowerCase();
  const client = useQueryClient();
  const navigate = useNavigate();
  const catalog = useQuery({ queryKey: ["opening-catalog"], queryFn: fetchOpeningCatalog });
  const library = useQuery({
    queryKey: ["openings", user],
    queryFn: fetchOpeningLibrary,
    enabled: auth.isAuthenticated,
  });
  const [selected, setSelected] = useState<OpeningListing | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (selected) dialog.current?.showModal();
    else dialog.current?.close();
  }, [selected]);
  const buy = useMutation({
    mutationFn: (listing: OpeningListing) =>
      changeOpening({
        action: "buy",
        id: listing.id,
        quotedPrice: listing.price,
        version: listing.version,
      }),
    onSuccess: (copy) => {
      client.setQueryData(["opening", user, copy.id], copy);
      void client.invalidateQueries({ queryKey: ["openings"] });
      void client.invalidateQueries({ queryKey: ["coins"] });
      setSelected(null);
      void navigate({ to: "/openings", search: { opening: copy.id } });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["opening-catalog"] });
    },
  });
  return (
    <section className="openingCatalog" aria-label="Opening courses">
      {catalog.isPending ? <p>Loading openings…</p> : null}
      {catalog.error ? (
        <p role="alert">{getErrorMessage(catalog.error, "Unable to load openings.")}</p>
      ) : null}
      {catalog.data?.length === 0 ? (
        <p>
          No openings have been published yet. <Link to="/openings">Create an opening</Link>
        </p>
      ) : null}
      {catalog.data?.map((item) => {
        const owned = library.data?.find(
          (c) => c.source_listing_id === item.id || c.listing?.id === item.id,
        );
        return (
          <article className="shopItem" key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            <small>
              By {item.author} · {item.line_count} lines
            </small>
            <strong>{formatCoinBalance(item.price)} coins</strong>
            {owned ? (
              <Link to="/openings" search={{ opening: owned.id }}>
                Open your copy
              </Link>
            ) : (
              <button
                disabled={buy.isPending}
                onClick={() => {
                  buy.reset();
                  if (!auth.isAuthenticated) void auth.login("/shop");
                  else setSelected(item);
                }}
              >
                Buy opening
              </button>
            )}
          </article>
        );
      })}
      <dialog ref={dialog} className="openingConfirm" onCancel={() => setSelected(null)}>
        {selected ? (
          <>
            <h2>Buy {selected.title}?</h2>
            <p>
              {formatCoinBalance(selected.price)} coins. Your copy includes optional creator updates
              and your own training progress.
            </p>
            {buy.error ? (
              <p role="alert">{getErrorMessage(buy.error, "Unable to buy opening.")}</p>
            ) : null}
            <div className="openingActions">
              <button disabled={buy.isPending} onClick={() => buy.mutate(selected)}>
                {buy.isPending ? "Buying…" : "Confirm purchase"}
              </button>
              <button disabled={buy.isPending} onClick={() => setSelected(null)}>
                Cancel
              </button>
            </div>
          </>
        ) : null}
      </dialog>
    </section>
  );
};
