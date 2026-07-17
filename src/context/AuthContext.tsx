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
  completeLichessLogin,
  getStoredPostLoginRedirect,
  LICHESS_SESSION_INVALID_EVENT,
  type LichessAccount,
  type LichessSession,
  restoreLichessSession,
  setStoredPostLoginRedirect,
  startLichessLogin,
} from "../lib/auth/lichessAuth";
import { clearAuthenticatedSiteSession } from "../lib/auth/siteSession";

type AuthStatus = "loading" | "authenticated" | "anonymous";

export type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: LichessAccount | null;
  login: (returnTo: string) => Promise<void>;
  finishLogin: (search: string) => Promise<string>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<LichessSession | null>(null);
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
      } catch {
        if (cancelled) return;
        clearStoredLichessSession();
        applySession(null);
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
    };
    window.addEventListener(LICHESS_SESSION_INVALID_EVENT, clearInvalidSession);
    return () => {
      window.removeEventListener(LICHESS_SESSION_INVALID_EVENT, clearInvalidSession);
    };
  }, [applySession]);

  const login = useCallback(async (returnTo: string) => {
    setStoredPostLoginRedirect(returnTo);
    await startLichessLogin(returnTo);
  }, []);

  const finishLogin = useCallback(
    async (search: string): Promise<string> => {
      setStatus("loading");
      try {
        const result = await completeLichessLogin(search);
        applySession(result.session);
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
        throw loginError;
      }
    },
    [applySession],
  );

  const logout = useCallback(async (): Promise<void> => {
    clearStoredLichessSession();
    applySession(null);
    await clearAuthenticatedSiteSession();
  }, [applySession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === "authenticated" && Boolean(session?.me),
      isLoading: status === "loading",
      user: session?.me ?? null,
      login,
      finishLogin,
      logout,
    }),
    [finishLogin, login, logout, session, status],
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
