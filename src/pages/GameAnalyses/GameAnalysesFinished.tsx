import "./GameAnalyses.css";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";

import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { RouteLoadingFallback } from "../../components/RouteLoadingFallback/RouteLoadingFallback";
import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  fetchFinishedGameAnalyses,
  GAME_ANALYSIS_ADMIN_USERNAME,
} from "../../lib/gameAnalysis/admin";
import { normalizeUsername } from "../../utils/playerNames";
import { GameAnalysisColumnLabels, GameAnalysisRow } from "./GameAnalysisList";

const PAGE_SIZE = 50;

export const GameAnalysesFinishedPage = () => {
  const { isLoading: authLoading, user } = useAuth();
  const isAdmin = normalizeUsername(user?.username) === GAME_ANALYSIS_ADMIN_USERNAME;
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const page = typeof search.page === "number" ? search.page : 1;
  const query = useQuery({
    queryKey: ["admin-game-analyses-finished", page],
    queryFn: () => fetchFinishedGameAnalyses(page, PAGE_SIZE),
    enabled: isAdmin,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    refetchOnWindowFocus: "always",
  });

  useEffect(() => {
    if (!query.data || page <= query.data.totalPages) return;
    void navigate({
      to: "/admin/game-analyses/finished",
      search: query.data.totalPages === 1 ? {} : { page: query.data.totalPages },
      replace: true,
    });
  }, [navigate, page, query.data]);

  if (authLoading || (isAdmin && query.isPending)) return <RouteLoadingFallback />;

  const changePage = (nextPage: number): void => {
    void navigate({
      to: "/admin/game-analyses/finished",
      search: nextPage === 1 ? {} : { page: nextPage },
    });
  };

  return (
    <div className="page gameAnalysesPage">
      <Seo
        title="Finished game analyses"
        description="Finished game analyses ordered by completion time."
      />
      <section className="panel gameAnalysesPanel">
        <header className="gameAnalysesHeader gameAnalysesFinishedHeader">
          <div>
            <Link className="gameAnalysesBackLink" to="/admin/game-analyses">
              Back to queue
            </Link>
            <h1>Finished game analyses</h1>
          </div>
          {isAdmin && query.data ? (
            <span className="gameAnalysesStatusBadge">
              {query.data.total.toLocaleString()} total
            </span>
          ) : null}
        </header>

        {!isAdmin ? <p className="gameAnalysesState">This page is restricted.</p> : null}
        {query.error ? (
          <p className="gameAnalysesError" role="alert">
            Unable to load finished game analyses.
          </p>
        ) : null}

        {isAdmin && query.data ? (
          <section className="gameAnalysesSection" aria-label="Finished game analyses">
            {query.data.items.length ? (
              <>
                <GameAnalysisColumnLabels completed />
                <ol className="gameAnalysesList" start={(page - 1) * PAGE_SIZE + 1}>
                  {query.data.items.map((analysis) => (
                    <GameAnalysisRow key={analysis.gameId} analysis={analysis} kind="completed" />
                  ))}
                </ol>
                <div className="gameAnalysesPagination">
                  <PaginationRow
                    currentPage={page}
                    totalPages={query.data.totalPages}
                    onPageChange={changePage}
                    disabled={query.isFetching}
                    ariaLabel="Finished game analyses pages"
                  />
                </div>
              </>
            ) : (
              <p className="gameAnalysesState">No finished analyses.</p>
            )}
          </section>
        ) : null}
      </section>
    </div>
  );
};
