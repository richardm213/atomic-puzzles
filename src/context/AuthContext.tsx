import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  clearStoredLichessSession,
  clearStoredPostLoginRedirect,
  completeLichessLogin,
  getLichessAuthDebugSnapshot,
  getStoredPostLoginRedirect,
  LICHESS_SESSION_INVALID_EVENT,
  LICHESS_SESSION_STORAGE_KEY,
  type LichessAccount,
  type LichessSession,
  restoreLichessSession,
  revokeLichessSession,
  setStoredPostLoginRedirect,
  startLichessLogin,
} from "../lib/auth/lichessAuth";
import { registerAuthenticatedSiteUser } from "../lib/auth/siteSession";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthDebugSnapshot = ReturnType<typeof getLichessAuthDebugSnapshot>;

export type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: LichessAccount | null;
  accessToken: string;
  error: string;
  login: (returnTo: string) => Promise<void>;
  finishLogin: (search: string) => Promise<string>;
  logout: () => Promise<void>;
  clearError: () => void;
  getAccessToken: () => string;
  getDebugSnapshot: () => AuthDebugSnapshot;
  getPostLoginRedirect: () => string;
  clearPostLoginRedirect: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<LichessSession | null>(null);
  const [error, setError] = useState("");
  const sessionRef = useRef<LichessSession | null>(null);

  const applySession = useCallback((nextSession: LichessSession | null): void => {
    sessionRef.current = nextSession;
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "anonymous");
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async (): Promise<void> => {
      try {
        const restoredSession = await restoreLichessSession();
        if (cancelled) return;
        applySession(restoredSession);
      } catch (restoreError) {
        if (cancelled) return;
        clearStoredLichessSession();
        applySession(null);
        setError(restoreError instanceof Error ? restoreError.message : "Unable to restore login.");
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    const clearInvalidSession = (): void => {
      clearStoredLichessSession();
      applySession(null);
      setError("Your Lichess login is no longer valid. Please log in again.");
    };
    const handleStorage = (event: StorageEvent): void => {
      if (event.key !== LICHESS_SESSION_STORAGE_KEY) return;

      if (event.newValue === null) {
        clearStoredLichessSession();
        applySession(null);
        setError("");
        return;
      }

      void restoreLichessSession()
        .then((restoredSession) => {
          applySession(restoredSession);
          setError("");
        })
        .catch(() => {
          clearInvalidSession();
        });
    };

    window.addEventListener(LICHESS_SESSION_INVALID_EVENT, clearInvalidSession);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(LICHESS_SESSION_INVALID_EVENT, clearInvalidSession);
      window.removeEventListener("storage", handleStorage);
    };
  }, [applySession]);

  const clearError = useCallback(() => {
    setError("");
  }, []);

  const login = useCallback(async (returnTo: string) => {
    setError("");
    setStoredPostLoginRedirect(returnTo);
    await startLichessLogin(returnTo);
  }, []);

  const finishLogin = useCallback(async (search: string): Promise<string> => {
    setStatus("loading");
    setError("");
    try {
      const result = await completeLichessLogin(search);
      applySession(result.session);
      // Site registration is verified again server-side from the bearer token.
      // The browser never gets to choose which username is registered.
      void registerAuthenticatedSiteUser(result.session.accessToken).catch(() => undefined);
      const redirectPath = result.returnTo || getStoredPostLoginRedirect();
      setStoredPostLoginRedirect(redirectPath);
      return redirectPath;
    } catch (loginError) {
      const existingSession = sessionRef.current;
      if (existingSession) {
        applySession(existingSession);
      } else {
        clearStoredLichessSession();
        applySession(null);
      }
      const message = loginError instanceof Error ? loginError.message : "Unable to finish login.";
      setError(message);
      throw loginError;
    }
  }, [applySession]);

  const logout = useCallback(async (): Promise<void> => {
    const accessToken = sessionRef.current?.accessToken ?? "";
    clearStoredLichessSession();
    applySession(null);
    setError("");
    try {
      await revokeLichessSession(accessToken);
    } catch {
      // Keep logout resilient even if token revocation fails.
    }
  }, [applySession]);

  const getAccessToken = useCallback((): string => sessionRef.current?.accessToken ?? "", []);

  const getDebugSnapshot = useCallback(() => getLichessAuthDebugSnapshot(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === "authenticated" && Boolean(session?.me),
      isLoading: status === "loading",
      user: session?.me ?? null,
      accessToken: session?.accessToken ?? "",
      error,
      login,
      finishLogin,
      logout,
      clearError,
      getAccessToken,
      getDebugSnapshot,
      getPostLoginRedirect: getStoredPostLoginRedirect,
      clearPostLoginRedirect: clearStoredPostLoginRedirect,
    }),
    [clearError, error, finishLogin, getAccessToken, getDebugSnapshot, login, logout, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
};
