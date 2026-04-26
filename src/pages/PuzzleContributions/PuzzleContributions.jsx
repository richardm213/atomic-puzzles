import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PaginationRow } from "../../components/PaginationRow/PaginationRow";
import { Seo } from "../../components/Seo/Seo";
import { loadPuzzleLibrary } from "../../lib/puzzles/puzzleLibrary";
import { normalizePuzzleEventName } from "../../lib/puzzles/puzzleSets";
import { fetchProfileAliasRow } from "../../lib/supabase/supabaseAliases";
import { isRegisteredSiteUser } from "../../lib/supabase/supabaseUsers";
import { normalizeUsername } from "../../utils/playerNames";
import "./PuzzleContributions.css";

const PAGE_SIZE = 24;

const comparePuzzles = (left, right) => {
  const leftId = Number(left?.puzzleId ?? 0);
  const rightId = Number(right?.puzzleId ?? 0);
  return rightId - leftId;
};

const buildAuthorSet = (profileAliasEntry, fallbackUsername) => {
  const canonicalUsername = profileAliasEntry?.username ?? fallbackUsername;
  const aliases = Array.isArray(profileAliasEntry?.aliases) ? profileAliasEntry.aliases : [];

  return new Set([canonicalUsername, ...aliases].map(normalizeUsername).filter(Boolean));
};

export const PuzzleContributionsPage = ({ username = "" }) => {
  const normalizedUsername = useMemo(() => normalizeUsername(username), [username]);
  const [profileAliasEntry, setProfileAliasEntry] = useState(null);
  const [puzzles, setPuzzles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAccessCheckLoading, setIsAccessCheckLoading] = useState(false);
  const [canViewContributions, setCanViewContributions] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    setCurrentPage(1);
  }, [normalizedUsername]);

  useEffect(() => {
    let isCurrent = true;

    const verifyAccess = async () => {
      if (!normalizedUsername) {
        setCanViewContributions(false);
        return;
      }

      setIsAccessCheckLoading(true);

      try {
        const isRegistered = await isRegisteredSiteUser(normalizedUsername);
        if (!isCurrent) return;
        setCanViewContributions(isRegistered);
      } catch (loadError) {
        if (!isCurrent) return;
        setCanViewContributions(false);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to verify puzzle contribution access.",
        );
      } finally {
        if (isCurrent) setIsAccessCheckLoading(false);
      }
    };

    verifyAccess();

    return () => {
      isCurrent = false;
    };
  }, [normalizedUsername]);

  useEffect(() => {
    let isCurrent = true;

    const loadPageData = async () => {
      if (!normalizedUsername || !canViewContributions) {
        setProfileAliasEntry(null);
        setPuzzles([]);
        return;
      }

      setIsLoading(true);
      setError("");

      try {
        const [nextAliasEntry, loadedPuzzles] = await Promise.all([
          fetchProfileAliasRow(normalizedUsername),
          loadPuzzleLibrary(),
        ]);
        if (!isCurrent) return;

        setProfileAliasEntry(nextAliasEntry);
        setPuzzles(Array.isArray(loadedPuzzles) ? loadedPuzzles : []);
      } catch (loadError) {
        if (!isCurrent) return;
        setProfileAliasEntry(null);
        setPuzzles([]);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load puzzle contributions.",
        );
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadPageData();

    return () => {
      isCurrent = false;
    };
  }, [canViewContributions, normalizedUsername]);

  const canonicalUsername = profileAliasEntry?.username ?? normalizedUsername;
  const authoredUsernames = useMemo(
    () => buildAuthorSet(profileAliasEntry, normalizedUsername),
    [normalizedUsername, profileAliasEntry],
  );
  const authoredPuzzles = useMemo(
    () =>
      puzzles
        .filter((puzzle) => authoredUsernames.has(normalizeUsername(puzzle?.author)))
        .sort(comparePuzzles),
    [authoredUsernames, puzzles],
  );
  const totalPages = Math.max(1, Math.ceil(authoredPuzzles.length / PAGE_SIZE));

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const pagedPuzzles = useMemo(() => {
    const startIndex = (currentPage - 1) * PAGE_SIZE;
    return authoredPuzzles.slice(startIndex, startIndex + PAGE_SIZE);
  }, [authoredPuzzles, currentPage]);
  const eventCount = useMemo(
    () =>
      new Set(authoredPuzzles.map((puzzle) => normalizePuzzleEventName(puzzle?.event))).size,
    [authoredPuzzles],
  );
  const firstPuzzleId = authoredPuzzles[authoredPuzzles.length - 1]?.puzzleId ?? null;
  const latestPuzzleId = authoredPuzzles[0]?.puzzleId ?? null;
  const seoPath = `/@/${encodeURIComponent(canonicalUsername)}/contributions`;
  const isCheckingAccess = isAccessCheckLoading;
  const shouldHideContributions = !error && !isCheckingAccess && !canViewContributions;
  const unavailableMessage = `${normalizedUsername} does not have a registered site account yet, so puzzle contributions are hidden.`;

  return (
    <div className="puzzleContributionsPage">
      <Seo
        title={`${canonicalUsername} Puzzle Contributions`}
        description={`Browse the atomic chess puzzles contributed by ${canonicalUsername}.`}
        path={seoPath}
      />
      <div className="puzzleContributionsShell">
        <header className="puzzleContributionsHero">
          <div className="puzzleContributionsHeroCopy">
            <p className="puzzleContributionsEyebrow">Atomic tactics</p>
            <h1>Puzzle contributions</h1>
            <p className="puzzleContributionsIntro">
              Browse every puzzle in the library credited to {canonicalUsername}.
            </p>
          </div>
          <div className="puzzleContributionsHeroActions">
            <div className="puzzleContributionsIdentityCard">
              <span className="puzzleContributionsMiniLabel">Author</span>
              <strong>{canonicalUsername}</strong>
              {authoredUsernames.size > 1 ? (
                <span>
                  Includes {authoredUsernames.size - 1} alias
                  {authoredUsernames.size - 1 === 1 ? "" : "es"}
                </span>
              ) : null}
            </div>
            <div className="puzzleContributionsHeroLinks">
              <Link className="puzzleContributionsBackLink" to="/@/$username" params={{ username: canonicalUsername }}>
                Back to profile
              </Link>
              <Link className="puzzleContributionsBackLink" to="/solve/sets">
                Puzzle sets
              </Link>
            </div>
          </div>
        </header>

        {isCheckingAccess ? (
          <div className="puzzleContributionsStateCard">Checking puzzle contribution access…</div>
        ) : null}
        {error ? <div className="puzzleContributionsStateCard">{error}</div> : null}
        {shouldHideContributions ? (
          <div className="puzzleContributionsStateCard">
            <p>{unavailableMessage}</p>
            <Link
              className="puzzleContributionsBackLink"
              to="/@/$username"
              params={{ username: normalizedUsername }}
            >
              Back to profile
            </Link>
          </div>
        ) : null}

        {!error && !isCheckingAccess && canViewContributions ? (
          <>
            <section className="puzzleContributionsStats" aria-label="Puzzle contribution totals">
              <div className="puzzleContributionsStatCard">
                <span className="puzzleContributionsMiniLabel">Total puzzles</span>
                <strong>{isLoading ? "…" : authoredPuzzles.length}</strong>
                <span>Published in the puzzle library</span>
              </div>
              <div className="puzzleContributionsStatCard">
                <span className="puzzleContributionsMiniLabel">Events</span>
                <strong>{isLoading ? "…" : eventCount}</strong>
                <span>Distinct puzzle sets represented</span>
              </div>
              <div className="puzzleContributionsStatCard">
                <span className="puzzleContributionsMiniLabel">Puzzle range</span>
                <strong>
                  {isLoading
                    ? "…"
                    : latestPuzzleId && firstPuzzleId
                      ? `#${firstPuzzleId} - #${latestPuzzleId}`
                      : "—"}
                </strong>
                <span>Earliest to latest library id</span>
              </div>
            </section>

            <section className="puzzleContributionsListSection">
              <div className="puzzleContributionsListHeader">
                <div>
                  <p className="puzzleContributionsMiniLabel">Library</p>
                  <h2>Authored puzzles</h2>
                </div>
                <PaginationRow
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  formatLabel={(current, total) => `Page ${current} / ${total}`}
                  disabled={isLoading || authoredPuzzles.length === 0}
                />
              </div>

              {isLoading ? (
                <div className="puzzleContributionsStateCard">Loading puzzle contributions…</div>
              ) : pagedPuzzles.length > 0 ? (
                <div className="puzzleContributionsList" role="list" aria-label="Puzzle contributions">
                  {pagedPuzzles.map((puzzle) => {
                    const puzzleId = String(puzzle?.puzzleId ?? "").trim();
                    const event = normalizePuzzleEventName(puzzle?.event);
                    const opening = String(puzzle?.opening ?? "").trim();
                    const author = String(puzzle?.author ?? "").trim() || canonicalUsername;

                    return (
                      <article key={puzzleId} className="puzzleContributionRow">
                        <div className="puzzleContributionPrimary">
                          <span className="puzzleContributionsMiniLabel">Puzzle</span>
                          <Link
                            className="puzzleContributionLink"
                            to="/solve/$puzzleId"
                            params={{ puzzleId }}
                          >
                            Puzzle {puzzleId}
                          </Link>
                          <div className="puzzleContributionMeta">
                            <span>{author}</span>
                            <span>{event}</span>
                            {opening ? <span>{opening}</span> : null}
                          </div>
                        </div>
                        <Link
                          className="puzzleContributionOpenLink"
                          to="/solve/$puzzleId"
                          params={{ puzzleId }}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open puzzle
                        </Link>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="puzzleContributionsStateCard">
                  <p>No puzzle contributions are recorded for {canonicalUsername} yet.</p>
                  <Link className="puzzleContributionsBackLink" to="/@/$username" params={{ username: canonicalUsername }}>
                    Back to profile
                  </Link>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
};
