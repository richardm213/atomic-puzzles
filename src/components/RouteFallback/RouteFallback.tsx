import "./RouteFallback.css";

import { type ErrorComponentProps, Link } from "@tanstack/react-router";

const RouteFallbackShell = ({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: (() => void) | undefined;
}) => (
  <section className="routeFallback" aria-labelledby="route-fallback-title">
    <div className="routeFallbackPanel">
      <h1 id="route-fallback-title">{title}</h1>
      <p>{message}</p>
      <div className="routeFallbackActions">
        {action ? (
          <button type="button" onClick={action}>
            Try again
          </button>
        ) : null}
        <Link to="/">Go home</Link>
      </div>
    </div>
  </section>
);

export const RouteErrorFallback = ({ reset }: ErrorComponentProps) => (
  <RouteFallbackShell
    title="Page unavailable"
    message="The page could not be loaded. Your account and saved data were not changed."
    action={reset}
  />
);

export const RouteNotFoundFallback = () => (
  <RouteFallbackShell title="Page not found" message="This address does not match a page." />
);
