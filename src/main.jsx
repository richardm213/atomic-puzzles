import React from "react";
import ReactDOM from "react-dom/client";
import { AppRouterProvider } from "./router";
import "./index.css";

import "@lichess-org/chessground/assets/chessground.base.css";
import "./theme/chessground.blue.css";
import "./theme/chessground.pieces.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppRouterProvider />
  </React.StrictMode>,
);
