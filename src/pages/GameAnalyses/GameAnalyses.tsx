import "./GameAnalyses.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminGameAnalyses, GAME_ANALYSIS_ADMIN_USERNAME } from "../../lib/gameAnalysis/admin";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { GameAnalysisColumnLabels, GameAnalysisRow } from "./GameAnalysisList";

export const GameAnalysesPage = () => {
  const { isLoading: authLoading, user } = useAuth();
  const isAdmin = normalizeUsername(user?.username) === GAME_ANALYSIS_ADMIN_USERNAME;
  const query = useQuery({
    queryKey: ["admin-game-analyses"],
    queryFn: fetchAdminGameAnalyses,
    enabled: isAdmin,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    staleTime: 0,
  });

  if (authLoading || (isAdmin && query.isPending)) return <RouteLoadingFallback />;

  return (
    <div className="page gameAnalysesPage">
      <Seo title="Game analyses" description="Pending and recently completed game analyses." />
      <section className="panel gameAnalysesPanel">
        <header className="gameAnalysesHeader">
          <h1>Game analyses</h1>
          {isAdmin ? (
            <div className="gameAnalysesHeaderStatus" aria-live="polite">
              <span className="gameAnalysesStatusBadge">
                {query.data?.pendingTotal ?? 0} pending
              </span>
              <Link
                className="gameAnalysesStatusBadge gameAnalysesStatusLink"
                to="/admin/game-analyses/finished"
                title="Finished in the past 7 days"
              >
                {query.data?.finishedLast7Days ?? 0} finished
              </Link>
              {query.data?.generatedAt ? (
                <time dateTime={query.data.generatedAt}>
                  {query.isFetching
                    ? "Refreshing…"
                    : `Synced ${formatLocalDateTime(query.data.generatedAt)}`}
                </time>
              ) : null}
            </div>
          ) : null}
        </header>

        {!isAdmin ? <p className="gameAnalysesState">This page is restricted.</p> : null}
        {query.error ? (
          <p className="gameAnalysesError" role="alert">
            Unable to load game analyses.
          </p>
        ) : null}

        {isAdmin && query.data ? (
          <>
            <section className="gameAnalysesSection" aria-labelledby="pending-game-analyses">
              <h2 id="pending-game-analyses">Pending</h2>
              {query.data.pending.length ? (
                <>
                  <GameAnalysisColumnLabels />
                  <ol className="gameAnalysesList">
                    {query.data.pending.map((analysis) => (
                      <GameAnalysisRow key={analysis.gameId} analysis={analysis} kind="pending" />
                    ))}
                  </ol>
                  {query.data.pendingTotal > query.data.pending.length ? (
                    <p className="gameAnalysesState">
                      Showing the {query.data.pending.length} oldest pending analyses.
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="gameAnalysesState">No pending analyses.</p>
              )}
            </section>

            {query.data.failed.length ? (
              <section className="gameAnalysesSection" aria-labelledby="failed-game-analyses">
                <h2 id="failed-game-analyses">Failed</h2>
                <GameAnalysisColumnLabels />
                <ol className="gameAnalysesList">
                  {query.data.failed.map((analysis) => (
                    <GameAnalysisRow key={analysis.gameId} analysis={analysis} kind="failed" />
                  ))}
                </ol>
              </section>
            ) : null}

            <section className="gameAnalysesSection" aria-labelledby="completed-game-analyses">
              <h2 id="completed-game-analyses">Recently completed</h2>
              {query.data.completed.length ? (
                <>
                  <GameAnalysisColumnLabels completed />
                  <ol className="gameAnalysesList">
                    {query.data.completed.map((analysis) => (
                      <GameAnalysisRow key={analysis.gameId} analysis={analysis} kind="completed" />
                    ))}
                  </ol>
                </>
              ) : (
                <p className="gameAnalysesState">No completed analyses.</p>
              )}
            </section>
          </>
        ) : null}
      </section>
    </div>
  );
};
