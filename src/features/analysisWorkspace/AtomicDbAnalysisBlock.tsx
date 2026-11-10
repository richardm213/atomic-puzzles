import type { Dispatch, ReactNode, SetStateAction } from "react";

import {
  AtomicDbEngine,
  AtomicDbEngineControls,
} from "../../components/AtomicDbEngine/AtomicDbEngine";
import type { AtomicDbAnalysisState } from "../../hooks/useAtomicDbAnalysis";
import type { AtomicDbEngineSettings } from "../../hooks/useAtomicDbEngineSettings";

type AtomicDbAnalysisBlockProps = {
  analysis: AtomicDbAnalysisState;
  beforeSettings?: ReactNode;
  disabled?: boolean;
  fen: string;
  notationInline?: boolean;
  onDisable: () => void;
  onFlipBoard?: () => void;
  onHoverMove: (uci: string | null) => void;
  onPlayLine: (ucis: string[]) => void;
  reserveLines?: boolean;
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
  disabled,
  fen,
  notationInline,
  onDisable,
  onFlipBoard,
  onHoverMove,
  onPlayLine,
  reserveLines,
  onThreatModeChange,
  onToggleNotation,
  setSettings,
  settings,
  threatAvailable,
  threatMode,
}: AtomicDbAnalysisBlockProps) => (
  <div
    className="analysisEngineBlock"
    onPointerDownCapture={() => onHoverMove(null)}
    onPointerLeave={() => onHoverMove(null)}
  >
    <AtomicDbEngineControls
      beforeSettings={beforeSettings}
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
      {...(reserveLines === undefined ? {} : { reserveLines })}
      {...(threatMode === undefined ? {} : { threatMode })}
    />
  </div>
);
