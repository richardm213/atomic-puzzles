import { faGear, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { ComponentProps, KeyboardEventHandler, PointerEventHandler, ReactNode } from "react";

import { OpeningDatabaseDisplay } from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";

type OpeningExplorerPanelProps = {
  ariaLabel: string;
  children?: ReactNode;
  className: string;
  displayProps?: ComponentProps<typeof OpeningDatabaseDisplay> | undefined;
  tableClassName: string;
};

const classNames = (...names: string[]): string => [...new Set(names.filter(Boolean))].join(" ");

export const OpeningExplorerPanel = ({
  ariaLabel,
  children,
  className,
  displayProps,
  tableClassName,
}: OpeningExplorerPanelProps) => (
  <section className={classNames("analysisOpeningExplorer", className)} aria-label={ariaLabel}>
    {children}
    {displayProps ? (
      <div className={classNames("analysisExplorerTableWrap", tableClassName)}>
        <OpeningDatabaseDisplay {...displayProps} />
      </div>
    ) : null}
  </section>
);

export const OpeningExplorerCompactHeader = ({
  children,
  controlsId,
  onSettingsToggle,
  settingsOpen,
  settingsTitle = "Opening explorer settings",
  tabListLabel = "Opening explorer source",
}: {
  children: ReactNode;
  controlsId: string;
  onSettingsToggle: () => void;
  settingsOpen: boolean;
  settingsTitle?: string;
  tabListLabel?: string;
}) => (
  <div className="analysisExplorerCompactHeader">
    <div className="analysisExplorerTabs" role="tablist" aria-label={tabListLabel}>
      {children}
    </div>
    <button
      type="button"
      className={`analysisFilterToggle ${settingsOpen ? "open" : ""}`}
      aria-expanded={settingsOpen}
      aria-controls={controlsId}
      aria-label={settingsOpen ? `Close ${settingsTitle}` : settingsTitle}
      title={settingsOpen ? "Close settings" : "Settings"}
      onClick={onSettingsToggle}
    >
      <FontAwesomeIcon icon={settingsOpen ? faXmark : faGear} />
    </button>
  </div>
);

type OpeningExplorerResizeHandleProps = {
  onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  valueNow: number;
};

export const OpeningExplorerResizeHandle = ({
  onKeyDown,
  onPointerDown,
  valueNow,
}: OpeningExplorerResizeHandleProps) => (
  // A focusable separator is the native interaction model for this resize control.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
  <div
    className="analysisExplorerResizeHandle"
    role="separator"
    tabIndex={0}
    aria-orientation="horizontal"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={valueNow}
    aria-label="Resize moves and opening explorer"
    title="Resize moves and opening explorer"
    onPointerDown={onPointerDown}
    onKeyDown={onKeyDown}
  />
);
