import "./App.css";

import { Outlet } from "@tanstack/react-router";

import { CoinEarnedToast } from "../components/CoinEarnedToast/CoinEarnedToast";
import { TopNav } from "../components/TopNav/TopNav";
import { AppSettingsProvider } from "../context/AppSettings";
import { AuthProvider } from "../context/AuthContext";
import { usePreserveScrollOnSelectChange } from "../hooks/usePreserveScrollOnSelectChange";

export const App = () => {
  usePreserveScrollOnSelectChange();

  return (
    <AuthProvider>
      <AppSettingsProvider>
        <div className="appShell">
          <a className="skipLink" href="#main-content">
            Skip to content
          </a>
          <TopNav />
          <CoinEarnedToast />
          <main id="main-content" className="appMain" tabIndex={-1}>
            <Outlet />
          </main>
        </div>
      </AppSettingsProvider>
    </AuthProvider>
  );
};
