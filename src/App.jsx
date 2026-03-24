import { useEffect, useState } from "react";
import { HomePage } from "./pages/Home";
import { RankingsPage } from "./pages/Rankings";
import { RecentMatchesPage } from "./pages/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile";
import { PuzzleSolverPage } from "./pages/PuzzleSolver";
import { TopNav } from "./components/TopNav";

const appBasePath = (() => {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
})();

const toAppRelativePath = (pathname) => {
  if (!pathname) return "/";
  if (!appBasePath) return pathname;
  if (pathname.startsWith(appBasePath)) {
    const trimmed = pathname.slice(appBasePath.length);
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  }
  return pathname;
};

const appPath = (pathname = "/") => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${appBasePath}${normalized}`;
};

const isRankingsPath = () => {
  const currentPath = toAppRelativePath(window.location.pathname);
  return currentPath === "/rankings" || currentPath === "/rankings/";
};

const isProfilePath = () => {
  const currentPath = toAppRelativePath(window.location.pathname);
  return /^\/@\/[^/]+\/?$/.test(currentPath);
};

const profileUsernameFromPath = () => {
  const currentPath = toAppRelativePath(window.location.pathname);
  const match = currentPath.match(/^\/@\/([^/]+)\/?$/);
  if (!match) return "";

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
};

const isMatchesPath = () => {
  const currentPath = toAppRelativePath(window.location.pathname);
  return currentPath === "/recent" || currentPath === "/matches" || currentPath === "/recent/";
};

const isSolvePath = () => {
  const currentPath = toAppRelativePath(window.location.pathname);
  return /^\/solve(?:\/\d+)?\/?$/.test(currentPath) || /^\/\d+\/?$/.test(currentPath);
};


export const App = () => {
  const [isRankingsRoute, setIsRankingsRoute] = useState(() => isRankingsPath());
  const [isProfileRoute, setIsProfileRoute] = useState(() => isProfilePath());
  const [isMatchesRoute, setIsMatchesRoute] = useState(() => isMatchesPath());
  const [isSolveRoute, setIsSolveRoute] = useState(() => isSolvePath());
  const [profileUsername, setProfileUsername] = useState(() => profileUsernameFromPath());

  useEffect(() => {
    const onRouteChange = () => {
      setIsRankingsRoute(isRankingsPath());
      setIsProfileRoute(isProfilePath());
      setIsMatchesRoute(isMatchesPath());
      setIsSolveRoute(isSolvePath());
      setProfileUsername(profileUsernameFromPath());
    };

    window.addEventListener("popstate", onRouteChange);
    return () => window.removeEventListener("popstate", onRouteChange);
  }, []);

  let content = <HomePage appPath={appPath} />;
  if (isProfileRoute) {
    content = <PlayerProfilePage username={profileUsername} />;
  } else if (isRankingsRoute) {
    content = <RankingsPage />;
  } else if (isMatchesRoute) {
    content = <RecentMatchesPage />;
  } else if (isSolveRoute) {
    content = <PuzzleSolverPage />;
  }

  return (
    <div className="appShell">
      <TopNav appPath={appPath} />
      {content}
    </div>
  );
};
