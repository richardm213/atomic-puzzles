import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  AtomicDbEngine,
  AtomicDbEngineControls,
} from "../../components/AtomicDbEngine/AtomicDbEngine";
import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";
import { useBoardActionShortcuts } from "../../hooks/useBoardActionShortcuts";
import { selectSpacebarMove } from "../../utils/boardMoveSelection";

type AtomicDbAnalysisBlockProps = {
  analysis: AtomicDbAnalysisState;
  beforeSettings?: ReactNode;
  additionalSettings?: ReactNode;
  disabled?: boolean;
  fen: string;
  notationInline?: boolean;
  onDisable: () => void;
  onFlipBoard?: () => void;
  onHoverMove: (uci: string | null) => void;
  onPlayLine: (ucis: string[]) => void;
  onThreatModeChange?: (enabled: boolean) => void;
  onToggleNotation?: () => void;
  setSettings: Dispatch<SetStateAction<AtomicDbEngineSettings>>;
  settings: AtomicDbEngineSettings;
  threatAvailable?: boolean;
  threatMode?: boolean;
};

export const AtomicDbAnalysisBlock = ({
  analysis,
  beforeSettings,
  additionalSettings,
  disabled,
  fen,
  notationInline,
  onDisable,
  onFlipBoard,
  onHoverMove,
  onPlayLine,
  onThreatModeChange,
  onToggleNotation,
  setSettings,
  settings,
  threatAvailable,
  threatMode,
}: AtomicDbAnalysisBlockProps) => {
  useBoardActionShortcuts({
    playBestMove: () => {
      if (!settings.enabled || threatMode || disabled) return false;
      const move = selectSpacebarMove({
        engineEnabled: true,
        engineResult: analysis.result,
        engineStatus: analysis.status,
        databaseMoves: [],
        databaseStatus: "idle",
        fen,
      });
      if (move) onPlayLine([move]);
    },
  });
  return (
    <div
      className="analysisEngineBlock"
      onPointerDownCapture={() => onHoverMove(null)}
      onPointerLeave={() => onHoverMove(null)}
    >
      <AtomicDbEngineControls
        beforeSettings={beforeSettings}
        additionalSettings={additionalSettings}
        fen={fen}
        analysis={analysis}
        settings={settings}
        setSettings={setSettings}
        onDisable={onDisable}
        {...(onFlipBoard ? { onFlipBoard } : {})}
        {...(onThreatModeChange ? { onThreatModeChange } : {})}
        {...(threatAvailable === undefined ? {} : { threatAvailable })}
        {...(threatMode === undefined ? {} : { threatMode })}
        {...(notationInline === undefined ? {} : { notationInline })}
        {...(onToggleNotation ? { onToggleNotation } : {})}
      />
      <AtomicDbEngine
        fen={fen}
        settings={settings}
        analysis={analysis}
        onPlayLine={onPlayLine}
        onHoverMove={onHoverMove}
        {...(disabled === undefined ? {} : { disabled })}
        {...(threatMode === undefined ? {} : { threatMode })}
      />
    </div>
  );
};
