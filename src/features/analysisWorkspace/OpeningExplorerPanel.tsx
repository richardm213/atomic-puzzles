import type { ComponentProps, KeyboardEventHandler, PointerEventHandler, ReactNode } from "react";

import { OpeningDatabaseDisplay } from "../../components/OpeningDatabaseDisplay/OpeningDatabaseDisplay";

type OpeningExplorerPanelProps = {
  ariaLabel: string;
  children?: ReactNode;
  className: string;
  displayProps?: ComponentProps<typeof OpeningDatabaseDisplay> | undefined;
  tableClassName: string;
};

export const OpeningExplorerPanel = ({
  ariaLabel,
  children,
  className,
  displayProps,
  tableClassName,
}: OpeningExplorerPanelProps) => (
  <section className={className} aria-label={ariaLabel}>
    {children}
    {displayProps ? (
      <div className={tableClassName}>
        <OpeningDatabaseDisplay {...displayProps} />
      </div>
    ) : null}
  </section>
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
