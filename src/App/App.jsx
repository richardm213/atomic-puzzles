import { Outlet } from "@tanstack/react-router";
import { TopNav } from "../components/TopNav/TopNav";
import "./App.css";

export const App = () => (
  <div className="appShell">
    <TopNav />
    <Outlet />
  </div>
);
