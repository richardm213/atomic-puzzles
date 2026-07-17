import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  clearStoredLichessSession: vi.fn(),
  completeLichessLogin: vi.fn(),
  restoreLichessSession: vi.fn(),
  revokeLichessSession: vi.fn(),
  clearAuthenticatedSiteSession: vi.fn(),
}));

vi.mock("../lib/auth/lichessAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/auth/lichessAuth")>();
  return {
    ...actual,
    clearStoredLichessSession: authMocks.clearStoredLichessSession,
    completeLichessLogin: authMocks.completeLichessLogin,
    restoreLichessSession: authMocks.restoreLichessSession,
    revokeLichessSession: authMocks.revokeLichessSession,
  };
});

vi.mock("../lib/auth/siteSession", () => ({
  clearAuthenticatedSiteSession: authMocks.clearAuthenticatedSiteSession,
}));

import {
  LICHESS_SESSION_INVALID_EVENT,
  LICHESS_SESSION_STORAGE_KEY,
  type LichessSession,
} from "../lib/auth/lichessAuth";
import { AuthProvider, useAuth } from "./AuthContext";

const savedSession: LichessSession = {
  accessToken: "saved_token",
  expiresAt: null,
  me: { username: "SavedViewer" },
};

const AuthProbe = () => {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="status">{auth.status}</span>
      <span data-testid="username">{auth.user?.username ?? "none"}</span>
      <button type="button" onClick={() => void auth.finishLogin("?callback").catch(() => {})}>
        Finish login
      </button>
      <button type="button" onClick={() => void auth.logout()}>
        Log out
      </button>
    </div>
  );
};

const renderAuth = () =>
  render(
    <AuthProvider>
      <AuthProbe />
    </AuthProvider>,
  );

describe("AuthProvider session resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMocks.restoreLichessSession.mockResolvedValue(null);
    authMocks.revokeLichessSession.mockResolvedValue(undefined);
    authMocks.clearAuthenticatedSiteSession.mockResolvedValue(undefined);
  });

  it("restores an existing login after the app reloads", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);

    renderAuth();

    expect(await screen.findByText("SavedViewer")).toBeVisible();
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(authMocks.restoreLichessSession).toHaveBeenCalledOnce();
  });

  it("keeps the current login when a callback retry fails", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);
    authMocks.completeLichessLogin.mockRejectedValue(new Error("Lichess is temporarily busy."));
    renderAuth();
    await screen.findByText("SavedViewer");

    fireEvent.click(screen.getByRole("button", { name: "Finish login" }));

    await waitFor(() => expect(authMocks.completeLichessLogin).toHaveBeenCalledOnce());
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("username")).toHaveTextContent("SavedViewer");
    expect(authMocks.clearStoredLichessSession).not.toHaveBeenCalled();
  });

  it("applies the server-verified session returned by a successful callback", async () => {
    authMocks.completeLichessLogin.mockResolvedValue({
      session: savedSession,
      returnTo: "/comments",
    });
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));

    fireEvent.click(screen.getByRole("button", { name: "Finish login" }));

    expect(await screen.findByText("SavedViewer")).toBeVisible();
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });

  it("adopts a login created in another browser tab", async () => {
    renderAuth();
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LICHESS_SESSION_STORAGE_KEY,
          newValue: JSON.stringify(savedSession),
        }),
      );
    });

    expect(await screen.findByText("SavedViewer")).toBeVisible();
    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
  });

  it("synchronizes an intentional logout from another tab without an invalid-session warning", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);
    renderAuth();
    await screen.findByText("SavedViewer");

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: LICHESS_SESSION_STORAGE_KEY, newValue: null }),
      );
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(screen.getByTestId("username")).toHaveTextContent("none");
  });

  it("ignores unrelated local-storage changes", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);
    renderAuth();
    await screen.findByText("SavedViewer");
    authMocks.restoreLichessSession.mockClear();

    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key: "unrelated-setting", newValue: "1" }),
      );
    });

    expect(screen.getByTestId("status")).toHaveTextContent("authenticated");
    expect(screen.getByTestId("username")).toHaveTextContent("SavedViewer");
    expect(authMocks.restoreLichessSession).not.toHaveBeenCalled();
  });

  it("logs out when an authenticated request explicitly announces an invalid session", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);
    renderAuth();
    await screen.findByText("SavedViewer");

    act(() => {
      window.dispatchEvent(new Event(LICHESS_SESSION_INVALID_EVENT));
    });

    expect(screen.getByTestId("status")).toHaveTextContent("anonymous");
    expect(authMocks.clearStoredLichessSession).toHaveBeenCalled();
  });

  it("stays logged out even if remote token revocation is unavailable", async () => {
    authMocks.restoreLichessSession.mockResolvedValue(savedSession);
    authMocks.revokeLichessSession.mockRejectedValue(new Error("network unavailable"));
    renderAuth();
    await screen.findByText("SavedViewer");

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anonymous"));
    expect(authMocks.clearStoredLichessSession).toHaveBeenCalled();
    expect(authMocks.clearAuthenticatedSiteSession).toHaveBeenCalled();
  });
});
