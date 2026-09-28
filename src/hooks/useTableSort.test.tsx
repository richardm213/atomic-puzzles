import { act, renderHook } from "@testing-library/react";

import { useTableSort } from "./useTableSort";

describe("useTableSort", () => {
  it("toggles the active column and applies defaults to a new column", () => {
    const { result } = renderHook(() =>
      useTableSort({
        initialKey: "score" as "player" | "score",
        initialDirection: "desc",
        getDefaultDirection: (key) => (key === "player" ? "asc" : "desc"),
      }),
    );

    act(() => result.current.changeSort("score"));
    expect(result.current.sortDirection).toBe("asc");

    act(() => result.current.changeSort("player"));
    expect(result.current.sortKey).toBe("player");
    expect(result.current.sortDirection).toBe("asc");
  });

  it("can reverse the current direction without changing columns", () => {
    const { result } = renderHook(() =>
      useTableSort({ initialKey: "upvotes", initialDirection: "desc" }),
    );

    act(() => result.current.toggleDirection());
    expect(result.current.sortKey).toBe("upvotes");
    expect(result.current.sortDirection).toBe("asc");
  });
});
