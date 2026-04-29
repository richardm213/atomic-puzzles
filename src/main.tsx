import "./index.css";
import "@lichess-org/chessground/assets/chessground.base.css";
import "./theme/chessground.blue.css";
import "./theme/chessground.pieces.css";

import React from "react";
import ReactDOM from "react-dom/client";

import { AppRouterProvider } from "./router";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AppRouterProvider />
  </React.StrictMode>,
);
