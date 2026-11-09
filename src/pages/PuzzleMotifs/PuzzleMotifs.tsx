import "./PuzzleMotifs.css";

import { useNavigate } from "@tanstack/react-router";
import { type MouseEvent, useEffect, useState } from "react";

import {
  TACTICAL_MOTIFS_DESCRIPTION,
  TACTICAL_MOTIFS_PATH,
  TACTICAL_MOTIFS_TITLE,
} from "../../../shared/seo";
import { PuzzleMotifRename } from "../../components/PuzzleMotifRename/PuzzleMotifRename";
import { Seo } from "../../components/Seo/Seo";
import { isPuzzleMotifTag, type PuzzleMotif } from "../../lib/puzzles/puzzleMotifs";
import { usePuzzleMotifNames } from "../../lib/puzzles/usePuzzleMotifNames";
import { motifExamples } from "./motifExamples";
import { PuzzleMotifExample } from "./PuzzleMotifExample";
import { PuzzleMotifsContent } from "./PuzzleMotifsContent";

export const PuzzleMotifsPage = () => {
  const { getName, canRename } = usePuzzleMotifNames();
  const navigate = useNavigate();
  const [focusRequest, setFocusRequest] = useState<{ tag: string; pointer: boolean } | null>(null);

  useEffect(() => {
    // The app can replace the static page after the browser first resolves a deep link.
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

  const handleMotifClick = (event: MouseEvent<HTMLAnchorElement>, tag: PuzzleMotif["tag"]) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
      return;
    if (!motifExamples[tag]) {
      setFocusRequest(null);
      return;
    }
    // Native fragment navigation focuses the article, not its replay.
    event.preventDefault();
    setFocusRequest({ tag, pointer: event.detail > 0 });
    if (window.location.hash !== `#${tag}`) {
      void navigate({
        to: "/tactical-motifs",
        search: true,
        hash: tag,
        resetScroll: false,
        hashScrollIntoView: false,
      });
    }
  };

  return (
    <div className="motifsPage">
      <Seo
        title={TACTICAL_MOTIFS_TITLE}
        description={TACTICAL_MOTIFS_DESCRIPTION}
        path={TACTICAL_MOTIFS_PATH}
      />
      <PuzzleMotifsContent
        getName={getName}
        onMotifClick={handleMotifClick}
        renderRename={
          canRename ? (motif, name) => <PuzzleMotifRename motif={motif} name={name} /> : undefined
        }
        renderExample={(example, name, tag) => (
          <PuzzleMotifExample
            example={example}
            name={name}
            focusRequest={focusRequest?.tag === tag ? focusRequest : null}
          />
        )}
      />
    </div>
  );
};
