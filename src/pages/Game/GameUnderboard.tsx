import type { CSSProperties } from "react";
import { useMemo, useState } from "react";
import { z } from "zod";

import { DocumentField } from "../../components/BoardWorkspace/BoardWorkspace";
import type { BoardDocument } from "../../hooks/useBoardDocument";
import { usePersistedState } from "../../hooks/usePersistedState";
import type { ArchiveGame } from "../../lib/archive/games";
import { moveDurationsMilliseconds } from "../../lib/games/moveTimes";
import { copyTextToClipboard } from "../../utils/clipboard";
import { GameMatchCrosstable } from "./GameMatchCrosstable";

type GameUnderboardTab = "move-times" | "crosstable" | "share";
const TAB_STORAGE_KEY = "atomic-puzzles.game.underboard-tab";
const tabSchema = z.enum(["move-times", "crosstable", "share"]);

const formatDuration = (milliseconds: number): string => {
  const seconds = milliseconds / 1_000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  return `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
};

const CopyButton = ({ label, value }: { label: string; value: string }) => {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return (
    <button
      type="button"
      onClick={() =>
        void copyTextToClipboard(value).then((copied) => setStatus(copied ? "copied" : "error"))
      }
    >
      {status === "copied" ? "Copied" : status === "error" ? "Copy failed" : label}
    </button>
  );
};

export const GameUnderboard = ({
  game,
  currentPly,
  moves,
  document,
  onNavigatePly,
}: {
  game: ArchiveGame;
  currentPly: number;
  moves: string[];
  document: BoardDocument;
  onNavigatePly: (ply: number) => void;
}) => {
  const [activeTab, setActiveTab] = usePersistedState<GameUnderboardTab>(
    TAB_STORAGE_KEY,
    tabSchema,
    "move-times",
  );
  const durations = useMemo(() => moveDurationsMilliseconds(game), [game]);
  const availableDurations = durations.filter((duration): duration is number => duration !== null);
  const longestDuration = Math.max(1, ...availableDurations);
  const pgn = String(document.pgn.value ?? "");

  const downloadPgn = (): void => {
    const url = URL.createObjectURL(new Blob([pgn], { type: "application/x-chess-pgn" }));
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${game.game_id}.pgn`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: Array<{ id: GameUnderboardTab; label: string }> = [
    { id: "move-times", label: "Move times" },
    { id: "crosstable", label: "Crosstable" },
    { id: "share", label: "Share & export" },
  ];

  return (
    <section className="gameUnderboard">
      <div className="gameUnderboardTabs" role="tablist" aria-label="Game details">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`game-tab-${tab.id}`}
            aria-controls="game-underboard-panel"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="gameUnderboardPanel"
        id="game-underboard-panel"
        role="tabpanel"
        aria-labelledby={`game-tab-${activeTab}`}
      >
        {activeTab === "move-times" ? (
          availableDurations.length ? (
            <ol className="gameMoveTimes" aria-label="Move times by ply">
              {durations.map((duration, index) => (
                <li key={`${index}-${moves[index] ?? "move"}`}>
                  <button
                    type="button"
                    className={`${index % 2 === 0 ? "white" : "black"}${currentPly === index + 1 ? " current" : ""}`}
                    style={
                      {
                        "--move-time-height": `${duration === null ? 8 : Math.max(8, (duration / longestDuration) * 100)}%`,
                      } as CSSProperties
                    }
                    aria-label={`Go to move ${index + 1}, ${moves[index] ?? "move"}, ${duration === null ? "time unavailable" : formatDuration(duration)}`}
                    onClick={() => onNavigatePly(index + 1)}
                  >
                    <span className="gameMoveTimeBar" />
                    <small>{duration === null ? "—" : formatDuration(duration)}</small>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="gameUnderboardState">Move times are unavailable for this game.</p>
          )
        ) : null}

        {activeTab === "crosstable" ? <GameMatchCrosstable game={game} embedded /> : null}

        {activeTab === "share" ? (
          <div className="gameSharePanel">
            <div className="gameShareActions">
              <CopyButton
                label="Copy link"
                value={typeof window === "undefined" ? "" : window.location.href}
              />
              <CopyButton label="Copy PGN" value={pgn} />
              <button type="button" onClick={downloadPgn} disabled={!pgn}>
                Download PGN
              </button>
            </div>
            <DocumentField label="FEN" rows={2} field={document.fen} />
            <DocumentField label="PGN" rows={4} field={document.pgn} />
          </div>
        ) : null}
      </div>
    </section>
  );
};
