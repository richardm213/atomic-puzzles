import "./PuzzleMotifs.css";

import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";

import { PuzzleMotifRename } from "../../components/PuzzleMotifRename/PuzzleMotifRename";
import { Seo } from "../../components/Seo/Seo";
import { isPuzzleMotifTag, type PuzzleMotif, puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";
import { usePuzzleMotifNames } from "../../lib/puzzles/usePuzzleMotifNames";
import { motifExamples } from "./motifExamples";
import { PuzzleMotifExample } from "./PuzzleMotifExample";

const childrenByParent = new Map<string | undefined, PuzzleMotif[]>();
for (const motif of puzzleMotifs) {
  const siblings = childrenByParent.get(motif.parentTag) ?? [];
  siblings.push(motif);
  childrenByParent.set(motif.parentTag, siblings);
}

const rootMotifs = childrenByParent.get(undefined) ?? [];
const descendants = (motif: PuzzleMotif): PuzzleMotif[] => [
  motif,
  ...(childrenByParent.get(motif.tag) ?? []).flatMap(descendants),
];
const orderedMotifs = rootMotifs.flatMap(descendants);

export const PuzzleMotifsPage = () => {
  const { getName, canRename } = usePuzzleMotifNames();
  const navigate = useNavigate();
  const [focusRequest, setFocusRequest] = useState<{ tag: string; pointer: boolean } | null>(null);

  useEffect(() => {
    // The signed-in route can mount after the browser first resolves a deep link.
    const scrollToMotif = () => {
      const tag = window.location.hash.slice(1).replace(/^motifs?-/, "");
      if (isPuzzleMotifTag(tag)) {
        document.getElementById(tag)?.scrollIntoView({ block: "start" });
      }
    };
    scrollToMotif();
    window.addEventListener("hashchange", scrollToMotif);
    return () => window.removeEventListener("hashchange", scrollToMotif);
  }, []);

  const renderGlossaryItem = (motif: PuzzleMotif): ReactNode => {
    const children = childrenByParent.get(motif.tag);
    return (
      <li key={motif.tag}>
        <a
          href={`#${motif.tag}`}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.altKey ||
              event.ctrlKey ||
              event.metaKey ||
              event.shiftKey
            )
              return;
            if (!motifExamples[motif.tag]) {
              setFocusRequest(null);
              return;
            }
            // Native fragment navigation focuses the article, not its replay.
            event.preventDefault();
            setFocusRequest({ tag: motif.tag, pointer: event.detail > 0 });
            if (window.location.hash !== `#${motif.tag}`) {
              void navigate({
                to: "/tactical-motifs",
                search: true,
                hash: motif.tag,
                resetScroll: false,
                hashScrollIntoView: false,
              });
            }
          }}
        >
          {getName(motif.tag)}
        </a>
        {children?.length ? <ul>{children.map(renderGlossaryItem)}</ul> : null}
      </li>
    );
  };

  return (
    <div className="motifsPage">
      <Seo
        title="Atomic Chess Tactical Motifs"
        description="Explore Atomic Chess tactics through definitions and replayable puzzle examples."
        path="/tactical-motifs"
      />
      <div className="motifsShell">
        <h1>Atomic tactical motifs</h1>
        <nav className="motifGlossary" id="motif-glossary" aria-labelledby="motif-glossary-title">
          <h2 id="motif-glossary-title">Glossary</h2>
          <ul className="motifGlossaryIndex">{rootMotifs.map(renderGlossaryItem)}</ul>
        </nav>

        <section className="motifDefinitions" aria-label="Motif definitions and examples">
          {orderedMotifs.map((motif) => {
            const name = getName(motif.tag);
            const example = motifExamples[motif.tag];
            const anchor = motif.tag;
            return (
              <article
                className="motifDefinition"
                id={anchor}
                key={motif.tag}
                tabIndex={-1}
                aria-labelledby={`${anchor}-heading`}
              >
                <div className="motifDefinitionHeading">
                  <h2 id={`${anchor}-heading`}>{name}</h2>
                  {canRename ? <PuzzleMotifRename motif={motif} name={name} /> : null}
                </div>
                <p className="motifDefinitionText">{motif.description}</p>
                {example ? (
                  <PuzzleMotifExample
                    example={example}
                    name={name}
                    focusRequest={focusRequest?.tag === motif.tag ? focusRequest : null}
                  />
                ) : null}
                <div className="motifDefinitionLinks">
                  <a
                    className="motifGlossaryReturn"
                    href="#motif-glossary"
                    aria-label="Back to glossary"
                    title="Back to glossary"
                  >
                    <FontAwesomeIcon icon={faArrowUp} aria-hidden="true" />
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      </div>
    </div>
  );
};
