import "./PuzzleMotifs.css";

import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  getPuzzleMotifAnchor,
  puzzleMotifCategories,
  type PuzzleMotifCategory,
  puzzleMotifs,
} from "../../lib/puzzles/puzzleMotifs";

const categoryDetails: Record<
  PuzzleMotifCategory,
  { index: string; description: string; slug: string }
> = {
  "Attack and mate": {
    index: "01",
    description: "Forcing ideas that create decisive threats.",
    slug: "attack-and-mate",
  },
  "Clearance and control": {
    index: "02",
    description: "Lines, squares, move order, and restriction.",
    slug: "clearance-and-control",
  },
  "Defense and survival": {
    index: "03",
    description: "Accurate resources that resist or escape threats.",
    slug: "defense-and-survival",
  },
  "Position and endgame": {
    index: "04",
    description: "Piece placement and reduced-material play.",
    slug: "position-and-endgame",
  },
};

export const PuzzleMotifsPage = () => {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase().replace(/^#/, "");
  const filteredMotifs = useMemo(
    () =>
      puzzleMotifs.filter((motif) => {
        if (!normalizedQuery) return true;
        return [motif.tag, motif.name, motif.category, motif.description].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      }),
    [normalizedQuery],
  );

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

          <div className="motifsHeroStats" aria-label="Motif totals">
            <div>
              <strong>{puzzleMotifs.length}</strong>
              <span>motifs</span>
            </div>
            <div>
              <strong>{puzzleMotifCategories.length}</strong>
              <span>categories</span>
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

        <div className="motifsBrowser">
          <aside className="motifsDirectory">
            <div className="motifsDirectoryInner">
              <p className="motifsEyebrow">Browse</p>
              <h2>Categories</h2>
              <nav aria-label="Motif categories">
                {puzzleMotifCategories.map((category) => {
                  const details = categoryDetails[category];
                  const count = puzzleMotifs.filter((motif) => motif.category === category).length;
                  return (
                    <a key={category} href={`#${details.slug}`} data-category={details.slug}>
                      <span className="motifsDirectoryMarker" aria-hidden="true" />
                      <span>
                        <strong>{category}</strong>
                        <small>{count} motifs</small>
                      </span>
                    </a>
                  );
                })}
              </nav>
            </div>
          </aside>

          <main className="motifsContent">
            <div className="motifsResultsHeading" aria-live="polite">
              <p>
                {normalizedQuery ? "Search results" : "All motifs"}
                <span>{filteredMotifs.length}</span>
              </p>
              {normalizedQuery ? <small>Matching “{query.trim()}”</small> : null}
            </div>

            {filteredMotifs.length > 0 ? (
              <div className="motifsCategories">
                {puzzleMotifCategories.map((category) => {
                  const categoryMotifs = filteredMotifs.filter(
                    (motif) => motif.category === category,
                  );
                  if (categoryMotifs.length === 0) return null;

                  const details = categoryDetails[category];
                  return (
                    <section
                      key={category}
                      id={details.slug}
                      className="motifsCategory"
                      data-category={details.slug}
                    >
                      <div className="motifsCategoryHeading">
                        <span className="motifsCategoryIndex">{details.index}</span>
                        <div>
                          <h2>{category}</h2>
                          <p>{details.description}</p>
                        </div>
                        <span className="motifsCategoryCount">{categoryMotifs.length}</span>
                      </div>

                      <div className="motifsGrid">
                        {categoryMotifs.map((motif) => (
                          <article
                            key={motif.tag}
                            id={getPuzzleMotifAnchor(motif.tag)}
                            className="motifCard"
                          >
                            <div className="motifCardHeading">
                              <h3>{motif.name}</h3>
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
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
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
    </div>
  );
};
