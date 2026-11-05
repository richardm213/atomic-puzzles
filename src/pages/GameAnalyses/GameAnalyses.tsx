import "./GameAnalyses.css";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { type AdminGameAnalysis, fetchAdminGameAnalyses } from "../../lib/gameAnalysis/admin";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

const GAME_ANALYSIS_ADMIN = "seaside_tiramisu";

const AnalysisRow = ({
  analysis,
  completed = false,
}: {
  analysis: AdminGameAnalysis;
  completed?: boolean;
}) => {
  const progress = analysis.totalMoves
    ? Math.round((analysis.completedMoves / analysis.totalMoves) * 100)
    : 100;
  return (
    <li className="gameAnalysesRow">
      <div className="gameAnalysesGame">
        <span className="gameAnalysesMobileLabel">Game</span>
        <Link to="/game/$gameId" params={{ gameId: analysis.gameId }}>
          {analysis.gameId}
        </Link>
      </div>
      <div className="gameAnalysesProgress">
        <span className="gameAnalysesMobileLabel">Progress</span>
        <div>
          <span>
            {analysis.completedMoves} / {analysis.totalMoves}
          </span>
          {!completed ? (
            <progress value={analysis.completedMoves} max={Math.max(1, analysis.totalMoves)}>
              {progress}%
            </progress>
          ) : null}
        </div>
      </div>
      <div className="gameAnalysesRequester">
        <span className="gameAnalysesMobileLabel">Requester</span>
        <PlayerLink username={analysis.requestedBy}>{analysis.requestedBy}</PlayerLink>
      </div>
      <div className="gameAnalysesTime">
        <span className="gameAnalysesMobileLabel">{completed ? "Completed" : "Requested"}</span>
        <time
          dateTime={completed ? (analysis.completedAt ?? analysis.createdAt) : analysis.createdAt}
        >
          {formatLocalDateTime(
            completed ? (analysis.completedAt ?? analysis.createdAt) : analysis.createdAt,
          )}
        </time>
      </div>
    </li>
  );
};

const ColumnLabels = ({ completed = false }: { completed?: boolean }) => (
  <div className="gameAnalysesColumns" aria-hidden="true">
    <span>Game</span>
    <span>Progress</span>
    <span>Requester</span>
    <span>{completed ? "Completed" : "Requested"}</span>
  </div>
);

export const GameAnalysesPage = () => {
  const { isLoading: authLoading, user } = useAuth();
  const isAdmin = normalizeUsername(user?.username) === GAME_ANALYSIS_ADMIN;
  const query = useQuery({
    queryKey: ["admin-game-analyses"],
    queryFn: fetchAdminGameAnalyses,
    enabled: isAdmin,
    refetchInterval: 10_000,
  });

  if (authLoading || (isAdmin && query.isPending)) return <RouteLoadingFallback />;

  return (
    <div className="page gameAnalysesPage">
      <Seo title="Game analyses" description="Pending and recently completed game analyses." />
      <section className="panel gameAnalysesPanel">
        <header className="gameAnalysesHeader">
          <h1>Game analyses</h1>
          {isAdmin ? <span>{query.data?.pending.length ?? 0} pending</span> : null}
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
                  <ColumnLabels />
                  <ol className="gameAnalysesList">
                    {query.data.pending.map((analysis) => (
                      <AnalysisRow key={analysis.gameId} analysis={analysis} />
                    ))}
                  </ol>
                </>
              ) : (
                <p className="gameAnalysesState">No pending analyses.</p>
              )}
            </section>

            <section className="gameAnalysesSection" aria-labelledby="completed-game-analyses">
              <h2 id="completed-game-analyses">Recently completed</h2>
              {query.data.completed.length ? (
                <>
                  <ColumnLabels completed />
                  <ol className="gameAnalysesList">
                    {query.data.completed.map((analysis) => (
                      <AnalysisRow key={analysis.gameId} analysis={analysis} completed />
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
