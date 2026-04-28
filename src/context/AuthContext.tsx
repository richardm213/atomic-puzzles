import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  clearStoredPostLoginRedirect,
  clearStoredLichessSession,
  completeLichessLogin,
  getLichessAuthDebugSnapshot,
  getStoredPostLoginRedirect,
  restoreLichessSession,
  revokeLichessSession,
  setStoredPostLoginRedirect,
  startLichessLogin,
  type LichessAccount,
  type LichessSession,
} from "../lib/auth/lichessAuth";
import { ensureSupabaseUser } from "../lib/supabase/supabaseUsers";

type AuthStatus = "loading" | "authenticated" | "anonymous";

type AuthDebugSnapshot = ReturnType<typeof getLichessAuthDebugSnapshot>;

export type AuthContextValue = {
  status: AuthStatus;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: LichessAccount | null;
  error: string;
  login: (returnTo: string) => Promise<void>;
  finishLogin: (search: string) => Promise<string>;
  logout: () => Promise<void>;
  clearError: () => void;
  getDebugSnapshot: () => AuthDebugSnapshot;
  getPostLoginRedirect: () => string;
  clearPostLoginRedirect: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<LichessSession | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const restoreSession = async (): Promise<void> => {
      try {
        const restoredSession = await restoreLichessSession();
        if (cancelled) return;
        setSession(restoredSession);
        setStatus(restoredSession ? "authenticated" : "anonymous");
      } catch (restoreError) {
        if (cancelled) return;
        clearStoredLichessSession();
        setSession(null);
        setStatus("anonymous");
        setError(
          restoreError instanceof Error ? restoreError.message : "Unable to restore login.",
        );
      }
    };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

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
      if (result.session?.me?.username) {
        await ensureSupabaseUser(result.session.me.username);
      }
      setSession(result.session);
      setStatus("authenticated");
      const redirectPath = result.returnTo || getStoredPostLoginRedirect();
      setStoredPostLoginRedirect(redirectPath);
      return redirectPath;
    } catch (loginError) {
      clearStoredLichessSession();
      setSession(null);
      setStatus("anonymous");
      const message =
        loginError instanceof Error ? loginError.message : "Unable to finish login.";
      setError(message);
      throw loginError;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    const accessToken = session?.accessToken ?? "";
    clearStoredLichessSession();
    setSession(null);
    setStatus("anonymous");
    setError("");
    try {
      await revokeLichessSession(accessToken);
    } catch {
      // Keep logout resilient even if token revocation fails.
    }
  }, [session?.accessToken]);

  const getDebugSnapshot = useCallback(() => getLichessAuthDebugSnapshot(), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      isAuthenticated: status === "authenticated" && Boolean(session?.me),
      isLoading: status === "loading",
      user: session?.me ?? null,
      error,
      login,
      finishLogin,
      logout,
      clearError,
      getDebugSnapshot,
      getPostLoginRedirect: getStoredPostLoginRedirect,
      clearPostLoginRedirect: clearStoredPostLoginRedirect,
    }),
    [clearError, error, finishLogin, getDebugSnapshot, login, logout, session, status],
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
