import { useMemo } from "react";

import { MaterialDifferencePieces } from "../../components/MaterialDifferencePieces/MaterialDifferencePieces";
import { PlayerLink } from "../../components/PlayerLink/PlayerLink";
import { materialCountFromFen } from "../../lib/chess/materialCount";
import { normalizeUsername } from "../../utils/playerNames";
import { castlingRightsFromFen } from "./castlingRights";

type PuzzlePlayer = { name: string; label: string };

export const PuzzlePositionRows = ({
  fen,
  white,
  black,
  mobile = false,
  showEmpty = false,
}: {
  fen: string;
  white?: PuzzlePlayer;
  black?: PuzzlePlayer;
  mobile?: boolean;
  showEmpty?: boolean;
}) => {
  const material = useMemo(() => materialCountFromFen(fen), [fen]);
  const castling = castlingRightsFromFen(fen);
  const hasPlayerNames = Boolean(white?.name || black?.name);
  const hasCastling = showEmpty || castling.white.length > 0 || castling.black.length > 0;
  const hasMaterial =
    showEmpty || material.whitePieces.length > 0 || material.blackPieces.length > 0;
  if (!hasPlayerNames && !hasCastling && !hasMaterial) return null;

  const positionClasses = `${hasCastling ? " hasCastlingData" : ""}${hasMaterial ? " hasMaterialData" : ""}`;

  return (
    <section
      className={`${mobile ? "mobilePuzzlePlayers" : "puzzlePlayers"}${positionClasses}${hasPlayerNames ? " hasPlayerNames" : ""}`}
      aria-label={showEmpty ? "Castling rights and material" : "Game players"}
    >
      {(["white", "black"] as const).map((side) => {
        const label = side === "white" ? "White" : "Black";
        const player = side === "white" ? white : black;
        const rights = castling[side];
        const pieces = side === "white" ? material.whitePieces : material.blackPieces;
        const materialStatus = pieces.length ? pieces.join(", ") : "no extra material";
        const castlingStatus = `Castling rights: ${rights.join(", ") || "none"}`;

        return (
          <div
            className={`puzzlePlayer${positionClasses}${player?.name || (mobile && hasPlayerNames) ? " hasPlayerName" : ""}`}
            aria-label={
              showEmpty
                ? label
                : `${label}: ${player?.label || "unknown"}${hasMaterial ? `, material difference: ${materialStatus}` : ""}`
            }
            role={showEmpty ? "group" : undefined}
            key={side}
          >
            <span className={`playerColorMarker ${side}`} aria-hidden="true" />
            {player?.name ? (
              <PlayerLink
                className="puzzlePlayerLink"
                username={normalizeUsername(player.name)}
                variant="puzzles"
                title={player.name}
              >
                {player.label}
              </PlayerLink>
            ) : mobile && hasPlayerNames ? (
              <span className="puzzlePlayerNameSpacer" aria-hidden="true" />
            ) : null}
            {hasCastling ? (
              <strong
                className="puzzlePlayerCastling"
                aria-label={castlingStatus}
                title={showEmpty ? castlingStatus : undefined}
              >
                {rights.join(" · ") || "—"}
              </strong>
            ) : null}
            {hasMaterial ? (
              <MaterialDifferencePieces pieces={pieces} showEmpty={showEmpty} />
            ) : null}
          </div>
        );
      })}
    </section>
  );
};
