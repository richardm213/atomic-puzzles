import "@fontsource-variable/inter";
import "@fontsource-variable/inter/wght-italic.css";
import "@fontsource-variable/roboto-mono";
import "./theme/site-theme.css";
import "./theme/site-typography.css";
import "./theme/site-layout.css";
import "./theme/site-primitives.css";
import "./index.css";
// Shared route styles must load before page overrides, including during intent preloading.
import "./pages/Rankings/Rankings.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { AppRouterProvider } from "./router";
import { installDialogLightDismiss } from "./utils/dialogDismiss";
import { installPreloadErrorRecovery } from "./utils/preloadRecovery";
import { installPointerSelectFocusRelease } from "./utils/selectFocus";

installPreloadErrorRecovery();
installDialogLightDismiss();
installPointerSelectFocusRelease();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppRouterProvider />
  </React.StrictMode>,
);
