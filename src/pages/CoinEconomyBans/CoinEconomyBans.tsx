import "./CoinEconomyBans.css";

import { faBan, faClockRotateLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  type CoinEconomyBan,
  createCoinEconomyBan,
  fetchCoinEconomyBans,
  revokeCoinEconomyBan,
} from "../../lib/coins/economyBans";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

const BAN_MANAGER = "seaside_tiramisu";
const durationUnits = {
  hours: 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
} as const;
type DurationUnit = keyof typeof durationUnits;

const banStatus = (ban: CoinEconomyBan): "active" | "revoked" | "expired" => {
  if (ban.revoked_at) return "revoked";
  return new Date(ban.ends_at).getTime() > Date.now() ? "active" : "expired";
};

export const CoinEconomyBansPage = () => {
  const { isLoading, user } = useAuth();
  const [bans, setBans] = useState<CoinEconomyBan[]>([]);
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState("");
  const [duration, setDuration] = useState("7");
  const [unit, setUnit] = useState<DurationUnit>("days");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const isManager = normalizeUsername(user?.username) === BAN_MANAGER;

  useEffect(() => {
    if (isLoading) return;
    if (!isManager) {
      setLoading(false);
      return;
    }
    let current = true;
    void fetchCoinEconomyBans()
      .then(({ bans: rows }) => {
        if (current) setBans(rows);
      })
      .catch((loadError) => {
        if (current) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load economy bans.");
        }
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [isLoading, isManager]);

  const activeCount = useMemo(
    () => bans.filter((ban) => banStatus(ban) === "active").length,
    [bans],
  );
  const parsedDuration = Number(duration);
  const validDuration =
    Number.isInteger(parsedDuration) &&
    parsedDuration > 0 &&
    parsedDuration * durationUnits[unit] <= durationUnits.days * 365;

  const submitBan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validDuration || !username.trim() || !reason.trim() || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const endsAt = new Date(Date.now() + parsedDuration * durationUnits[unit]).toISOString();
      const { ban } = await createCoinEconomyBan({
        username: username.trim(),
        endsAt,
        reason: reason.trim(),
      });
      setBans((current) => [
        ban,
        ...current.map((entry) =>
          entry.username === ban.username && banStatus(entry) === "active"
            ? { ...entry, revoked_at: ban.created_at, revoked_by: BAN_MANAGER }
            : entry,
        ),
      ]);
      setUsername("");
      setReason("");
    } catch (banError) {
      setError(banError instanceof Error ? banError.message : "Unable to create economy ban.");
    } finally {
      setSubmitting(false);
    }
  };

  const revokeBan = async (id: number) => {
    setRevokingId(id);
    setError("");
    try {
      const { ban } = await revokeCoinEconomyBan(id);
      setBans((current) => current.map((entry) => (entry.id === ban.id ? ban : entry)));
    } catch (revokeError) {
      setError(
        revokeError instanceof Error ? revokeError.message : "Unable to revoke economy ban.",
      );
    } finally {
      setRevokingId(null);
    }
  };

  if (isLoading || loading) return <RouteLoadingFallback />;

  return (
    <main className="page economyBansPage">
      <Seo title="Coin economy bans" description="Manage time-limited Atomic Coin restrictions." />
      <section className="panel economyBansPanel">
        <header className="economyBansHeader">
          <h1>Coin economy bans</h1>
          {isManager ? <span>{activeCount} active</span> : null}
        </header>

        {!isManager ? <p className="economyBansAccess">This page is restricted.</p> : null}
        {error ? (
          <p className="economyBansError" role="alert">
            {error}
          </p>
        ) : null}

        {isManager ? (
          <>
            <form className="economyBanForm" onSubmit={submitBan}>
              <label>
                Username
                <input
                  type="text"
                  required
                  maxLength={100}
                  pattern="[A-Za-z0-9_-]+"
                  autoComplete="off"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                />
              </label>
              <fieldset>
                <legend>Ban duration</legend>
                <div>
                  <input
                    aria-label="Ban duration"
                    type="number"
                    min="1"
                    step="1"
                    required
                    value={duration}
                    onChange={(event) => setDuration(event.target.value)}
                  />
                  <select
                    aria-label="Duration unit"
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as DurationUnit)}
                  >
                    <option value="hours">Hours</option>
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                  </select>
                </div>
              </fieldset>
              <label className="economyBanReason">
                Reason
                <textarea
                  required
                  maxLength={1000}
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <button
                className="economyBanSubmit"
                type="submit"
                disabled={!validDuration || !username.trim() || !reason.trim() || submitting}
              >
                <FontAwesomeIcon icon={faBan} aria-hidden="true" />
                {submitting ? "Banning…" : "Ban from coin economy"}
              </button>
            </form>

            {bans.length ? (
              <ol className="economyBanList">
                {bans.map((ban) => {
                  const status = banStatus(ban);
                  return (
                    <li className={`economyBanRow ${status}`} key={ban.id}>
                      <div className="economyBanTopline">
                        <Link to="/@/$username" params={{ username: ban.username }}>
                          {ban.username}
                        </Link>
                        <span>{status}</span>
                      </div>
                      <p>{ban.reason}</p>
                      <div className="economyBanMeta">
                        <FontAwesomeIcon icon={faClockRotateLeft} aria-hidden="true" />
                        <span>
                          {status === "revoked" && ban.revoked_at
                            ? `Revoked ${formatLocalDateTime(ban.revoked_at)}`
                            : `Ends ${formatLocalDateTime(ban.ends_at)}`}
                        </span>
                        <span>by {ban.created_by}</span>
                      </div>
                      {status === "active" ? (
                        <button
                          type="button"
                          disabled={revokingId === ban.id}
                          onClick={() => void revokeBan(ban.id)}
                        >
                          {revokingId === ban.id ? "Revoking…" : "Revoke ban"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="economyBansEmpty">No economy bans have been issued.</p>
            )}
          </>
        ) : null}
      </section>
    </main>
  );
};
