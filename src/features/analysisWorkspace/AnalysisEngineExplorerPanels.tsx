import type { ReactNode, Ref } from "react";

const classNames = (...names: Array<string | undefined>): string => names.filter(Boolean).join(" ");

type AnalysisEngineExplorerPanelsProps = {
  engine: ReactNode;
  explorer?: ReactNode;
  moveContent: ReactNode;
  moveContentRef?: Ref<HTMLDivElement>;
  movePanelAriaLabel?: string;
  movePanelClassName?: string;
  movePanelRef?: Ref<HTMLDivElement>;
};

/** Shared engine-first stack used by analysis, game analysis, and practice. */
export const AnalysisEngineExplorerPanels = ({
  engine,
  explorer,
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
    {explorer}
  </>
);
