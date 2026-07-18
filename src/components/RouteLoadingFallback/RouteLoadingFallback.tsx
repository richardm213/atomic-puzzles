import "./RouteLoadingFallback.scss";

export const RouteLoadingFallback = ({ showText = false }: { showText?: boolean }) => (
  <div
    className="routeLoading"
    role="status"
    aria-label={showText ? undefined : "Loading page"}
    aria-live="polite"
  >
    <span className="routeLoadingSpinner" aria-hidden="true" />
    {showText ? <span>Loading page…</span> : null}
  </div>
);
