import "./RequireAuthentication.css";

import { type ReactNode, useEffect, useRef } from "react";

import { useAuth } from "../../context/AuthContext";
import { RouteLoadingFallback } from "../RouteLoadingFallback/RouteLoadingFallback";

export const PuzzleLoginScreen = ({
  guestAction,
  focusHeading = false,
}: {
  guestAction?: { label: string; onClick: () => void } | undefined;
  focusHeading?: boolean;
}) => {
  const { login } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  useEffect(() => {
    if (focusHeading) headingRef.current?.focus();
  }, [focusHeading]);

  return (
    <div className="authenticationGate">
      <section className="authenticationGatePanel" aria-labelledby="authentication-gate-title">
        <h1
          id="authentication-gate-title"
          ref={headingRef}
          tabIndex={focusHeading ? -1 : undefined}
        >
          Log in to access puzzles
        </h1>
        <button type="button" onClick={() => void login(returnTo)}>
          <img src="/images/brands/lichess.svg" alt="" aria-hidden="true" />
          Log in with Lichess
        </button>
        {guestAction ? (
          <button
            type="button"
            className="authenticationGateSecondary"
            onClick={guestAction.onClick}
          >
            {guestAction.label}
          </button>
        ) : null}
      </section>
    </div>
  );
};

export const RequireAuthentication = ({
  children,
  signedOutFallback = <PuzzleLoginScreen />,
}: {
  children: ReactNode;
  signedOutFallback?: ReactNode;
}) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <RouteLoadingFallback />;
  return isAuthenticated ? children : signedOutFallback;
};
