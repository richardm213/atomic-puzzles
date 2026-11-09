import "../PuzzleMotifs/PuzzleMotifs.css";
import "./AtomicChess.css";

import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import {
  ATOMIC_CHESS_DESCRIPTION,
  ATOMIC_CHESS_STRUCTURED_DATA,
  ATOMIC_CHESS_TITLE,
} from "../../../shared/seo";
import { Seo } from "../../components/Seo/Seo";
import { PuzzleMotifExample } from "../PuzzleMotifs/PuzzleMotifExample";
import { atomicChessExamples, type GuideExampleId } from "./atomicChessExamples";
import { AtomicChessGuideContent } from "./AtomicChessGuideContent";

const GuideLink = ({ href, className, children }: ComponentProps<"a">) => (
  <Link to={href ?? "/"} className={className ?? ""}>
    {children}
  </Link>
);

const GuideReplay = ({ id }: { id: GuideExampleId }) => (
  <PuzzleMotifExample
    example={atomicChessExamples[id]}
    name={atomicChessExamples[id].name}
    focusRequest={null}
  />
);

export const AtomicChessPage = () => (
  <div className="page atomicChessPage">
    <Seo
      title={ATOMIC_CHESS_TITLE}
      description={ATOMIC_CHESS_DESCRIPTION}
      path="/atomic-chess"
      structuredData={ATOMIC_CHESS_STRUCTURED_DATA}
    />
    <AtomicChessGuideContent LinkComponent={GuideLink} ExampleComponent={GuideReplay} />
  </div>
);
