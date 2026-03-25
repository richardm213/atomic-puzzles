import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { modeOptions } from "./Rankings";
import { fetchLbRows, fetchPlayerRatingsRows, monthKeyFromMonthValue } from "../lib/supabaseLb";

const parseMonthRanksFromLbRows = (rows) => {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const monthKey = monthKeyFromMonthValue(row?.month);
      if (!monthKey) return null;
      const monthDate = new Date(`${String(row.month).slice(0, 10)}T00:00:00Z`);
      const mode = String(row?.tc || "").toLowerCase();
      const rank = Number(row?.rank);
      const rating = Number(row?.rating);
      if (!modeOptions.includes(mode) || !Number.isFinite(rank) || rank <= 0) return null;

      return {
        monthKey,
        monthDate,
        monthLabel: monthKey,
        mode,
        rank,
        rating: Number.isFinite(rating) ? rating : null,
      };
    })
    .filter(Boolean);
};

const loadMonthRanksFromLb = async (username) => {
  const rows = await fetchLbRows({ username });
  return parseMonthRanksFromLbRows(rows);
};

const parseCurrentRatingsFromRows = (rows) => {
  const snapshotsByMode = {
    blitz: new Map(),
    bullet: new Map(),
  };

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const mode = String(row?.tc || "").toLowerCase();
    const rowUsername = String(row?.username || "").trim();
    const rating = Number(row?.rating);
    const peak = Number(row?.peak);
    const rd = Number(row?.rd);
    const games = Number(row?.games);
    const rank = Number(row?.rank);
    if (!modeOptions.includes(mode)) return;
    if (!rowUsername) return;
    if (!Number.isFinite(rating) || !Number.isFinite(rd) || !Number.isFinite(games)) return;

    snapshotsByMode[mode].set(rowUsername.toLowerCase(), {
      currentRating: rating,
      peakRating: Number.isFinite(peak) ? peak : null,
      currentRd: rd,
      gamesPlayed: games,
      rank: Number.isFinite(rank) ? rank : null,
    });
  });

  return snapshotsByMode;
};

const loadCurrentRatingsSnapshot = async (username) => {
  const normalizedUsername = String(username || "").trim().toLowerCase();
  if (!normalizedUsername) {
    return {
      blitz: new Map(),
      bullet: new Map(),
    };
  }

  const rows = await fetchPlayerRatingsRows({ username: normalizedUsername });
  return parseCurrentRatingsFromRows(rows);
};

const formatRating = (value) => (Number.isFinite(value) ? value.toFixed(1) : "—");

export const PlayerProfilePage = ({ username }) => {
  const [ratingsSnapshotByMode, setRatingsSnapshotByMode] = useState({
    blitz: new Map(),
    bullet: new Map(),
  });
  const [monthRanks, setMonthRanks] = useState([]);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const [ranks, snapshots] = await Promise.all([
          loadMonthRanksFromLb(username),
          loadCurrentRatingsSnapshot(username),
        ]);
        setMonthRanks(ranks);
        setRatingsSnapshotByMode(snapshots);
      } catch {
        setMonthRanks([]);
        setRatingsSnapshotByMode({ blitz: new Map(), bullet: new Map() });
      }
    };

    loadProfile();
  }, [username]);

  const usernameLower = String(username || "").toLowerCase();
  const blitzSnapshot = ratingsSnapshotByMode.blitz.get(usernameLower);
  const bulletSnapshot = ratingsSnapshotByMode.bullet.get(usernameLower);

  const recentRanks = useMemo(() => {
    return [...monthRanks]
      .sort((a, b) => b.monthDate.getTime() - a.monthDate.getTime())
      .slice(0, 10);
  }, [monthRanks]);

  return (
    <div className="rankingsPage">
      <div className="panel rankingsPanel">
        <h1>@{username}</h1>
        <p>Profile snapshot from leaderboard and player ratings tables.</p>

        <div className="controls rankingsControls">
          <Link to="/@/$username/match-history" params={{ username }} className="linkButton">
            View match history
          </Link>
        </div>

        <div className="playerOverviewCards">
          <article className="overviewCard">
            <h2>Blitz</h2>
            <p>
              Current: <strong>{formatRating(blitzSnapshot?.currentRating)}</strong>
            </p>
            <p>
              Peak: <strong>{formatRating(blitzSnapshot?.peakRating)}</strong>
            </p>
            <p>
              RD: <strong>{formatRating(blitzSnapshot?.currentRd)}</strong>
            </p>
            <p>
              Games: <strong>{blitzSnapshot?.gamesPlayed ?? 0}</strong>
            </p>
          </article>
          <article className="overviewCard">
            <h2>Bullet</h2>
            <p>
              Current: <strong>{formatRating(bulletSnapshot?.currentRating)}</strong>
            </p>
            <p>
              Peak: <strong>{formatRating(bulletSnapshot?.peakRating)}</strong>
            </p>
            <p>
              RD: <strong>{formatRating(bulletSnapshot?.currentRd)}</strong>
            </p>
            <p>
              Games: <strong>{bulletSnapshot?.gamesPlayed ?? 0}</strong>
            </p>
          </article>
        </div>

        <h2>Recent Ranks</h2>
        <div className="rankingsTableWrap">
          <table className="rankingsTable">
            <thead>
              <tr>
                <th>Month</th>
                <th>Mode</th>
                <th>Rank</th>
                <th>Rating</th>
              </tr>
            </thead>
            <tbody>
              {recentRanks.map((entry) => (
                <tr key={`${entry.monthKey}-${entry.mode}`}>
                  <td>{entry.monthLabel}</td>
                  <td>{entry.mode}</td>
                  <td>#{entry.rank}</td>
                  <td>{formatRating(entry.rating)}</td>
                </tr>
              ))}
              {recentRanks.length === 0 ? (
                <tr>
                  <td colSpan={4} className="emptyRankings">
                    No profile data found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
