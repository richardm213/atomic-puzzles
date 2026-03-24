import { useEffect, useRef, useState } from "react";
import { HomePage } from "./pages/Home";
import { RankingsPage } from "./pages/Rankings";
import { RecentMatchesPage } from "./pages/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile";
import { PuzzleSolverPage } from "./pages/PuzzleSolver";

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

const TopNav = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const target = searchQuery.trim();
    if (!target) return;
    window.location.href = appPath(`/@/${encodeURIComponent(target)}`);
  };

  const closeSearchIfFocusOutside = () => {
    window.requestAnimationFrame(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement)) {
        setSearchOpen(false);
        return;
      }

      if (!activeElement.closest(".navSearch")) {
        setSearchOpen(false);
      }
    });
  };

  const closeSearchOnMouseLeave = () => {
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header className="topNav">
      <a className="homeBrand" href={appPath("/")} aria-label="Go to home page">
        <img src={appPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
      </a>
      <div className="topNavCenter">
        <div className="navSearchSlot">
          <form
            className={`navSearch ${searchOpen ? "open" : ""}`}
            onSubmit={handleSearchSubmit}
            onMouseEnter={() => setSearchOpen(true)}
            onMouseLeave={closeSearchOnMouseLeave}
            onFocusCapture={() => setSearchOpen(true)}
            onBlurCapture={closeSearchIfFocusOutside}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              placeholder="Search player"
              aria-label="Search player username"
              onChange={(event) => setSearchQuery(event.target.value)}
              tabIndex={searchOpen ? 0 : -1}
            />
            <button
              className="navSearchIcon"
              type={searchOpen ? "submit" : "button"}
              aria-label="Search player"
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true);
                }
              }}
            >
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true" />
            </button>
            <button className="navSearchGo" type="submit" tabIndex={searchOpen ? 0 : -1}>
              Go
            </button>
          </form>
        </div>
        <nav className="topNavLinks" aria-label="Main navigation">
          <a href={appPath("/rankings")}>Rankings</a>
          <a href={appPath("/solve")}>Puzzles</a>
          <a href={appPath("/recent")}>Recent</a>
        </nav>
      </div>
    </header>
  );
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
      <TopNav />
      {content}
    </div>
  );
};
