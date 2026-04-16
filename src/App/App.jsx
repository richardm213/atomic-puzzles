import { Outlet } from "@tanstack/react-router";
import { TopNav } from "../components/TopNav/TopNav";
import { AppSettingsProvider } from "../context/AppSettings";
import "./App.css";

export const App = () => (
  <AppSettingsProvider>
    <div className="appShell">
      <TopNav />
      <Outlet />
    </div>
  </AppSettingsProvider>
);
