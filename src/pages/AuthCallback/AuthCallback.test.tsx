import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LichessAuthError } from "../../lib/auth/lichessAuth";
import { AuthCallbackPage } from "./AuthCallback";

const authMocks = vi.hoisted(() => ({
  finishLogin: vi.fn(),
  login: vi.fn(),
  clearPostLoginRedirect: vi.fn(),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({
    finishLogin: authMocks.finishLogin,
    login: authMocks.login,
    getPostLoginRedirect: () => "/comments",
    clearPostLoginRedirect: authMocks.clearPostLoginRedirect,
  }),
}));

describe("AuthCallbackPage", () => {
  beforeEach(() => {
    authMocks.finishLogin.mockReset();
    authMocks.login.mockReset();
    authMocks.clearPostLoginRedirect.mockReset();
    window.history.replaceState({}, "", "/auth/lichess/callback?code=stale&state=old");
  });

  it("shows stale-code recovery instead of remaining stuck in Strict Mode", async () => {
    authMocks.finishLogin.mockRejectedValue(
      new LichessAuthError(
        "code_rejected",
        "This Lichess login code is stale or has already been used. Start a new login.",
      ),
    );

    render(
      <StrictMode>
        <AuthCallbackPage />
      </StrictMode>,
    );

    expect(await screen.findByRole("heading", { name: "Login needs attention" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start a new Lichess login" })).toBeVisible();
    expect(window.location.search).toBe("");
    expect(authMocks.finishLogin).toHaveBeenCalledOnce();
  });
});
