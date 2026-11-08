import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PaginationRow } from "./PaginationRow";

describe("PaginationRow", () => {
  it("disables Previous on the first page and Next on the last page", () => {
    const { rerender } = render(
      <PaginationRow currentPage={1} totalPages={3} onPageChange={() => {}} />,
    );
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).not.toBeDisabled();

    rerender(<PaginationRow currentPage={3} totalPages={3} onPageChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Previous" })).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("clamps the entered page into [1, totalPages]", async () => {
    const handleChange = vi.fn();
    render(<PaginationRow currentPage={2} totalPages={4} onPageChange={handleChange} />);

    await userEvent.click(screen.getByRole("button", { name: /Current page 2/ }));
    const input = screen.getByRole("spinbutton");
    await userEvent.clear(input);
    await userEvent.type(input, "99");
    await userEvent.tab();

    expect(handleChange).toHaveBeenCalledWith(4);
  });
});
