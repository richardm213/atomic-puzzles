import "./PuzzleComposer.css";

import type { ReactNode } from "react";

import { CommentEditor } from "../../components/CommentEditor/CommentEditor";
import { PuzzleMotifsPanel } from "../../components/PuzzleMotifsPanel/PuzzleMotifsPanel";

export const OPA_STYLE_DESCRIPTION =
  "Only the best moves are accepted. Weaker alternatives are rejected even if they also lead to mate.";

type PuzzleDraftMetadata = {
  opaStyle?: boolean;
  explanation: string;
  tags?: string[];
};

export const PuzzleDraftField = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="boardPuzzleComposerField">
    <span>{label}</span>
    {children}
  </label>
);

export const PuzzleDraftFields = ({
  value,
  disabled,
  onChange,
  children,
}: {
  value: PuzzleDraftMetadata;
  disabled: boolean;
  onChange: (changes: Partial<PuzzleDraftMetadata>) => void;
  children?: ReactNode;
}) => {
  return (
    <div className="boardPuzzleComposerMetadata">
      {children}
      <label className="boardPuzzleComposerCheckbox" title={OPA_STYLE_DESCRIPTION}>
        <input
          type="checkbox"
          checked={value.opaStyle === true}
          onChange={(event) => onChange({ opaStyle: event.target.checked })}
          disabled={disabled}
        />
        OPA style
      </label>
      <div className="boardPuzzleComposerField">
        <span>Explanation</span>
        <CommentEditor
          aria-label="Explanation"
          maxLength={5000}
          value={value.explanation}
          onValueChange={(explanation) => onChange({ explanation })}
          readOnly={disabled}
        />
      </div>
      <PuzzleMotifsPanel
        visible
        tags={value.tags ?? []}
        canManage={!disabled}
        onUpdate={(tags) => onChange({ tags })}
      />
    </div>
  );
};
