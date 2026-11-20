import type { ReactNode } from "react";

import type { TournamentBracketStage } from "../../lib/matches/tournaments";
import {
  BOARD_PADDING,
  CARD_WIDTH,
  COLUMN_GAP,
  getStageRoundShortLabel,
  HEADER_SPACE,
  type StageLayout,
  zoomDisplayPercent,
} from "./bracketLayout";
import type { useTournamentBracketViewport } from "./useTournamentBracketViewport";

export const TournamentBracketViewport = ({
  stage,
  layout,
  zoomLevel,
  startRoundName,
  viewport,
  children,
}: {
  stage: TournamentBracketStage;
  layout: StageLayout;
  zoomLevel: number;
  startRoundName: string;
  viewport: ReturnType<typeof useTournamentBracketViewport>;
  children: ReactNode;
}) => (
  <>
    {layout ? (
      <div
        className="tournamentRoundHeaderRail"
        style={{
          height: `${HEADER_SPACE * zoomLevel}px`,
          marginBottom: `${-HEADER_SPACE * zoomLevel}px`,
        }}
      >
        <div
          className="tournamentRoundHeaderTrack"
          ref={(node) => viewport.setHeaderTrackRef(stage.key, node)}
          style={{
            width: `${layout.width * zoomLevel}px`,
          }}
        >
          {layout.rounds.map((round, roundIndex) => (
            <div
              key={`${stage.key}-${round.roundName}-sticky`}
              className={`tournamentRoundHeader tournamentRoundHeaderSticky${zoomDisplayPercent(zoomLevel) < 65 ? " isCompact" : ""}`}
              style={{
                left: `${(BOARD_PADDING + roundIndex * (CARD_WIDTH + COLUMN_GAP)) * zoomLevel}px`,
                width: `${CARD_WIDTH * zoomLevel}px`,
              }}
            >
              <span>
                {stage.key === "qualifying" || zoomDisplayPercent(zoomLevel) < 65
                  ? getStageRoundShortLabel(stage, round.roundName)
                  : round.roundName}
              </span>
            </div>
          ))}
        </div>
      </div>
    ) : null}
    <div
      className="tournamentDrawViewport"
      aria-label={`${stage.label} draw starting at ${startRoundName}`}
    >
      <div
        className={`tournamentRoundsScroller${viewport.draggingStage === stage.key ? " isDragging" : ""}${stage.key === "main" ? " isMainBracket" : ""}`}
        ref={(node) => viewport.setScrollerRef(stage.key, node)}
        onPointerDown={(event) => viewport.handleScrollerPointerDown(stage.key, event)}
        onPointerMove={viewport.handleScrollerPointerMove}
        onPointerUp={viewport.endScrollerDrag}
        onPointerCancel={viewport.endScrollerDrag}
        onLostPointerCapture={viewport.endScrollerDrag}
        onScroll={(event) => viewport.handleScrollerScroll(stage.key, event)}
      >
        {!layout ? null : (
          <div
            className="tournamentTreeBoardViewport"
            style={{
              width: `${layout.width * zoomLevel}px`,
              height: `${layout.height * zoomLevel}px`,
            }}
          >
            <div
              className={`tournamentTreeBoard${stage.key === "main" ? " isMainTree" : ""}`}
              style={{
                width: `${layout.width}px`,
                height: `${layout.height}px`,
                transform: `scale(${zoomLevel})`,
              }}
            >
              <svg
                className="tournamentTreeLines"
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                {layout.connectors.map((connector) => (
                  <line
                    key={connector.key}
                    x1={connector.x1}
                    y1={connector.y1}
                    x2={connector.x2}
                    y2={connector.y2}
                  />
                ))}
              </svg>

              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  </>
);
