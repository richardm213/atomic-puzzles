import "./RequireAuthentication.css";

import type { ReactNode } from "react";

import { useAuth } from "../../context/AuthContext";
import { RouteLoadingFallback } from "../RouteLoadingFallback/RouteLoadingFallback";

export const RequireAuthentication = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading, login } = useAuth();

  if (isLoading) return <RouteLoadingFallback />;
  if (isAuthenticated) return children;

  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  return (
    <div className="authenticationGate">
      <section className="authenticationGatePanel" aria-labelledby="authentication-gate-title">
        <h1 id="authentication-gate-title">Log in to access puzzles</h1>
        <p>Puzzle solving and training tools are available to logged-in users.</p>
        <button type="button" onClick={() => void login(returnTo)}>
          Log in with Lichess
        </button>
      </section>
    </div>
  );
};
