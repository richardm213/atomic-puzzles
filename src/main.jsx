import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { App } from "./App";
import "./index.css";

import "@lichess-org/chessground/assets/chessground.base.css";
import "./theme/chessground.blue.css";
import "@lichess-org/chessground/assets/chessground.cburnett.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
