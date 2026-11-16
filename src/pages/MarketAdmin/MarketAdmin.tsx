import "./MarketAdmin.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";

import {
  type AdminMarket,
  type MarketResolutionInput,
  marketResolutionInputSchema,
  type ResolutionReceipt,
  type ResolutionSummary,
} from "../../../shared/domain/marketAdmin";
import { PUZZLE_ADMIN_USERNAME } from "../../../shared/domain/puzzles/puzzleAdmin";
import { DataTable } from "../../components/DataTable/DataTable";
import { InlineState } from "../../components/InlineState/InlineState";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { formatCoinValue } from "../../lib/coins/coinDisplay";
import {
  fetchAdminMarkets,
  previewMarketResolution,
  resolveAdminMarket,
} from "../../lib/marketAdmin/marketAdmin";
import { clearTournamentResultCaches } from "../../lib/matches/tournaments";
import { getErrorMessage } from "../../utils/errors";

const Summary = ({ summary }: { summary: ResolutionSummary }) => (
  <div className="marketAdminSummary">
    {summary.score ? (
      <p>
        <strong>{summary.winner}</strong> · {summary.score} · {summary.playedOn}
      </p>
    ) : null}
    <dl>
      <div>
        <dt>Strikes</dt>
        <dd>{summary.marketTitles.join(", ")}</dd>
      </div>
      {summary.playedOn ? (
        <div>
          <dt>Match</dt>
          <dd>
            {summary.matchId ? (
              <Link to="/match/$matchId" params={{ matchId: summary.matchId }}>
                {summary.matchId}
              </Link>
            ) : (
              "Unlinked"
            )}
          </dd>
        </div>
      ) : null}
      {summary.bracketChanges.length ? (
        <div>
          <dt>Advancement</dt>
          <dd>
            {summary.bracketChanges.map((c) => (
              <span key={c.id}>
                {c.playerOne || "TBD"} vs {c.playerTwo || "TBD"}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
      {summary.pointChanges.length ? (
        <div>
          <dt>Atomic Tour</dt>
          <dd>
            {summary.pointChanges.map((c) => (
              <span key={c.username}>
                {c.username}: {c.before} → {c.after}
              </span>
            ))}
          </dd>
        </div>
      ) : null}
      <div>
        <dt>Payouts</dt>
        <dd>
          {formatCoinValue(summary.payouts.reduce((sum, p) => sum + p.amount, 0))} coins ·
          {summary.payouts.length} players
        </dd>
      </div>
      <div>
        <dt>Notifications</dt>
        <dd>{summary.notificationCount}</dd>
      </div>
    </dl>
    {summary.payouts.length ? (
      <details>
        <summary>Player payouts</summary>
        <ul>
          {summary.payouts.map((p) => (
            <li key={p.username}>
              {p.username}
              <strong>+{formatCoinValue(p.amount)}</strong>
            </li>
          ))}
        </ul>
      </details>
    ) : null}
    {summary.warnings.map((w) => (
      <p className="marketAdminWarning" key={w}>
        {w}
      </p>
    ))}
  </div>
);

const ResolutionEditor = ({
  market,
  resolving,
  error,
  onResolve,
  onCancel,
}: {
  market: AdminMarket;
  resolving: boolean;
  error: unknown;
  onResolve: (input: MarketResolutionInput, version: string) => void;
  onCancel: () => void;
}) => {
  const [kind, setKind] = useState<"binary" | "price" | "refund">("binary");
  const [outcome, setOutcome] = useState<"yes" | "no">("yes");
  const recorded = Boolean(market.fixture && (market.fixture.s1 || market.fixture.s2));
  const [score1, setScore1] = useState(recorded ? String(market.fixture!.s1) : "");
  const [score2, setScore2] = useState(recorded ? String(market.fixture!.s2) : "");
  const [outcomeType, setOutcomeType] = useState<"played" | "withdrawal" | "disqualification">(
    market.fixture?.outcome_type === "withdrawal"
      ? "withdrawal"
      : market.fixture?.outcome_type === "disqualification"
        ? "disqualification"
        : "played",
  );
  const [playedOn, setPlayedOn] = useState(
    market.fixture?.played_on || new Date().toISOString().slice(0, 10),
  );
  const [matchId, setMatchId] = useState("");
  const [reference, setReference] = useState("");
  const [allowUnlinked, setAllowUnlinked] = useState(false);
  const input = useMemo(() => {
    if (market.fixture && (!score1.trim() || !score2.trim())) return null;
    const result = marketResolutionInputSchema.safeParse(
      market.fixture
        ? {
            marketId: market.id,
            kind: "match",
            score1: Number(score1),
            score2: Number(score2),
            outcomeType,
            playedOn,
            matchId,
            allowUnlinked,
            ...(reference ? { referenceFillId: Number(reference) } : {}),
          }
        : kind === "binary"
          ? { marketId: market.id, kind, outcome }
          : kind === "price"
            ? { marketId: market.id, kind, referenceFillId: Number(reference) }
            : { marketId: market.id, kind },
    );
    return result.success ? result.data : null;
  }, [
    market,
    kind,
    outcome,
    score1,
    score2,
    outcomeType,
    playedOn,
    matchId,
    reference,
    allowUnlinked,
  ]);
  const [readyInput, setReadyInput] = useState(input);
  useEffect(() => {
    const timer = window.setTimeout(() => setReadyInput(input), 350);
    return () => window.clearTimeout(timer);
  }, [input]);
  const preview = useQuery({
    queryKey: ["market-admin", "preview", readyInput],
    queryFn: ({ signal }) => previewMarketResolution(readyInput!, signal),
    enabled: Boolean(readyInput),
    retry: false,
    staleTime: 0,
  });
  const unlinked =
    readyInput?.kind === "match" &&
    readyInput.outcomeType !== "withdrawal" &&
    !preview.data?.summary.matchId &&
    !readyInput.allowUnlinked;
  const canResolve =
    input &&
    input === readyInput &&
    preview.data &&
    !preview.isFetching &&
    !preview.error &&
    !unlinked;
  return (
    <form
      className="marketAdminEditor"
      aria-label={`Resolve ${market.title}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (canResolve) onResolve(input, preview.data.version);
      }}
    >
      <fieldset disabled={resolving}>
        <legend>Result</legend>
        {market.fixture ? (
          <div className="marketAdminFields">
            <label>
              {market.fixture.p1}
              <input
                aria-label={`${market.fixture.p1} score`}
                type="number"
                min="0"
                max="1000"
                step="0.5"
                required
                value={score1}
                onChange={(e) => setScore1(e.target.value)}
              />
            </label>
            <label>
              {market.fixture.p2}
              <input
                aria-label={`${market.fixture.p2} score`}
                type="number"
                min="0"
                max="1000"
                step="0.5"
                required
                value={score2}
                onChange={(e) => setScore2(e.target.value)}
              />
            </label>
            <label>
              Played on
              <input
                type="date"
                required
                value={playedOn}
                onChange={(e) => setPlayedOn(e.target.value)}
              />
            </label>
            <label>
              Result type
              <select
                value={outcomeType}
                onChange={(e) => setOutcomeType(e.target.value as typeof outcomeType)}
              >
                <option value="played">Played</option>
                <option value="withdrawal">Withdrawal before play</option>
                <option value="disqualification">Disqualification</option>
              </select>
            </label>
          </div>
        ) : (
          <div className="marketAdminFields">
            <label>
              Settlement
              <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                <option value="binary">Outcome</option>
                <option value="price">Fair trade price</option>
                <option value="refund">Full refund · no trades</option>
              </select>
            </label>
            {kind === "binary" ? (
              <label>
                Outcome
                <select
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value as typeof outcome)}
                >
                  <option value="yes">{market.choices.yes}</option>
                  <option value="no">{market.choices.no}</option>
                </select>
              </label>
            ) : null}
          </div>
        )}
        {(kind === "price" && !market.fixture) || outcomeType === "withdrawal" ? (
          <label>
            Fair trade ID
            {outcomeType === "withdrawal" ? " (optional; defaults to the latest trade)" : ""}
            <input
              type="number"
              min="1"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
        ) : null}
        {preview.data?.archiveCandidates.length && market.fixture ? (
          <label>
            Archived match
            <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
              <option value="">Automatic match</option>
              {preview.data.archiveCandidates.map((c) => (
                <option key={c.matchId} value={c.matchId}>
                  {c.matchId} · {c.date} · {c.score}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {market.fixture &&
        outcomeType !== "withdrawal" &&
        readyInput &&
        preview.data &&
        !preview.data.summary.matchId ? (
          <label className="marketAdminCheckbox">
            <input
              type="checkbox"
              checked={allowUnlinked}
              onChange={(e) => setAllowUnlinked(e.target.checked)}
            />
            Publish without an archived match link
          </label>
        ) : null}
      </fieldset>
      {preview.isFetching ? <p role="status">Checking result, payouts and points…</p> : null}
      {preview.error ? (
        <InlineState kind="error">
          {getErrorMessage(preview.error, "Unable to preview settlement.")}
        </InlineState>
      ) : null}
      {preview.data && input === readyInput ? <Summary summary={preview.data.summary} /> : null}
      {error ? (
        <InlineState kind="error">
          {getErrorMessage(error, "Unable to resolve market.")}
        </InlineState>
      ) : null}
      <div className="marketAdminActions">
        <button type="submit" disabled={!canResolve || resolving}>
          {resolving ? "Publishing…" : "Resolve and publish"}
        </button>
        <button type="button" className="isSecondary" onClick={onCancel} disabled={resolving}>
          Cancel
        </button>
      </div>
    </form>
  );
};

export const MarketAdminPage = () => {
  const { user, isLoading } = useAuth();
  const isAdmin = user?.username.toLowerCase() === PUZZLE_ADMIN_USERNAME;
  const client = useQueryClient();
  const [status, setStatus] = useState("current");
  const [group, setGroup] = useState("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ResolutionReceipt | null>(null);
  const markets = useQuery({
    queryKey: ["market-admin", "markets"],
    queryFn: fetchAdminMarkets,
    enabled: isAdmin,
    staleTime: 10000,
  });
  const resolution = useMutation({
    mutationFn: ({ input, version }: { input: MarketResolutionInput; version: string }) =>
      resolveAdminMarket(input, version),
    onSuccess: (result) => {
      setReceipt(result);
      setSelected(null);
      clearTournamentResultCaches();
      for (const key of [
        "market-admin",
        "betting",
        "prediction-market",
        "coins",
        "notifications",
        "tournaments",
        "atomic-tour",
        "tournament-match-location",
      ])
        void client.invalidateQueries({ queryKey: [key] });
    },
    onError: () => {
      void client.invalidateQueries({ queryKey: ["market-admin", "preview"] });
    },
  });
  if (isLoading || (isAdmin && markets.isPending)) return <RouteLoadingFallback />;
  const groups = [...new Set(markets.data?.markets.map((m) => m.group) ?? [])];
  const visible =
    markets.data?.markets.filter(
      (m) =>
        (group === "all" || m.group === group) &&
        (status === "all" || ["open", "closed"].includes(m.status)),
    ) ?? [];
  return (
    <section className="marketAdminPage">
      <Seo title="Markets" />
      <header className="marketAdminHeader">
        <h1>Markets</h1>
        <Link to="/betting">Betting</Link>
      </header>
      {!isAdmin ? (
        <InlineState kind="error">This page is restricted.</InlineState>
      ) : (
        <>
          {markets.error ? (
            <InlineState kind="error">
              {getErrorMessage(markets.error, "Unable to load markets.")}
            </InlineState>
          ) : null}
          {receipt ? (
            <section className="marketAdminReceipt">
              <InlineState kind="success">
                Result published. Payouts, notifications and tournament updates verified.
              </InlineState>
              <Summary summary={receipt.summary} />
            </section>
          ) : null}
          <div className="marketAdminFilters">
            <label>
              Market
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value);
                  setSelected(null);
                }}
              >
                <option value="all">All markets</option>
                {groups.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="current">Current</option>
                <option value="all">All</option>
              </select>
            </label>
            <button
              type="button"
              className="isSecondary"
              disabled={resolution.isPending}
              onClick={() => void markets.refetch()}
            >
              Refresh
            </button>
          </div>
          <DataTable className="marketAdminTable">
            <thead>
              <tr>
                <th>Strike</th>
                <th>Status</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((m) => (
                <Fragment key={m.id}>
                  <tr>
                    <th scope="row">
                      {m.title}
                      <small>{m.group}</small>
                    </th>
                    <td>{m.status}</td>
                    <td>
                      {["open", "closed"].includes(m.status) ? (
                        <button
                          type="button"
                          disabled={resolution.isPending}
                          aria-label={`Resolve ${m.title}`}
                          onClick={() => {
                            setSelected(selected === m.id ? null : m.id);
                            resolution.reset();
                            setReceipt(null);
                          }}
                        >
                          Resolve
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {selected === m.id ? (
                    <tr>
                      <td colSpan={3}>
                        <ResolutionEditor
                          key={m.id}
                          market={m}
                          resolving={resolution.isPending}
                          error={resolution.error}
                          onResolve={(input, version) => resolution.mutate({ input, version })}
                          onCancel={() => setSelected(null)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </DataTable>
          {!visible.length ? (
            <InlineState kind="empty">No markets match these filters.</InlineState>
          ) : null}
        </>
      )}
    </section>
  );
};
