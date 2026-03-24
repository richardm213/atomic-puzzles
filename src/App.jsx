import { Outlet } from "@tanstack/react-router";
import { TopNav } from "./components/TopNav";

export const App = () => (
  <div className="appShell">
    <TopNav />
    <Outlet />
  </div>
);
