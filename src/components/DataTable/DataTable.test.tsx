import { fireEvent, render, screen } from "@testing-library/react";

import { DataTable } from "./DataTable";
import { SortableTableHeader } from "./SortableTableHeader";

describe("table utilities", () => {
  it("renders the shared table shell and accessible sort state", () => {
    const onSort = vi.fn();
    render(
      <DataTable aria-label="Players" wrapperClassName="customWrap">
        <thead>
          <tr>
            <SortableTableHeader active direction="desc" label="Score" onSort={onSort} />
          </tr>
        </thead>
      </DataTable>,
    );

    expect(screen.getByRole("table", { name: "Players" })).toHaveClass("dataTable");
    expect(screen.getByRole("columnheader")).toHaveAttribute("aria-sort", "descending");
    expect(screen.getByRole("table").parentElement).toHaveClass("dataTableWrap", "customWrap");

    fireEvent.click(screen.getByRole("button", { name: "Score" }));
    expect(onSort).toHaveBeenCalledOnce();
  });
});
