import { faArrowUp } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { MouseEvent, ReactNode } from "react";

import { type PuzzleMotif, puzzleMotifs } from "../../lib/puzzles/puzzleMotifs";
import { type MotifExample, motifExamples } from "./motifExamples";

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

type PuzzleMotifsContentProps = {
  getName?: (tag: PuzzleMotif["tag"]) => string;
  onMotifClick?: (event: MouseEvent<HTMLAnchorElement>, tag: PuzzleMotif["tag"]) => void;
  renderRename?: (motif: PuzzleMotif, name: string) => ReactNode;
  renderExample?: (example: MotifExample, name: string, tag: PuzzleMotif["tag"]) => ReactNode;
};

const ExampleText = ({ pgn, note }: MotifExample) => (
  <figure className="motifExample">
    <p className="motifDefinitionText">Example moves: {pgn}</p>
    {note ? <figcaption>{note}</figcaption> : null}
  </figure>
);

export const PuzzleMotifsContent = ({
  getName,
  onMotifClick,
  renderRename,
  renderExample = (example) => <ExampleText {...example} />,
}: PuzzleMotifsContentProps) => {
  const nameOf = (motif: PuzzleMotif) => getName?.(motif.tag) ?? motif.name;

  const renderGlossaryItem = (motif: PuzzleMotif): ReactNode => {
    const children = childrenByParent.get(motif.tag);
    return (
      <li key={motif.tag}>
        <a
          href={`#${motif.tag}`}
          onClick={onMotifClick ? (event) => onMotifClick(event, motif.tag) : undefined}
        >
          {nameOf(motif)}
        </a>
        {children?.length ? <ul>{children.map(renderGlossaryItem)}</ul> : null}
      </li>
    );
  };

  return (
    <div className="motifsShell">
      <h1>Atomic tactical motifs</h1>
      <nav className="motifGlossary" id="motif-glossary" aria-labelledby="motif-glossary-title">
        <h2 id="motif-glossary-title">Glossary</h2>
        <ul className="motifGlossaryIndex">{rootMotifs.map(renderGlossaryItem)}</ul>
      </nav>

      <section className="motifDefinitions" aria-label="Motif definitions and examples">
        {orderedMotifs.map((motif) => {
          const name = nameOf(motif);
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
                {renderRename?.(motif, name)}
              </div>
              <p className="motifDefinitionText">{motif.description}</p>
              {example ? renderExample(example, name, motif.tag) : null}
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
  );
};
