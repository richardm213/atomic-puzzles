import type { ReactNode, Ref } from "react";

const classNames = (...names: Array<string | undefined>): string => names.filter(Boolean).join(" ");

type AnalysisEngineExplorerPanelsProps = {
  engine: ReactNode;
  explorer?: ReactNode;
  continuationChoices?: ReactNode;
  moveContent: ReactNode;
  moveContentRef?: Ref<HTMLDivElement>;
  movePanelAriaLabel?: string;
  movePanelClassName?: string;
  movePanelRef?: Ref<HTMLDivElement>;
};

const AnalysisExplorerStack = ({
  continuationChoices,
  explorer,
}: {
  continuationChoices: ReactNode;
  explorer: ReactNode;
}) => (
  <div className="analysisExplorerStack">
    {continuationChoices}
    {explorer}
  </div>
);

/** Shared engine-first stack used by analysis, game analysis, and practice. */
export const AnalysisEngineExplorerPanels = ({
  engine,
  explorer,
  continuationChoices,
  moveContent,
  moveContentRef,
  movePanelAriaLabel,
  movePanelClassName,
  movePanelRef,
}: AnalysisEngineExplorerPanelsProps) => (
  <>
    <div
      ref={movePanelRef}
      className={classNames("analysisMovePanel", movePanelClassName)}
      aria-label={movePanelAriaLabel}
      role={movePanelAriaLabel ? "region" : undefined}
    >
      {engine}
      <div ref={moveContentRef} className="analysisMoveContent">
        {moveContent}
      </div>
    </div>
    {explorer && continuationChoices ? (
      <AnalysisExplorerStack continuationChoices={continuationChoices} explorer={explorer} />
    ) : (
      (explorer ?? continuationChoices)
    )}
  </>
);
