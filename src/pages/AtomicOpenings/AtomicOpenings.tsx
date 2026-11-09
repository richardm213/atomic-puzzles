import "../PuzzleMotifs/PuzzleMotifs.css";
import "../AtomicChess/AtomicChess.css";
import "./AtomicOpenings.css";

import { Link } from "@tanstack/react-router";
import { INITIAL_FEN } from "chessops/fen";
import { type ReactNode, useEffect } from "react";

import { buildBoardStyle } from "../../components/Chessboard/boardStyle";
import { Seo } from "../../components/Seo/Seo";
import { useAppSettings } from "../../context/AppSettings";
import { ATOMIC_OPENINGS_PATH, atomicOpenings, type OpeningLine } from "../../utils/openings";
import { PuzzleMotifExample } from "../PuzzleMotifs/PuzzleMotifExample";

const OpeningDisclosure = ({
  id,
  className,
  heading: Heading,
  label,
  withRail = true,
  children,
}: {
  id?: string | undefined;
  className: string;
  heading: "h2" | "h3" | "h4" | "h5" | "h6";
  label: string;
  withRail?: boolean;
  children: ReactNode;
}) => (
  <details className={className} open={Heading !== "h5" && Heading !== "h6"}>
    <summary className="atomicOpeningToggle" id={id}>
      <Heading>{label}</Heading>
    </summary>
    <div className="atomicOpeningDisclosureBody">
      {children}
      {withRail && (
        <button
          className="atomicOpeningRail"
          type="button"
          aria-label={`Collapse ${label}`}
          onClick={({ currentTarget }) => {
            const disclosure = currentTarget.closest("details");
            if (!disclosure) return;
            disclosure.open = false;
            disclosure.querySelector("summary")?.focus();
          }}
        />
      )}
    </div>
  </details>
);

const revealOpening = (id: string) => {
  const target = document.getElementById(id);
  if (!target?.classList.contains("atomicOpeningToggle")) return;

  let disclosure = target.closest("details");
  while (disclosure) {
    disclosure.open = true;
    disclosure = disclosure.parentElement?.closest("details") ?? null;
  }
  return target;
};

const OpeningSetup = ({ name, pgn }: { name: string; pgn: string }) => (
  <div className="atomicOpeningSetup">
    <PuzzleMotifExample
      example={{ fen: INITIAL_FEN, pgn }}
      name={`${name}: Opening setup`}
      focusRequest={null}
      startAtEnd
    />
  </div>
);

const OpeningReplays = ({
  name,
  lines,
  heading = "h4",
}: {
  name: string;
  lines: readonly OpeningLine[];
  heading?: "h4" | "h5" | "h6";
}) =>
  lines.map((line) => {
    const replayName = name === line.name ? name : `${name}: ${line.name}`;
    const replies = line.replies?.length ? line.replies : null;
    const replay = replies ? (
      <OpeningSetup name={replayName} pgn={line.pgn} />
    ) : (
      <PuzzleMotifExample
        example={{ fen: INITIAL_FEN, pgn: line.pgn }}
        name={replayName}
        focusRequest={null}
        startAtEnd
      />
    );
    return lines.length > 1 || replies ? (
      <OpeningDisclosure
        className={replies ? "atomicOpeningNestedLine" : "atomicOpeningLine"}
        id={line.id}
        key={line.name}
        heading={heading}
        label={line.name}
        withRail={Boolean(replies)}
      >
        {replay}
        {replies && (
          <OpeningReplays
            name={replayName}
            lines={replies}
            heading={heading === "h4" ? "h5" : "h6"}
          />
        )}
      </OpeningDisclosure>
    ) : (
      <div className="atomicOpeningLine" key={line.name}>
        {replay}
      </div>
    );
  });

export const AtomicOpeningsPage = () => {
  useEffect(() => {
    const followHash = () => revealOpening(window.location.hash.slice(1))?.scrollIntoView();
    followHash();
    window.addEventListener("hashchange", followHash);
    return () => window.removeEventListener("hashchange", followHash);
  }, []);

  const {
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
    colorMode,
  } = useAppSettings();
  const boardStyle = buildBoardStyle(
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
    colorMode,
  );

  return (
    <div className="page atomicChessPage" style={boardStyle}>
      <Seo
        title="Atomic Chess Openings | Atomic Puzzles"
        description="Replay the atomic chess openings tagged on player profiles, from Two Knights and the Atomic Attack to first-move defenses."
        path={ATOMIC_OPENINGS_PATH}
      />
      <article className="atomicChessGuide atomicOpenings">
        <header>
          <Link to="/atomic-chess">Back to the guide</Link>
          <h1>Atomic chess openings</h1>
        </header>

        <nav
          className="motifGlossary"
          id="opening-glossary"
          tabIndex={-1}
          aria-labelledby="opening-glossary-title"
        >
          <h2 id="opening-glossary-title">Opening glossary</h2>
          <ul className="motifGlossaryIndex">
            {atomicOpenings.map((opening) => (
              <li key={opening.id}>
                <a href={`#${opening.id}`} onClick={() => revealOpening(opening.id)}>
                  {opening.name}
                </a>
                {opening.branches && (
                  <ul>
                    {opening.branches.map((branch) => (
                      <li key={branch.id}>
                        <a href={`#${branch.id}`} onClick={() => revealOpening(branch.id)}>
                          {branch.reply}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>

        {atomicOpenings.map((opening) => (
          <section className="motifDefinition" key={opening.id} aria-labelledby={opening.id}>
            <OpeningDisclosure
              id={opening.id}
              className="atomicOpeningFamily"
              heading="h2"
              label={opening.name}
            >
              <OpeningSetup name={opening.name} pgn={opening.setup} />
              {opening.branches?.map((branch) => (
                <OpeningDisclosure
                  className="atomicOpeningBranch"
                  id={branch.id}
                  key={branch.id}
                  heading="h3"
                  label={branch.reply}
                >
                  {branch.setup && (
                    <OpeningSetup name={`${opening.name}: ${branch.reply}`} pgn={branch.setup} />
                  )}
                  {branch.groups?.map((group) => (
                    <OpeningDisclosure
                      className="atomicOpeningGroup"
                      id={group.id}
                      key={group.id}
                      heading="h4"
                      label={group.name}
                    >
                      <OpeningSetup name={`${opening.name}: ${group.name}`} pgn={group.setup} />
                      <OpeningReplays
                        name={`${opening.name}: ${group.name}`}
                        lines={group.lines}
                        heading="h5"
                      />
                    </OpeningDisclosure>
                  ))}
                  <OpeningReplays name={opening.name} lines={branch.lines} />
                </OpeningDisclosure>
              ))}
              <div className="atomicOpeningGlossaryReturn">
                <a href="#opening-glossary">Back to glossary</a>
              </div>
            </OpeningDisclosure>
          </section>
        ))}
      </article>
    </div>
  );
};
