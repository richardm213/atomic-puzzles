import "../PuzzleMotifs/PuzzleMotifs.css";
import "./AtomicChess.css";

import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";

import {
  ATOMIC_CHESS_DESCRIPTION,
  ATOMIC_CHESS_PATH,
  ATOMIC_CHESS_STRUCTURED_DATA,
  ATOMIC_CHESS_TITLE,
} from "../../../shared/seo";
import { buildBoardStyle } from "../../components/Chessboard/boardStyle";
import { Seo } from "../../components/Seo/Seo";
import { useAppSettings } from "../../context/AppSettings";
import { PuzzleMotifExample } from "../PuzzleMotifs/PuzzleMotifExample";
import { atomicChessExamples } from "./atomicChessExamples";
import { AtomicChessGuideContent, type GuideReplayProps } from "./AtomicChessGuideContent";

const GuideLink = ({ href, className, children }: ComponentProps<"a">) => (
  <Link to={href ?? "/"} className={className ?? ""}>
    {children}
  </Link>
);

const GuideReplay = ({ id, focusRequest = null }: GuideReplayProps) => (
  <PuzzleMotifExample
    example={atomicChessExamples[id]}
    name={atomicChessExamples[id].name}
    focusRequest={focusRequest}
  />
);

export const AtomicChessPage = () => {
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
        title={ATOMIC_CHESS_TITLE}
        description={ATOMIC_CHESS_DESCRIPTION}
        path={ATOMIC_CHESS_PATH}
        structuredData={ATOMIC_CHESS_STRUCTURED_DATA}
      />
      <AtomicChessGuideContent LinkComponent={GuideLink} ExampleComponent={GuideReplay} />
    </div>
  );
};
