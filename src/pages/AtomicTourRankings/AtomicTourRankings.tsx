import "./AtomicTourRankings.css";

import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";

import { DataTable } from "../../components/DataTable/DataTable";
import { InlineState } from "../../components/InlineState/InlineState";
import { Seo } from "../../components/Seo/Seo";
import {
  atomicTourRankingsQueryOptions,
  atomicTourSnapshotDatesQueryOptions,
} from "../../lib/atomicTour/queries";
import { tournamentPlayerCountriesQueryOptions } from "../../lib/matches/tournamentQueries";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { normalizeUsername } from "../../utils/playerNames";

const formatSnapshotDate = (value: string): string =>
  new Date(`${value}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const formatSigned = (value: number): string => {
  if (value > 0) return `+${value.toLocaleString("en-US")}`;
  if (value < 0) return `−${Math.abs(value).toLocaleString("en-US")}`;
  return "";
};

const changeClass = (value: number | null): string => {
  if (value === null || value === 0) return "isNeutral";
  return value > 0 ? "isUp" : "isDown";
};

export const AtomicTourRankingsPage = () => {
  const snapshotsQuery = useQuery(atomicTourSnapshotDatesQueryOptions());
  const countryQuery = useQuery(tournamentPlayerCountriesQueryOptions());
  const snapshotDates = useMemo(() => snapshotsQuery.data ?? [], [snapshotsQuery.data]);
  const [selectedDate, setSelectedDate] = useState("");

  useEffect(() => {
    if (!selectedDate && snapshotDates[0]) setSelectedDate(snapshotDates[0]);
  }, [selectedDate, snapshotDates]);

  const rankingsQuery = useQuery(atomicTourRankingsQueryOptions(selectedDate));
  const rankings = rankingsQuery.data ?? [];

  return (
    <main className="sitePage atomicTourPage">
      <Seo
        title="Atomic Chess Tour"
        description="Rolling two-year Atomic Chess Tour standings from major atomic chess events."
        path="/rankings/tour"
      />

      <div className="panel atomicTourPanel">
        <header className="atomicTourHeader">
          <div className="atomicTourTitleRow">
            <h1>Atomic Chess Tour Rankings</h1>
            <span className="atomicTourHelp">
              <button
                type="button"
                className="atomicTourHelpButton"
                aria-label="How Atomic Chess Tour rankings work"
              >
                <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
              </button>
              <span className="atomicTourHelpTooltip" role="tooltip">
                Rankings use a rolling two-year points total. Major championship titles carry 2,000
                base points; Hyper, Openings, and Wolfarena titles carry 1,000. Losers-bracket wins
                can add bonuses beyond the title base. ACL wins earn 100 points in Elite or 50 in
                Challenger, with half points for draws. Earlier exits earn scaled points, while a
                bye alone earns none. Fair-play disqualified players receive no points.
              </span>
            </span>
          </div>
        </header>

        <div className="controls atomicTourControls">
          <label className="atomicTourDateControl">
            <span>Ranking date</span>
            <select
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
              disabled={!snapshotDates.length}
            >
              {snapshotDates.map((date, index) => (
                <option key={date} value={date}>
                  {index === 0 ? `Live · ${formatSnapshotDate(date)}` : formatSnapshotDate(date)}
                </option>
              ))}
            </select>
          </label>
          <Link className="atomicTourPointsLink" to="/rankings/tour/points">
            <FontAwesomeIcon icon={faCircleInfo} aria-hidden="true" />
            Points by round
          </Link>
        </div>

        {snapshotsQuery.isPending || rankingsQuery.isPending ? (
          <InlineState>Loading Atomic Tour standings…</InlineState>
        ) : snapshotsQuery.error || rankingsQuery.error ? (
          <InlineState kind="error">Atomic Tour standings are temporarily unavailable.</InlineState>
        ) : rankings.length ? (
          <DataTable className="atomicTourTable" wrapperClassName="atomicTourTableWrap">
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">
                  <span aria-label="Rank change">+/−</span>
                </th>
                <th scope="col">Player</th>
                <th scope="col">Points</th>
                <th scope="col">
                  <span aria-label="Points change">+/−</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((player) => (
                <tr key={player.playerName}>
                  <td className="atomicTourRank">{player.rank}</td>
                  <td>
                    <span
                      className={`atomicTourChange ${changeClass(player.rankChange)}`}
                      aria-label={
                        player.rankChange === null
                          ? "New ranking"
                          : player.rankChange > 0
                            ? `Up ${player.rankChange} places`
                            : player.rankChange < 0
                              ? `Down ${Math.abs(player.rankChange)} places`
                              : "No rank change"
                      }
                    >
                      {player.rankChange === null ? "New" : formatSigned(player.rankChange)}
                    </span>
                  </td>
                  <td>
                    <Link
                      className="atomicTourPlayer"
                      to="/tournaments/players/$username"
                      params={{ username: normalizeUsername(player.playerName) }}
                    >
                      <img
                        className="atomicTourPlayerFlag"
                        crossOrigin="anonymous"
                        src={countryCodeToFlagUrl(
                          countryQuery.data?.[normalizeUsername(player.playerName)],
                        )}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        aria-hidden="true"
                      />
                      <span>{player.playerName}</span>
                    </Link>
                  </td>
                  <td className="atomicTourPoints">{player.points.toLocaleString("en-US")}</td>
                  <td>
                    <span
                      className={`atomicTourChange ${changeClass(player.pointsChange)}`}
                      aria-label={
                        player.pointsChange > 0
                          ? `Up ${player.pointsChange.toLocaleString("en-US")} points`
                          : player.pointsChange < 0
                            ? `Down ${Math.abs(player.pointsChange).toLocaleString("en-US")} points`
                            : "No points change"
                      }
                    >
                      {formatSigned(player.pointsChange)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <InlineState kind="empty">No Atomic Tour ranking has been published yet.</InlineState>
        )}
      </div>
    </main>
  );
};
