import { useCallback, useEffect, useRef, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import { LichessAuthError } from "../../lib/auth/lichessAuth";

const resolveFallbackPath = () => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export const AuthCallbackPage = () => {
  const {
    finishLogin,
    login,
    getPostLoginRedirect,
    clearPostLoginRedirect,
  } = useAuth();
  const [message, setMessage] = useState("Finishing your Lichess login...");
  const [phase, setPhase] = useState<"authorizing" | "error">("authorizing");
  const [canRetryCallback, setCanRetryCallback] = useState(false);
  const hasStartedRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const callbackSearchRef = useRef(window.location.search);

  const runCallback = useCallback(async (): Promise<void> => {
    setPhase("authorizing");
    setCanRetryCallback(false);
    setMessage("Finishing your Lichess login...");

    try {
      const nextLocation = await finishLogin(callbackSearchRef.current);
      setMessage("Login complete. Redirecting...");
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        clearPostLoginRedirect();
        window.location.replace(nextLocation || resolveFallbackPath());
      }
    } catch (error) {
      const authError = error instanceof LichessAuthError ? error : null;
      setPhase("error");
      setCanRetryCallback(Boolean(authError?.canRetryCallback));
      setMessage(
        error instanceof Error
          ? error.message
          : "Lichess login could not be completed. Start a new login.",
      );

      // Authorization codes are sensitive and single-use. Keep a private copy
      // for an in-page network retry, but remove it from the visible URL/history.
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, [clearPostLoginRedirect, finishLogin]);

  useEffect(() => {
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;
    void runCallback();
    return undefined;
  }, [runCallback]);

  const startFreshLogin = (): void => {
    const returnTo = getPostLoginRedirect() || resolveFallbackPath();
    void login(returnTo);
  };

  return (
    <div className="rankingsPage">
      <Seo
        title="Lichess Login"
        description="Finish Lichess login for Atomic Puzzles."
        path="/auth/lichess/callback"
        robots="noindex,nofollow"
      />
      <section className="panel" aria-live="polite">
        <span className="statusLabel">Lichess Login</span>
        <h1>{phase === "authorizing" ? "Authorizing" : "Login needs attention"}</h1>
        <p>{message}</p>
        {phase === "error" ? (
          <div className="matchFilterActions">
            {canRetryCallback ? (
              <button type="button" onClick={() => void runCallback()}>
                Retry
              </button>
            ) : null}
            <button type="button" onClick={startFreshLogin}>
              Start a new Lichess login
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
};
