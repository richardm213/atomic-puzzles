import { fireEvent, render, screen } from "@testing-library/react";

import { AnalysisToolbar } from "./AnalysisToolbar";
import { AnalysisWorkspaceLayout, AnalysisWorkspacePanel } from "./AnalysisWorkspaceLayout";
import { OpeningExplorerPanel, OpeningExplorerResizeHandle } from "./OpeningExplorerPanel";

describe("analysis workspace", () => {
  it("provides the shared layout and panel classes", () => {
    render(
      <AnalysisWorkspaceLayout className="practicePage" aria-label="Workspace">
        <AnalysisWorkspacePanel className="practicePanel" aria-label="Controls" />
      </AnalysisWorkspaceLayout>,
    );

    expect(screen.getByRole("region", { name: "Workspace" })).toHaveClass(
      "analysisPage",
      "practicePage",
    );
    expect(screen.getByRole("complementary", { name: "Controls" })).toHaveClass(
      "analysisPanel",
      "practicePanel",
    );
  });

  it("shares explorer toggle and playback behavior", () => {
    const onNavigate = vi.fn();
    const onToggle = vi.fn();
    render(
      <AnalysisToolbar
        active
        ariaLabel="Analysis menu"
        canStepBack={false}
        canStepForward
        onNavigate={onNavigate}
        onToggle={onToggle}
        toggleAriaLabel="Hide opening explorer"
        toggleTitle="Opening explorer"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Hide opening explorer" }));
    fireEvent.click(screen.getByRole("button", { name: "Next move" }));

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("next");
    expect(screen.getByRole("button", { name: "Previous move" })).toBeDisabled();
  });

  it("renders the shared explorer display and accessible resize handle", () => {
    const onKeyDown = vi.fn();
    const onPointerDown = vi.fn();
    render(
      <OpeningExplorerPanel
        ariaLabel="Opening explorer"
        className="analysisExplorerPanel"
        tableClassName="analysisExplorerTableWrap"
        displayProps={{
          moves: [],
          recentGames: [],
          status: "ready",
          error: "",
          emptyMessage: "No database games for this position.",
          showPerformance: false,
          orientation: "white",
          currentPly: 0,
          onPlayMove: vi.fn(),
          onHoverMove: vi.fn(),
        }}
      >
        <OpeningExplorerResizeHandle
          valueNow={32}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
        />
      </OpeningExplorerPanel>,
    );

    expect(screen.getByRole("region", { name: "Opening explorer" })).toHaveClass(
      "analysisExplorerPanel",
    );
    expect(screen.getByText("No database games for this position.")).toBeVisible();
    expect(
      screen.getByRole("separator", { name: "Resize moves and opening explorer" }),
    ).toHaveAttribute("aria-valuenow", "32");
  });
});
