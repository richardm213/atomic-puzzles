import "./AnalysisWorkspace.css";

import { type ComponentPropsWithoutRef,forwardRef } from "react";

const classNames = (...names: Array<string | undefined>): string => names.filter(Boolean).join(" ");

type AnalysisWorkspaceLayoutProps = ComponentPropsWithoutRef<"section">;

export const AnalysisWorkspaceLayout = ({ className, ...props }: AnalysisWorkspaceLayoutProps) => (
  <section className={classNames("analysisPage", className)} {...props} />
);

type AnalysisWorkspacePanelProps = ComponentPropsWithoutRef<"aside">;

export const AnalysisWorkspacePanel = forwardRef<HTMLElement, AnalysisWorkspacePanelProps>(
  ({ className, ...props }, ref) => (
    <aside ref={ref} className={classNames("analysisPanel", className)} {...props} />
  ),
);

AnalysisWorkspacePanel.displayName = "AnalysisWorkspacePanel";
