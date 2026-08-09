import "./PuzzleMotifs.css";

import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { getPuzzleMotifAnchor, puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";

export const PuzzleMotifsPage = () => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase().replace(/^#/, "");
  const matchingMotifs = useMemo(
    () =>
      puzzleMotifs.filter((motif) => {
        if (!normalizedQuery) return true;
        return [motif.tag, motif.name, motif.description].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      }),
    [normalizedQuery],
  );
  const visibleMotifs = useMemo(() => {
    if (!normalizedQuery) return puzzleMotifs;
    const visibleTags = new Set(matchingMotifs.map((motif) => motif.tag));
    matchingMotifs.forEach((motif) => {
      if (motif.parentTag) visibleTags.add(motif.parentTag);
    });
    return puzzleMotifs.filter((motif) => visibleTags.has(motif.tag));
  }, [matchingMotifs, normalizedQuery]);
  const rootMotifs = visibleMotifs.filter((motif) => !motif.parentTag);

  return (
    <div className="motifsPage">
      <Seo
        title="Atomic Chess Tactical Motifs"
        description="Definitions for the tactical motifs used to tag puzzles on Atomic Puzzles."
        path="/puzzles/motifs"
      />

      <div className="motifsShell">
        <header className="motifsHero">
          <div className="motifsHeroCopy">
            <p className="motifsEyebrow">Puzzle reference</p>
            <h1>Atomic tactical motifs</h1>
            <p>Browse the patterns used to classify Atomic Puzzles.</p>
          </div>

          <div className="motifsHeroStats" aria-label="Motif total">
            <div>
              <strong>{puzzleMotifs.length}</strong>
              <span>motifs</span>
            </div>
          </div>

          <label className="motifsSearch">
            <span className="motifsSearchLabel">Find a motif</span>
            <span className="motifsSearchControl">
              <FontAwesomeIcon icon={faMagnifyingGlass} aria-hidden="true" />
              <input
                type="search"
                value={query}
                placeholder="Search tags, names, or ideas…"
                onChange={(event) => setQuery(event.target.value)}
              />
              {query ? (
                <button type="button" aria-label="Clear motif search" onClick={() => setQuery("")}>
                  <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
                </button>
              ) : null}
            </span>
          </label>
        </header>

        <main className="motifsContent">
          <div className="motifsResultsHeading" aria-live="polite">
            <p>
              {normalizedQuery ? "Search results" : "All motifs"}
              <span>{matchingMotifs.length}</span>
            </p>
            {normalizedQuery ? <small>Matching “{query.trim()}”</small> : null}
          </div>

          {matchingMotifs.length > 0 ? (
            <section className="motifsIndexSection" aria-label="Motif definitions">
              <div className="motifsGrid">
                {rootMotifs.map((motif) => {
                  const childMotifs = visibleMotifs.filter(
                    (candidate) => candidate.parentTag === motif.tag,
                  );
                  return (
                    <div
                      className={`motifFamily ${childMotifs.length > 0 ? "hasChildren" : ""}`}
                      key={motif.tag}
                    >
                      <article
                        id={getPuzzleMotifAnchor(motif.tag)}
                        className="motifCard motifCardParent"
                      >
                        <div className="motifCardHeading">
                          <h2>{motif.name}</h2>
                          <a
                            className="motifTag"
                            href={`#${getPuzzleMotifAnchor(motif.tag)}`}
                            aria-label={`Link to ${motif.name}`}
                          >
                            #{motif.tag}
                          </a>
                        </div>
                        <p>{motif.description}</p>
                      </article>

                      {childMotifs.length > 0 ? (
                        <div className="motifChildren" aria-label={`${motif.name} submotifs`}>
                          {childMotifs.map((child) => (
                            <article
                              key={child.tag}
                              id={getPuzzleMotifAnchor(child.tag)}
                              className="motifCard motifCardChild"
                            >
                              <span className="motifParentLabel">Under {motif.name}</span>
                              <div className="motifCardHeading">
                                <h2>{child.name}</h2>
                                <a
                                  className="motifTag"
                                  href={`#${getPuzzleMotifAnchor(child.tag)}`}
                                  aria-label={`Link to ${child.name}`}
                                >
                                  #{child.tag}
                                </a>
                              </div>
                              <p>{child.description}</p>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="motifsEmpty">
              <span aria-hidden="true">#</span>
              <h2>No motifs found</h2>
              <p>Try a piece, pattern, or tactical idea.</p>
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
