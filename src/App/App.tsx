import { Outlet } from "@tanstack/react-router";
import { TopNav } from "../components/TopNav/TopNav";
import { AppSettingsProvider } from "../context/AppSettings";
import { AuthProvider } from "../context/AuthContext";
import "./App.css";

export const App = () => (
  <AuthProvider>
    <AppSettingsProvider>
      <div className="appShell">
        <a className="skipLink" href="#main-content">
          Skip to content
        </a>
        <TopNav />
        <main id="main-content" className="appMain">
          <Outlet />
        </main>
      </div>
    </AppSettingsProvider>
  </AuthProvider>
);
