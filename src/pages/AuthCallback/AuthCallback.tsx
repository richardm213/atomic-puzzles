import "./AuthCallback.css";

import { useCallback, useEffect, useRef, useState } from "react";

import { Seo } from "../../components/Seo/Seo";
import { useAuth } from "../../context/AuthContext";
import {
  clearStoredPostLoginRedirect,
  getStoredPostLoginRedirect,
  LichessAuthError,
} from "../../lib/auth/lichessAuth";

const resolveFallbackPath = () => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export const AuthCallbackPage = () => {
  const { finishLogin, login } = useAuth();
  const [message, setMessage] = useState("Finishing your Lichess login...");
  const [phase, setPhase] = useState<"authorizing" | "error">("authorizing");
  const [canRetryCallback, setCanRetryCallback] = useState(false);
  const [errorCode, setErrorCode] = useState<LichessAuthError["code"] | null>(null);
  const [retryWaitSeconds, setRetryWaitSeconds] = useState(0);
  const hasStartedRef = useRef(false);
  const hasRedirectedRef = useRef(false);
  const callbackSearchRef = useRef(window.location.search);

  const runCallback = useCallback(async (): Promise<void> => {
    setPhase("authorizing");
    setCanRetryCallback(false);
    setErrorCode(null);
    setRetryWaitSeconds(0);
    setMessage("Finishing your Lichess login...");

    try {
      const nextLocation = await finishLogin(callbackSearchRef.current);
      setMessage("Login complete. Redirecting...");
      if (!hasRedirectedRef.current) {
        hasRedirectedRef.current = true;
        clearStoredPostLoginRedirect();
        window.location.replace(nextLocation || resolveFallbackPath());
      }
    } catch (error) {
      const authError = error instanceof LichessAuthError ? error : null;
      setPhase("error");
      setCanRetryCallback(Boolean(authError?.canRetryCallback));
      setErrorCode(authError?.code ?? null);
      setRetryWaitSeconds(Math.ceil((authError?.retryAfterMs ?? 0) / 1000));
      setMessage(
        error instanceof Error
          ? error.message
          : "Lichess login could not be completed. Start a new login.",
      );

      // Authorization codes are sensitive and single-use. Keep a private copy
      // for an in-page network retry, but remove it from the visible URL/history.
      window.history.replaceState({}, "", `${window.location.pathname}${window.location.hash}`);
    }
  }, [finishLogin]);

  useEffect(() => {
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;
    void runCallback();
    return undefined;
  }, [runCallback]);

  useEffect(() => {
    if (retryWaitSeconds <= 0) return undefined;
    const timeoutId = window.setTimeout(
      () => setRetryWaitSeconds((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timeoutId);
  }, [retryWaitSeconds]);

  const startFreshLogin = (): void => {
    const returnTo = getStoredPostLoginRedirect() || resolveFallbackPath();
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
      <section className="panel authCallbackPanel" aria-live="polite">
        <span className="statusLabel">Lichess Login</span>
        <h1>{phase === "authorizing" ? "Authorizing" : "Login needs attention"}</h1>
        <p>{message}</p>
        {phase === "error" ? (
          <div className="buttonRow authCallbackActions">
            {canRetryCallback ? (
              <button
                type="button"
                disabled={retryWaitSeconds > 0}
                onClick={() => void runCallback()}
              >
                {retryWaitSeconds > 0 ? `Retry in ${retryWaitSeconds}s` : "Retry login check"}
              </button>
            ) : null}
            {errorCode === "account_rate_limited" ? (
              <button type="button" onClick={() => window.location.replace(resolveFallbackPath())}>
                Return to Atomic Puzzles
              </button>
            ) : (
              <button type="button" onClick={startFreshLogin}>
                Start a new Lichess login
              </button>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
};
