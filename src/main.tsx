import "./theme/site-theme.css";
import "./theme/site-typography.css";
import "./theme/site-primitives.css";
import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { AppRouterProvider } from "./router";
import { installPreloadErrorRecovery } from "./utils/preloadRecovery";

installPreloadErrorRecovery();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppRouterProvider />
  </React.StrictMode>,
);
