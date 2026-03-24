import { useEffect, useRef, useState } from "react";
import { RankingsPage } from "./pages/Rankings";
import { RecentMatchesPage } from "./pages/RecentMatches";
import { PlayerProfilePage } from "./pages/PlayerProfile";
import { PuzzleSolverPage } from "./pages/PuzzleSolver";
import { fetchLbRows, hasSupabaseLbConfig } from "./lib/supabaseLb";

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

const HomePage = () => {
  const [homeError, setHomeError] = useState("");

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        setHomeError("");
        if (!hasSupabaseLbConfig()) {
          throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local");
        }
        await fetchLbRows({ limit: 1 });
      } catch (error) {
        setHomeError(String(error?.message || error));
      }
    };

    loadHomeData();
  }, []);

  return (
    <div className="homePage">
      <div className="panel homePanel">
        <h1>Atomic Puzzles</h1>
        <p className="homeIntro">
          Welcome! This site helps you solve atomic puzzles, sharpen tactical ability, and keep up
          with the current player rankings and stats.
        </p>

        <section className="homeButtonRow">
          <a className="primaryCta" href={appPath("/solve")}>
            Solve Puzzles
          </a>
          <a className="primaryCta" href={appPath("/rankings")}>
            View Rankings
          </a>
          <a className="primaryCta" href={appPath("/recent")}>
            View Recent Matches
          </a>
        </section>

        {homeError ? <div className="errorText">{homeError}</div> : null}

        <section className="homeDescriptions">
          <article className="homeDescriptionCard">
            <h2>Puzzles and Improvement</h2>
            <p>
              Train with tactical puzzle positions to build pattern recognition, improve calculation
              speed, and perform better in practical atomic games.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Rankings</h2>
            <p>
              View the top atomic blitz and bullet rankings for the current month. Explore
              historical rankings going back to 2023. Blitz and bullet ratings are tracked
              separately because skill transfer is not one-to-one: hyperbullet farmers and stronger
              blitz players often excel in very different ways.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Player Stats and Fairness</h2>
            <p>
              Stats are tracked for each player account individually so you can review account-level
              progress over time. Cheaters and alt abusers are excluded from rankings and rating
              calculations to keep the system as fair and meaningful as possible.
            </p>
          </article>
          <article className="homeDescriptionCard">
            <h2>Recent Matches</h2>
            <p>
              Open recent matches for the latest competitive results and momentum checks across the
              strongest active players.
            </p>
          </article>
        </section>
      </div>
    </div>
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

  let content = <HomePage />;
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
