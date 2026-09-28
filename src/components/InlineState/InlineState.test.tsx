import { render, screen } from "@testing-library/react";

import { InlineState } from "./InlineState";

describe("InlineState", () => {
  it("announces errors and applies the error treatment", () => {
    render(<InlineState kind="error">Unable to load players.</InlineState>);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load players.");
    expect(screen.getByRole("alert")).toHaveClass("inlineState--error");
  });

  it("keeps empty states quiet unless a role is requested", () => {
    render(<InlineState kind="empty">No players found.</InlineState>);

    expect(screen.getByText("No players found.")).not.toHaveAttribute("role");
  });

  it("preserves caller classes and attributes", () => {
    render(
      <InlineState kind="info" className="customState" aria-live="polite">
        Loading aliases…
      </InlineState>,
    );

    expect(screen.getByText("Loading aliases…")).toHaveClass("inlineState--info", "customState");
    expect(screen.getByText("Loading aliases…")).toHaveAttribute("aria-live", "polite");
  });
});
