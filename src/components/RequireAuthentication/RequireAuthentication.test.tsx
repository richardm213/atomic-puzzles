import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => auth,
}));

import { RequireAuthentication } from "./RequireAuthentication";

describe("RequireAuthentication", () => {
  beforeEach(() => {
    auth.isAuthenticated = false;
    auth.isLoading = false;
    auth.login.mockReset();
    window.history.replaceState({}, "", "/solve/42?set=recent#board");
  });

  it("keeps protected puzzle content unavailable until the user logs in", () => {
    const { rerender } = render(
      <RequireAuthentication>
        <div>Protected puzzle</div>
      </RequireAuthentication>,
    );

    expect(screen.queryByText("Protected puzzle")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Log in with Lichess" }));
    expect(auth.login).toHaveBeenCalledWith("/solve/42?set=recent#board");

    auth.isAuthenticated = true;
    rerender(
      <RequireAuthentication>
        <div>Protected puzzle</div>
      </RequireAuthentication>,
    );
    expect(screen.getByText("Protected puzzle")).toBeVisible();
  });
});
