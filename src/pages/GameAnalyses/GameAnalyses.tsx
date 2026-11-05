import "./GameAnalyses.css";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { fetchAdminGameAnalyses, GAME_ANALYSIS_ADMIN_USERNAME } from "../../lib/gameAnalysis/admin";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";
import { GameAnalysisColumnLabels, GameAnalysisRow } from "./GameAnalysisList";

const PENDING_PAGE_SIZE = 50;

export const GameAnalysesPage = () => {
  const { isLoading: authLoading, user } = useAuth();
  const isAdmin = normalizeUsername(user?.username) === GAME_ANALYSIS_ADMIN_USERNAME;
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const page = typeof search.page === "number" ? search.page : 1;
  const query = useQuery({
    queryKey: ["admin-game-analyses", page],
    queryFn: () => fetchAdminGameAnalyses(page, PENDING_PAGE_SIZE),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: "always",
    staleTime: 0,
  });

  useEffect(() => {
    if (!query.data || page <= query.data.pendingTotalPages) return;
    void navigate({
      to: "/admin/game-analyses",
      search: query.data.pendingTotalPages === 1 ? {} : { page: query.data.pendingTotalPages },
      replace: true,
    });
  }, [navigate, page, query.data]);

  if (authLoading || (isAdmin && query.isPending)) return <RouteLoadingFallback />;

  const changePage = (nextPage: number): void => {
    void navigate({
      to: "/admin/game-analyses",
      search: nextPage === 1 ? {} : { page: nextPage },
    });
  };

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
              <div className="gameAnalysesSectionHeader">
                <h2 id="pending-game-analyses">Pending</h2>
                {query.data.pending.length ? (
                  <div className="gameAnalysesPagination gameAnalysesPaginationTop">
                    <PaginationRow
                      currentPage={page}
                      totalPages={query.data.pendingTotalPages}
                      onPageChange={changePage}
                      disabled={query.isFetching}
                      ariaLabel="Pending game analyses pages"
                      navigationVariant="arrows"
                    />
                  </div>
                ) : null}
              </div>
              {query.data.pending.length ? (
                <>
                  <GameAnalysisColumnLabels />
                  <ol className="gameAnalysesList" start={(page - 1) * PENDING_PAGE_SIZE + 1}>
                    {query.data.pending.map((analysis) => (
                      <GameAnalysisRow key={analysis.gameId} analysis={analysis} kind="pending" />
                    ))}
                  </ol>
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
