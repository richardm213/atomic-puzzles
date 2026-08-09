import "./PuzzleMotifs.css";

import { useMemo, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import {
  getPuzzleMotifAnchor,
  puzzleMotifCategories,
  puzzleMotifs,
} from "../../lib/puzzles/puzzleMotifs";

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
          <p className="motifsEyebrow">Puzzle reference</p>
          <h1>Atomic tactical motifs</h1>
          <label className="motifsSearch">
            <span>Find a motif</span>
            <input
              type="search"
              value={query}
              placeholder="Search by tag, name, or idea"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </header>

        <nav className="motifsIndex" aria-label="Motif index">
          <div className="motifsIndexHeading">
            <div>
              <p className="motifsEyebrow">Index</p>
              <h2>
                {filteredMotifs.length} {filteredMotifs.length === 1 ? "motif" : "motifs"}
              </h2>
            </div>
            {query ? (
              <button type="button" onClick={() => setQuery("")}>
                Clear search
              </button>
            ) : null}
          </div>
          {filteredMotifs.length > 0 ? (
            <div className="motifsTagList">
              {filteredMotifs.map((motif) => (
                <a key={motif.tag} href={`#${getPuzzleMotifAnchor(motif.tag)}`}>
                  #{motif.tag}
                </a>
              ))}
            </div>
          ) : (
            <p className="motifsEmpty">No motifs match “{query}”.</p>
          )}
        </nav>

        <div className="motifsCategories">
          {puzzleMotifCategories.map((category) => {
            const categoryMotifs = filteredMotifs.filter((motif) => motif.category === category);
            if (categoryMotifs.length === 0) return null;

            return (
              <section key={category} className="motifsCategory">
                <div className="motifsCategoryHeading">
                  <h2>{category}</h2>
                  <span>{categoryMotifs.length}</span>
                </div>
                <div className="motifsGrid">
                  {categoryMotifs.map((motif) => (
                    <article
                      key={motif.tag}
                      id={getPuzzleMotifAnchor(motif.tag)}
                      className="motifCard"
                    >
                      <a className="motifTag" href={`#${getPuzzleMotifAnchor(motif.tag)}`}>
                        #{motif.tag}
                      </a>
                      <h3>{motif.name}</h3>
                      <p>{motif.description}</p>
                    </article>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
