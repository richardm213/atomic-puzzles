import "./ShopRedemptions.css";

import { faCheck, faRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useEffect, useMemo, useState } from "react";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  fetchShopRedemptions,
  type ShopRedemption,
  type ShopRedemptionStatus,
  updateShopRedemption,
} from "../../lib/coins/shopRedemptions";
import { getErrorMessage } from "../../utils/errors";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

const SHOP_ADMIN = "seaside_tiramisu";
type RedemptionFilter = "all" | ShopRedemptionStatus;

const itemNames: Record<ShopRedemption["itemKey"], string> = {
  username_change: "Change username",
  discord_nitro_month: "1 month Discord Nitro Basic",
  discord_nitro_year: "1 year Discord Nitro Basic",
  discord_nitro_full_month: "1 month Discord Nitro Nitro",
  discord_nitro_full_year: "1 year Discord Nitro Nitro",
  flowers_500: "500 Flowers",
  lichess_patron_month: "1 month Lichess Patron",
  next_prize_tournament_format: "Choose tournament format",
  atomicdb_analysis_12h: "12-hour AtomicDB analysis",
};

const detailString = (redemption: ShopRedemption, key: string): string => {
  const value = redemption.requestDetails[key];
  return typeof value === "string" ? value : "";
};

const detailStrings = (redemption: ShopRedemption, key: string): string[] => {
  const value = redemption.requestDetails[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
};

const RedemptionDetails = ({ redemption }: { redemption: ShopRedemption }) => {
  if (redemption.itemKey === "username_change") {
    return (
      <dl className="shopRedemptionDetails">
        <div>
          <dt>Requested username</dt>
          <dd>{detailString(redemption, "requestedUsername") || "Not provided"}</dd>
        </div>
      </dl>
    );
  }
  if (redemption.itemKey === "atomicdb_analysis_12h") {
    const openings = detailStrings(redemption, "openings");
    const players = detailStrings(redemption, "players");
    return (
      <dl className="shopRedemptionDetails">
        <div>
          <dt>Focus</dt>
          <dd>{detailString(redemption, "focus").replaceAll("_", " ") || "Not provided"}</dd>
        </div>
        {openings.length ? (
          <div>
            <dt>Openings</dt>
            <dd>{openings.join(" · ")}</dd>
          </div>
        ) : null}
        {players.length ? (
          <div>
            <dt>Players</dt>
            <dd>{players.join(", ")}</dd>
          </div>
        ) : null}
      </dl>
    );
  }
  return null;
};

export const ShopRedemptionsPage = () => {
  const { isLoading, user } = useAuth();
  const [redemptions, setRedemptions] = useState<ShopRedemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<RedemptionFilter>("pending");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const isAdmin = normalizeUsername(user?.username) === SHOP_ADMIN;

  useEffect(() => {
    if (isLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    let current = true;
    void fetchShopRedemptions()
      .then((rows) => {
        if (current) setRedemptions(rows);
      })
      .catch((loadError) => {
        if (current) {
          setError(getErrorMessage(loadError, "Unable to load redemptions."));
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isAdmin, isLoading]);

  const counts = useMemo(
    () => ({
      all: redemptions.length,
      pending: redemptions.filter((row) => row.status === "pending").length,
      fulfilled: redemptions.filter((row) => row.status === "fulfilled").length,
      cancelled: redemptions.filter((row) => row.status === "cancelled").length,
    }),
    [redemptions],
  );
  const visibleRedemptions = useMemo(
    () => redemptions.filter((row) => filter === "all" || row.status === filter),
    [filter, redemptions],
  );

  const updateStatus = async (redemption: ShopRedemption, status: "fulfilled" | "cancelled") => {
    if (
      status === "cancelled" &&
      !window.confirm(
        `Cancel this redemption and refund ${redemption.cost.toLocaleString()} coins?`,
      )
    ) {
      return;
    }
    setUpdatingId(redemption.id);
    setError("");
    try {
      const updated = await updateShopRedemption(redemption.id, status);
      setRedemptions((current) =>
        current.map((entry) => (entry.id === updated.id ? updated : entry)),
      );
    } catch (updateError) {
      setError(getErrorMessage(updateError, "Unable to update redemption."));
    } finally {
      setUpdatingId(null);
    }
  };

  if (isLoading || loading) return <RouteLoadingFallback />;

  return (
    <div className="page shopRedemptionsPage">
      <Seo title="Shop redemptions" description="Review and fulfill Atomic Coin purchases." />
      <section className="panel shopRedemptionsPanel">
        <header className="shopRedemptionsHeader">
          <h1>Shop redemptions</h1>
          {isAdmin ? <span>{counts.pending} pending</span> : null}
        </header>

        {!isAdmin ? <p className="shopRedemptionsState">This page is restricted.</p> : null}
        {error ? (
          <p className="shopRedemptionsError" role="alert">
            {error}
          </p>
        ) : null}

        {isAdmin ? (
          <>
            <div className="shopRedemptionFilters" aria-label="Filter redemptions">
              {(["pending", "all", "fulfilled", "cancelled"] as const).map((status) => (
                <button
                  type="button"
                  className={filter === status ? "active" : ""}
                  aria-pressed={filter === status}
                  key={status}
                  onClick={() => setFilter(status)}
                >
                  <span>{status}</span>
                  <strong>{counts[status]}</strong>
                </button>
              ))}
            </div>

            {visibleRedemptions.length ? (
              <ol className="shopRedemptionList">
                {visibleRedemptions.map((redemption) => (
                  <li key={redemption.id}>
                    <div className="shopRedemptionTopline">
                      <div>
                        <strong>{itemNames[redemption.itemKey]}</strong>
                        <PlayerLink username={redemption.username}>
                          {redemption.username}
                        </PlayerLink>
                      </div>
                      <span className={`shopRedemptionStatus ${redemption.status}`}>
                        {redemption.status}
                      </span>
                    </div>
                    <RedemptionDetails redemption={redemption} />
                    <div className="shopRedemptionMeta">
                      <span>{redemption.cost.toLocaleString()} coins</span>
                      <time dateTime={redemption.createdAt}>
                        {formatLocalDateTime(redemption.createdAt)}
                      </time>
                      {redemption.fulfilledBy && redemption.fulfilledAt ? (
                        <span>
                          {redemption.status === "cancelled" ? "Cancelled" : "Fulfilled"} by
                          {redemption.fulfilledBy} · {formatLocalDateTime(redemption.fulfilledAt)}
                        </span>
                      ) : null}
                    </div>
                    {redemption.status === "pending" ? (
                      <div className="shopRedemptionActions">
                        <button
                          type="button"
                          className="cancel"
                          disabled={updatingId !== null}
                          onClick={() => void updateStatus(redemption, "cancelled")}
                        >
                          <FontAwesomeIcon icon={faRotateLeft} aria-hidden="true" />
                          Cancel &amp; refund
                        </button>
                        <button
                          type="button"
                          className="fulfill"
                          disabled={updatingId !== null}
                          onClick={() => void updateStatus(redemption, "fulfilled")}
                        >
                          <FontAwesomeIcon icon={faCheck} aria-hidden="true" />
                          {updatingId === redemption.id
                            ? "Updating…"
                            : redemption.itemKey === "username_change"
                              ? "Approve & fulfill"
                              : "Mark fulfilled"}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="shopRedemptionsState">
                No {filter === "all" ? "" : `${filter} `}redemptions.
              </p>
            )}
          </>
        ) : null}
      </section>
    </div>
  );
};
