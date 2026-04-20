import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Seo } from "../../components/Seo/Seo";
import { loadPuzzleLibrary } from "../../lib/puzzleLibrary";
import { groupPuzzlesByEvent } from "../../lib/puzzleSets";
import "./PuzzleSets.css";

const readEventKeyFromHash = () => {
  if (typeof window === "undefined") return "";
  return window.location.hash.replace(/^#/, "").trim();
};

export const PuzzleSetsPage = () => {
  const [puzzles, setPuzzles] = useState([]);
  const [selectedEventKey, setSelectedEventKey] = useState(() => readEventKeyFromHash());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedSetSectionRef = useRef(null);
  const shouldScrollToSelectionRef = useRef(false);

  useEffect(() => {
    let isCurrent = true;

    const loadPuzzles = async () => {
      setIsLoading(true);
      setError("");

      try {
        const loadedPuzzles = await loadPuzzleLibrary();
        if (!isCurrent) return;
        setPuzzles(Array.isArray(loadedPuzzles) ? loadedPuzzles : []);
      } catch (loadError) {
        if (!isCurrent) return;
        setPuzzles([]);
        setError(loadError instanceof Error ? loadError.message : "Failed to load puzzle sets.");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    };

    loadPuzzles();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const handleHashChange = () => {
      setSelectedEventKey(readEventKeyFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  const puzzleGroups = useMemo(() => groupPuzzlesByEvent(puzzles), [puzzles]);
  const selectedGroup = useMemo(() => {
    if (!puzzleGroups.length) return null;

    const fromHash = puzzleGroups.find((group) => group.eventKey === selectedEventKey);
    if (fromHash) return fromHash;

    return null;
  }, [puzzleGroups, selectedEventKey]);

  const totalPuzzleCount = useMemo(
    () => puzzleGroups.reduce((count, group) => count + group.puzzles.length, 0),
    [puzzleGroups],
  );
  const totalSetCount = puzzleGroups.length;

  const handleSetSelection = (eventKey) => {
    shouldScrollToSelectionRef.current = true;
    setSelectedEventKey(eventKey);
  };

  useEffect(() => {
    if (!selectedGroup || !shouldScrollToSelectionRef.current) return;

    selectedSetSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    shouldScrollToSelectionRef.current = false;
  }, [selectedGroup]);

  return (
    <div className="puzzleSetsPage">
      <Seo
        title="Puzzle Sets"
        description="Browse atomic puzzle events and open every puzzle from a selected set."
        path="/solve/sets"
      />
      <div className="puzzleSetsShell">
        <header className="puzzleSetsHero">
          <div className="puzzleSetsHeroCopy">
            <p className="puzzleSetsEyebrow">Atomic tactics</p>
            <h1>Puzzle sets</h1>
            <p className="puzzleSetsIntro">
              Browse every event in the puzzle library, then open the full set to jump straight into
              any position.
            </p>
          </div>
          <div className="puzzleSetsHeroActions">
            <div className="puzzleSetsSummaryCard">
              <span className="puzzleSetsSummaryLabel">Library coverage</span>
              <strong>{totalSetCount} sets</strong>
              <span>{totalPuzzleCount} puzzles</span>
            </div>
            <Link className="puzzleSetsBackLink" to="/dashboard">
              Back to dashboard
            </Link>
          </div>
        </header>

        {error ? <div className="puzzleSetsStateCard">{error}</div> : null}

        <section className="puzzleSetsSection">
          <div className="puzzleSetsSectionHeader">
            <div>
              <p className="puzzleSetsSectionEyebrow">Events</p>
              <h2>Choose a puzzle set</h2>
              <p className="puzzleSetsSectionIntro">
                Select a card to reveal every puzzle from that event.
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="puzzleSetsStateCard">Loading puzzle sets…</div>
          ) : puzzleGroups.length > 0 ? (
            <div className="puzzleSetGrid" role="list" aria-label="Puzzle events">
              {puzzleGroups.map((group) => {
                const firstPuzzleId = group.puzzles[0]?.puzzleId ?? "—";
                const lastPuzzleId = group.puzzles[group.puzzles.length - 1]?.puzzleId ?? "—";
                const isSelected = selectedGroup?.eventKey === group.eventKey;

                return (
                  <button
                    key={group.eventKey}
                    type="button"
                    className={`puzzleSetCard ${isSelected ? "selected" : ""}`}
                    onClick={() => handleSetSelection(group.eventKey)}
                  >
                    <span className="puzzleSetsMiniLabel">Event</span>
                    <strong>{group.event}</strong>
                    <div className="puzzleSetCardMeta">
                      <span>{group.puzzles.length} puzzles</span>
                      <span>
                        #{firstPuzzleId}
                        {firstPuzzleId !== lastPuzzleId ? `-${lastPuzzleId}` : ""}
                      </span>
                    </div>
                    <span className="puzzleSetCardAuthors">
                      {group.authors.length} author{group.authors.length === 1 ? "" : "s"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="puzzleSetsStateCard">No puzzle sets are available yet.</div>
          )}
        </section>

        <section className="puzzleSetsSection puzzleSetsSelectedSection" ref={selectedSetSectionRef}>
          <div className="puzzleSetsSectionHeader">
            <div>
              <p className="puzzleSetsSectionEyebrow">Selected set</p>
              <h2>{selectedGroup ? selectedGroup.event : "Pick an event to view its puzzles"}</h2>
              <p className="puzzleSetsSectionIntro">
                {selectedGroup
                  ? `Open any puzzle from ${selectedGroup.event}.`
                  : "The puzzle list will appear here after you choose a set."}
              </p>
            </div>
          </div>

          {selectedGroup ? (
            <div className="puzzleSetPuzzleList" role="list" aria-label={`${selectedGroup.event} puzzles`}>
              {selectedGroup.puzzles.map((puzzle) => {
                const puzzleId = String(puzzle?.puzzleId ?? "").trim();
                const author = (puzzle?.author || "").trim() || "Unknown";
                const opening = (puzzle?.opening || "").trim();

                return (
                  <article key={`${selectedGroup.eventKey}-${puzzleId}`} className="puzzleSetPuzzleRow">
                    <div className="puzzleSetPuzzlePrimary">
                      <span className="puzzleSetsMiniLabel">Puzzle</span>
                      <Link className="puzzleSetPuzzleLink" to="/solve/$puzzleId" params={{ puzzleId }}>
                        Puzzle {puzzleId}
                      </Link>
                      <div className="puzzleSetPuzzleMeta">
                        <span>{author}</span>
                        {opening ? <span>{opening}</span> : null}
                        <span>{selectedGroup.event}</span>
                      </div>
                    </div>
                    <Link
                      className="puzzleSetOpenLink"
                      to="/solve/$puzzleId"
                      params={{ puzzleId }}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <span>Open puzzle</span>
                      <span className="puzzleSetOpenIcon" aria-hidden="true">
                        ↗
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="puzzleSetsStateCard">
              Choose a set above to see all of its puzzle links in one place.
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
