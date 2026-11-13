import { chooseDatabaseMove } from "../utils/boardMoveSelection";
import type { AtomicDbAnalysisState } from "./useAtomicDbAnalysis";
import { type BoardActions, useBoardActionShortcuts } from "./useBoardActionShortcuts";

type Props = {
  enabled?: boolean;
  blocked: boolean;
  engineEnabled: boolean;
  moves: Array<{ uci: string; games: number }>;
  status: AtomicDbAnalysisState["status"];
  explorerOpen: boolean;
  onPlay: (uci: string) => void;
  onExplorer: () => void;
  onGameAnalysis?: () => void;
  onPause?: () => void;
  onAlternate?: () => void;
};

export const useWorkspaceShortcuts = ({
  enabled = true,
  blocked,
  engineEnabled,
  moves,
  status,
  explorerOpen,
  onPlay,
  onExplorer,
  onGameAnalysis,
  onPause,
  onAlternate,
}: Props) => {
  const actions: BoardActions = {
    toggleExplorer: onExplorer,
    ...(onGameAnalysis ? { toggleGameAnalysis: onGameAnalysis } : {}),
    ...(onPause ? { pausePractice: onPause } : {}),
    ...(onAlternate ? { alternatePracticeMove: onAlternate } : {}),
    playBestMove: () => {
      if (engineEnabled) return false;
      const move = status === "ready" ? chooseDatabaseMove(moves, "popular")?.uci : null;
      if (move) onPlay(move);
    },
  };
  for (let index = 1; index <= 9; index++) {
    actions[`explorerMove${index}` as keyof BoardActions] = () => {
      if (!explorerOpen || status !== "ready") return false;
      const move = moves[index - 1];
      if (!move) return false;
      onPlay(move.uci);
    };
  }
  useBoardActionShortcuts(actions, enabled && !blocked);
};
