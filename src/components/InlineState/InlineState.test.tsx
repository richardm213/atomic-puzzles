import { render, screen } from "@testing-library/react";

import { InlineState } from "./InlineState";

describe("InlineState", () => {
  it("announces errors", () => {
    render(<InlineState kind="error">Unable to load players.</InlineState>);

    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load players.");
  });
});
