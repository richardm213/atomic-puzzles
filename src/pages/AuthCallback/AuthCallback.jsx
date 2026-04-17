import { useEffect, useRef, useState } from "react";
import { useAuth } from "../../context/AuthContext";

const resolveFallbackPath = () => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  if (baseUrl === "/") return "/";
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
};

export const AuthCallbackPage = () => {
  const {
    finishLogin,
    clearError,
    getDebugSnapshot,
    isAuthenticated,
    getPostLoginRedirect,
    clearPostLoginRedirect,
  } = useAuth();
  const [message, setMessage] = useState("Finishing your Lichess login...");
  const hasStartedRef = useRef(false);
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || hasRedirectedRef.current) return;
    hasRedirectedRef.current = true;
    const nextLocation = getPostLoginRedirect() || resolveFallbackPath();
    clearPostLoginRedirect();
    window.location.replace(nextLocation);
  }, [clearPostLoginRedirect, getPostLoginRedirect, isAuthenticated]);

  useEffect(() => {
    if (hasStartedRef.current) return undefined;
    hasStartedRef.current = true;

    let active = true;

    const run = async () => {
      try {
        const nextLocation = await finishLogin(window.location.search);
        if (!active) return;
        setMessage("Login complete. Redirecting...");
        if (!hasRedirectedRef.current) {
          hasRedirectedRef.current = true;
          clearPostLoginRedirect();
          window.location.replace(nextLocation || resolveFallbackPath());
        }
      } catch (error) {
        if (!active) return;
        const debug = getDebugSnapshot();
        const details = [
          error instanceof Error ? error.message : "Lichess login failed.",
          debug.clientId ? `Client ID: ${debug.clientId}` : "",
          debug.redirectUri ? `Redirect URI: ${debug.redirectUri}` : "",
          debug.pendingReturnTo ? `Return to: ${debug.pendingReturnTo}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        setMessage(details);
      }
    };

    run();

    return () => {
      active = false;
      clearError();
    };
  }, [clearError, clearPostLoginRedirect, finishLogin, getDebugSnapshot]);

  return (
    <main className="rankingsPage">
      <section className="panel" aria-live="polite">
        <span className="statusLabel">Lichess Login</span>
        <h1>Authorizing</h1>
        <p>{message}</p>
      </section>
    </main>
  );
};
