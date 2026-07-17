import "./RouteLoadingFallback.scss";

export const RouteLoadingFallback = () => (
  <div className="routeLoading" role="status" aria-live="polite">
    <span className="routeLoadingSpinner" aria-hidden="true" />
    <span>Loading page…</span>
  </div>
);
