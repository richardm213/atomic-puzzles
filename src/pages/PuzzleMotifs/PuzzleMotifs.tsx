import "./PuzzleMotifs.css";

import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMemo, useRef, useState } from "react";

import { PuzzleMotifRename } from "../../components/PuzzleMotifRename/PuzzleMotifRename";
import { Seo } from "../../components/Seo/Seo";
import {
  getPuzzleMotifAnchor,
  getPuzzleMotifParent,
  type PuzzleMotif,
  puzzleMotifs,
} from "../../lib/puzzles/puzzleMotifs";
import { usePuzzleMotifNames } from "../../lib/puzzles/usePuzzleMotifNames";

const renderMotif = (
  motif: PuzzleMotif,
  childrenByParent: Map<PuzzleMotif["parentTag"], PuzzleMotif[]>,
  naming: Pick<ReturnType<typeof usePuzzleMotifNames>, "getName" | "canRename">,
  onFocusFallback: () => void,
  parent?: PuzzleMotif,
  depth = 0,
) => {
  const children = childrenByParent.get(motif.tag) ?? [];
  const anchor = getPuzzleMotifAnchor(motif.tag);
  const Heading = depth === 0 ? "h2" : depth === 1 ? "h3" : "h4";
  const name = naming.getName(motif.tag);

  return (
    <div className={`motifFamily ${children.length > 0 ? "hasChildren" : ""}`} key={motif.tag}>
      <article id={anchor} className={`motifCard ${parent ? "motifCardChild" : "motifCardParent"}`}>
        {parent ? (
          <span className="motifParentLabel">Under {naming.getName(parent.tag)}</span>
        ) : null}
        <div className="motifCardHeading">
          <Heading>{name}</Heading>
          <div className="motifCardActions">
            <a className="motifTag" href={`#${anchor}`} aria-label={`Link to ${name}`}>
              #{motif.tag}
            </a>
            {naming.canRename ? (
              <PuzzleMotifRename
                motif={motif}
                name={name}
                showLabel
                onFocusFallback={onFocusFallback}
              />
            ) : null}
          </div>
        </div>
        <p>{motif.description}</p>
      </article>
      {children.length > 0 ? (
        <div className="motifChildren" role="group" aria-label={`${name} submotifs`}>
          {children.map((child) =>
            renderMotif(child, childrenByParent, naming, onFocusFallback, motif, depth + 1),
          )}
        </div>
      ) : null}
    </div>
  );
};

export const PuzzleMotifsPage = () => {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const { getName, canRename } = usePuzzleMotifNames();
  const normalizedQuery = query.trim().toLowerCase().replace(/^#/, "");
  const matchingMotifs = useMemo(
    () =>
      puzzleMotifs.filter((motif) => {
        if (!normalizedQuery) return true;
        return [motif.tag, motif.name, getName(motif.tag), motif.description].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        );
      }),
    [getName, normalizedQuery],
  );
  const childrenByParent = useMemo(() => {
    const visibleTags = new Set(matchingMotifs.map((motif) => motif.tag));
    for (const motif of matchingMotifs) {
      let parent = getPuzzleMotifParent(motif);
      while (parent && !visibleTags.has(parent.tag)) {
        visibleTags.add(parent.tag);
        parent = getPuzzleMotifParent(parent);
      }
    }

    const groups = new Map<PuzzleMotif["parentTag"], PuzzleMotif[]>();
    for (const motif of puzzleMotifs) {
      if (!visibleTags.has(motif.tag)) continue;
      const group = groups.get(motif.parentTag) ?? [];
      group.push(motif);
      groups.set(motif.parentTag, group);
    }
    return groups;
  }, [matchingMotifs]);
  const rootMotifs = childrenByParent.get(undefined) ?? [];

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
                ref={searchRef}
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

        <div className="motifsContent">
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
                {rootMotifs.map((motif) =>
                  renderMotif(motif, childrenByParent, { getName, canRename }, () =>
                    searchRef.current?.focus(),
                  ),
                )}
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
        </div>
      </div>
    </div>
  );
};
