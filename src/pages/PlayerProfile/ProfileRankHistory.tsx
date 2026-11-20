import { modeLabels } from "../../constants/matches";
import type { RankHistoryMode } from "../../features/profile/favoriteOpponents";
import {
  type ProfileHistoryTab,
  type RankHistoryView,
} from "../../features/profile/profileNavigation";
import {
  isTrophyCaseSort,
  ProfileTrophyCaseCard,
  type TrophyCaseSort,
} from "../../features/profile/profileTrophies";
import type { useMonthRanks } from "../../hooks/usePlayerProfileData";
import { buildRankingsLocation } from "../../hooks/usePlayerProfileData";
import { isOneOf } from "../../utils/arrays";

type RankHistorySort = "rank" | "players" | "rating" | "games";
type SortDirection = "asc" | "desc";

import type { Mode } from "../../constants/matches";
import type { ProfileTrophy } from "../../features/profile/profileTrophies";

export const ProfileRankHistory = ({
  profileHistoryTab,
  rankHistoryView,
  handleRankHistoryViewChange,
  rankHistoryMode,
  profileModeOptions,
  setRankHistoryMode,
  rankHistoryModeOptions,
  trophyCaseSort,
  setTrophyCaseSort,
  rankHistoryRows,
  trophyCaseTrophies,
  rankHistorySort,
  rankHistorySortDirection,
  handleRankHistorySort,
}: {
  profileHistoryTab: ProfileHistoryTab;
  rankHistoryView: RankHistoryView;
  handleRankHistoryViewChange: (view: RankHistoryView) => void;
  rankHistoryMode: RankHistoryMode;
  profileModeOptions: readonly Mode[];
  setRankHistoryMode: (mode: RankHistoryMode) => void;
  rankHistoryModeOptions: readonly RankHistoryMode[];
  trophyCaseSort: TrophyCaseSort;
  setTrophyCaseSort: (sort: TrophyCaseSort) => void;
  rankHistoryRows: Array<ReturnType<typeof useMonthRanks>[number] & { playerCount: number | null }>;
  trophyCaseTrophies: ProfileTrophy[];
  rankHistorySort: RankHistorySort | null;
  rankHistorySortDirection: SortDirection;
  handleRankHistorySort: (sort: RankHistorySort) => void;
}) => (
  <section
    id="profile-rank-history-panel"
    className="profileHistorySection"
    role="tabpanel"
    aria-labelledby="profile-rank-history-tab"
    hidden={profileHistoryTab !== "ranks"}
  >
    {profileHistoryTab === "ranks" ? (
      <>
        <div className="rankingsMeta profileHistoryMeta">
          <div className="profileHistoryTitleControl">
            <label htmlFor="profile-rank-history-view-select">
              <span>View</span>
              <select
                id="profile-rank-history-view-select"
                aria-label="Rank history view"
                value={rankHistoryView}
                onChange={(event) => {
                  const nextView = event.target.value;
                  if (nextView === "history" || nextView === "trophies") {
                    handleRankHistoryViewChange(nextView);
                  }
                }}
              >
                <option value="history">History</option>
                <option value="trophies">Trophy Case</option>
              </select>
            </label>
            {rankHistoryView === "history" ? (
              <label htmlFor="profile-rank-history-mode-select">
                <span>Mode</span>
                <select
                  id="profile-rank-history-mode-select"
                  aria-label="Rank history mode"
                  value={rankHistoryMode}
                  onChange={(event) => {
                    const v = event.target.value;
                    if (v === "all" || isOneOf(profileModeOptions, v)) {
                      setRankHistoryMode(v);
                    }
                  }}
                >
                  {rankHistoryModeOptions.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === "all" ? "All" : (modeLabels[mode] ?? mode)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label htmlFor="profile-trophy-case-sort-select">
                <span>Sort</span>
                <select
                  id="profile-trophy-case-sort-select"
                  aria-label="Trophy case sort"
                  value={trophyCaseSort}
                  onChange={(event) => {
                    const nextSort = event.target.value;
                    if (isTrophyCaseSort(nextSort)) {
                      setTrophyCaseSort(nextSort);
                    }
                  }}
                >
                  <option value="prestige">Prestige</option>
                  <option value="date">Date</option>
                </select>
              </label>
            )}
          </div>
          <span>
            {rankHistoryView === "history"
              ? `${rankHistoryRows.length} months`
              : `${trophyCaseTrophies.length} trophies`}
          </span>
        </div>

        {rankHistoryView === "history" ? (
          <div className="rankingsTableWrap profileRankHistoryTableWrap">
            <table className="rankingsTable profileRankHistoryTable">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Mode</th>
                  {(
                    [
                      ["rank", "Rank"],
                      ["players", "Players"],
                      ["rating", "Rating"],
                    ] as const
                  ).map(([column, label]) => (
                    <th
                      key={column}
                      aria-sort={
                        rankHistorySort === column
                          ? rankHistorySortDirection === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                    >
                      <button
                        className="profileRankHistorySortButton"
                        type="button"
                        onClick={() => handleRankHistorySort(column)}
                      >
                        {label}
                        <span aria-hidden="true">
                          {rankHistorySort === column
                            ? rankHistorySortDirection === "asc"
                              ? "↑"
                              : "↓"
                            : ""}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th>RD</th>
                  <th
                    aria-sort={
                      rankHistorySort === "games"
                        ? rankHistorySortDirection === "asc"
                          ? "ascending"
                          : "descending"
                        : "none"
                    }
                  >
                    <button
                      className="profileRankHistorySortButton"
                      type="button"
                      onClick={() => handleRankHistorySort("games")}
                    >
                      Games
                      <span aria-hidden="true">
                        {rankHistorySort === "games"
                          ? rankHistorySortDirection === "asc"
                            ? "↑"
                            : "↓"
                          : ""}
                      </span>
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rankHistoryRows.map((monthRank) => (
                  <tr key={`rank-history-${monthRank.mode}-${monthRank.monthKey}`}>
                    <td>
                      <a
                        className="rankingLink"
                        href={buildRankingsLocation(monthRank.monthKey, monthRank.mode)}
                      >
                        {monthRank.monthLabel}
                      </a>
                    </td>
                    <td>{modeLabels[monthRank.mode] ?? monthRank.mode}</td>
                    <td>#{monthRank.rank}</td>
                    <td>{monthRank.playerCount ?? "..."}</td>
                    <td>{monthRank.rating ?? "—"}</td>
                    <td>{monthRank.rd ?? "—"}</td>
                    <td>{monthRank.games ?? "—"}</td>
                  </tr>
                ))}
                {rankHistoryRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="emptyRankings">
                      No rank history available.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : trophyCaseTrophies.length ? (
          <div className="profileTrophyCaseGrid" aria-label="Trophy case">
            {trophyCaseTrophies.map((trophy) => (
              <ProfileTrophyCaseCard key={`case-${trophy.key}`} trophy={trophy} />
            ))}
          </div>
        ) : (
          <div className="emptyRankings">No ranking or championship trophies yet.</div>
        )}
      </>
    ) : null}
  </section>
);
