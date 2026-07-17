import "./PuzzleSets.css";

import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { loadPuzzleLibrary } from "../../lib/puzzles/puzzleLibrary";
import { getPuzzleEventKey, groupPuzzlesByEvent } from "../../lib/puzzles/puzzleSets";
import { getOpeningDisplayLabel } from "../../utils/openings";

const EVENT_FILTERS = [
  { id: "all", label: "All" },
  { id: "acl", label: "ACL" },
  { id: "swiss960", label: "960 Swiss" },
  { id: "chess960", label: "960" },
  { id: "awc", label: "AWC" },
  { id: "practiceMatch", label: "Practice" },
  { id: "wolfrandom", label: "WolframRandom" },
];

const matchesEventFilter = (
  group: { event?: string | null | undefined },
  filterId: string,
): boolean => {
  if (filterId === "all") return true;

  const normalizedEvent = String(group?.event ?? "")
    .trim()
    .toLocaleLowerCase();
  if (!normalizedEvent) return false;

  if (filterId === "acl") {
    return normalizedEvent.includes("acl") || normalizedEvent.includes("atomic chess league");
  }

  if (filterId === "swiss960") {
    return normalizedEvent.includes("960 swiss") || normalizedEvent.includes("atomic960 swiss");
  }

  if (filterId === "chess960") {
    return normalizedEvent.includes("960") && !matchesEventFilter(group, "swiss960");
  }

  if (filterId === "awc") {
    return normalizedEvent.includes("awc") || normalizedEvent.includes("atomic wc");
  }

  if (filterId === "practiceMatch") {
    return normalizedEvent.includes("practice");
  }

  if (filterId === "wolfrandom") {
    const compactEvent = normalizedEvent.replace(/[^a-z0-9]/g, "");
    return compactEvent.includes("wolfrandom") || compactEvent.includes("wolframrandom");
  }

  return true;
};

const readEventKeyFromHash = (): string => {
  if (typeof window === "undefined") return "";
  let hashValue = window.location.hash.replace(/^#/, "").trim();
  if (!hashValue) return "";

  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const decodedValue = decodeURIComponent(hashValue);
      if (decodedValue === hashValue) break;
      hashValue = decodedValue;
    } catch {
      break;
    }
  }

  return getPuzzleEventKey(hashValue);
};

const updateEventKeyHash = (eventKey: string): void => {
  if (typeof window === "undefined") return;

  const nextHash = eventKey ? `#${eventKey}` : "";
  if (window.location.hash === nextHash) return;

  window.history.pushState(
    null,
    "",
    `${window.location.pathname}${window.location.search}${nextHash}`,
  );
};

export const PuzzleSetsPage = () => {
  const [puzzles, setPuzzles] = useState<import("../../lib/puzzles/puzzleLibrary").Puzzle[]>([]);
  const [selectedEventKey, setSelectedEventKey] = useState(() => readEventKeyFromHash());
  const [activeFilterId, setActiveFilterId] = useState("all");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const selectedSetSectionRef = useRef<HTMLElement | null>(null);
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

    void loadPuzzles();

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
    window.addEventListener("popstate", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
      window.removeEventListener("popstate", handleHashChange);
    };
  }, []);

  const puzzleGroups = useMemo(() => groupPuzzlesByEvent(puzzles), [puzzles]);
  const filteredPuzzleGroups = useMemo(
    () => puzzleGroups.filter((group) => matchesEventFilter(group, activeFilterId)),
    [activeFilterId, puzzleGroups],
  );
  const selectedGroup = useMemo(() => {
    if (!filteredPuzzleGroups.length) return null;

    const fromHash = filteredPuzzleGroups.find((group) => group.eventKey === selectedEventKey);
    if (fromHash) return fromHash;

    return null;
  }, [filteredPuzzleGroups, selectedEventKey]);

  const totalPuzzleCount = useMemo(
    () => puzzleGroups.reduce((count, group) => count + group.puzzles.length, 0),
    [puzzleGroups],
  );
  const totalSetCount = puzzleGroups.length;
  const handleSetSelection = (eventKey: string): void => {
    shouldScrollToSelectionRef.current = true;
    setSelectedEventKey(eventKey);
    updateEventKeyHash(eventKey);
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
        title="Puzzle Event Sets"
        description="Browse atomic puzzle events and open every puzzle from a selected set."
        path="/solve/sets"
      />
      <div className="puzzleSetsShell">
        <header className="puzzleSetsHero">
          <div className="puzzleSetsHeroCopy">
            <p className="puzzleSetsEyebrow">Atomic tactics</p>
            <h1>Puzzle Event Sets</h1>
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
            <div className="puzzleSetsSectionCopy">
              <p className="puzzleSetsSectionEyebrow">Events</p>
              <h2>Choose a puzzle set</h2>
            </div>
            <div className="puzzleSetsFilterBar" role="toolbar" aria-label="Filter puzzle sets">
              {EVENT_FILTERS.map((filter) => {
                const isActive = filter.id === activeFilterId;

                return (
                  <button
                    key={filter.id}
                    type="button"
                    className={`puzzleSetsFilterButton ${isActive ? "active" : ""}`}
                    onClick={() => setActiveFilterId(filter.id)}
                    aria-pressed={isActive}
                  >
                    {filter.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="puzzleSetsStateCard">Loading puzzle sets…</div>
          ) : filteredPuzzleGroups.length > 0 ? (
            <div className="puzzleSetGrid" role="list" aria-label="Puzzle events">
              {filteredPuzzleGroups.map((group) => {
                const firstPuzzleId = group.puzzles[0]?.puzzleId ?? "—";
                const lastPuzzleId = group.puzzles[group.puzzles.length - 1]?.puzzleId ?? "—";
                const isSelected = selectedGroup?.eventKey === group.eventKey;

                return (
                  <article
                    key={group.eventKey}
                    className={`puzzleSetCard ${isSelected ? "selected" : ""}`}
                    role="listitem"
                  >
                    <button
                      type="button"
                      className="puzzleSetCardSelect"
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
                    <Link
                      className="puzzleSetCardStartLink"
                      to="/solve/set/$setKey/$puzzleId"
                      params={{
                        setKey: group.event,
                        puzzleId: String(group.puzzles[0]?.puzzleId ?? ""),
                      }}
                    >
                      Start set
                      <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="puzzleSetsStateCard">
              {puzzleGroups.length > 0
                ? "No puzzle sets match this filter yet."
                : "No puzzle sets are available yet."}
            </div>
          )}
        </section>

        {selectedGroup ? (
          <section
            className="puzzleSetsSection puzzleSetsSelectedSection"
            ref={selectedSetSectionRef}
          >
            <div className="puzzleSetsSectionHeader">
              <div className="puzzleSetsSectionCopy">
                <p className="puzzleSetsSectionEyebrow">Selected set</p>
                <h2>{selectedGroup.event}</h2>
              </div>
              <Link
                className="puzzleSetStartLink"
                to="/solve/set/$setKey/$puzzleId"
                params={{
                  setKey: selectedGroup.event,
                  puzzleId: String(selectedGroup.puzzles[0]?.puzzleId ?? ""),
                }}
              >
                Solve set from the start
                <span aria-hidden="true">→</span>
              </Link>
            </div>
            <div
              className="puzzleSetPuzzleList"
              role="list"
              aria-label={`${selectedGroup.event} puzzles`}
            >
              {selectedGroup.puzzles.map((puzzle) => {
                const puzzleId = String(puzzle?.puzzleId ?? "").trim();
                const author = String(puzzle?.["author"] ?? "").trim() || "Unknown";
                const opening = String(puzzle?.["opening"] ?? "").trim();

                return (
                  <article
                    key={`${selectedGroup.eventKey}-${puzzleId}`}
                    className="puzzleSetPuzzleRow"
                  >
                    <div className="puzzleSetPuzzlePrimary">
                      <span className="puzzleSetsMiniLabel">Puzzle</span>
                      <Link
                        className="puzzleSetPuzzleLink"
                        to="/solve/$puzzleId"
                        params={{ puzzleId }}
                      >
                        Puzzle {puzzleId}
                      </Link>
                      <div className="puzzleSetPuzzleMeta">
                        <span>{author}</span>
                        {opening ? <span>{getOpeningDisplayLabel(opening)}</span> : null}
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
          </section>
        ) : null}
      </div>
    </div>
  );
};
