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

  it("calls onPageChange with the next page when Next is clicked", async () => {
    const handleChange = vi.fn();
    render(<PaginationRow currentPage={2} totalPages={5} onPageChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(handleChange).toHaveBeenCalledWith(3);
  });

  it("opens an editable jump input when the page label is clicked", async () => {
    const handleChange = vi.fn();
    render(<PaginationRow currentPage={2} totalPages={9} onPageChange={handleChange} />);

    await userEvent.click(screen.getByRole("button", { name: /Current page 2/ }));
    const input = screen.getByRole("spinbutton");
    expect(input).toBeInTheDocument();

    await userEvent.clear(input);
    await userEvent.type(input, "5");
    await userEvent.tab(); // commit on blur

    expect(handleChange).toHaveBeenCalledWith(5);
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
