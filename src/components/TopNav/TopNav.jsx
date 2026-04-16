import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAppSettings } from "../../context/AppSettings";
import { normalizeUsername } from "../../utils/playerNames";
import "./TopNav.css";

const appAssetPath = (pathname = "/") => {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return `${import.meta.env.BASE_URL}${normalized.slice(1)}`;
};

export const TopNav = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const settingsRef = useRef(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { theme, setTheme, pieceSet, setPieceSet, pieceSets } = useAppSettings();
  const trimmedSearchQuery = searchQuery.trim();
  const showPieceSetSetting = pathname === "/solve" || pathname.startsWith("/solve/");

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!settingsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (settingsRef.current?.contains(event.target)) return;
      setSettingsOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [settingsOpen]);

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    if (!trimmedSearchQuery) return;
    navigate({
      to: "/@/$username",
      params: { username: normalizeUsername(trimmedSearchQuery) },
    });
    setSearchQuery("");
    setSearchOpen(false);
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
      <Link className="homeBrand" to="/" aria-label="Go to home page">
        <img src={appAssetPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
      </Link>
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
            <button
              className="navSearchGo"
              type="submit"
              tabIndex={searchOpen ? 0 : -1}
              disabled={!trimmedSearchQuery}
            >
              Go
            </button>
          </form>
        </div>
        <div className="navSettings" ref={settingsRef}>
          <button
            className={`navSettingsButton ${settingsOpen ? "open" : ""}`}
            type="button"
            aria-label="Open settings"
            aria-haspopup="menu"
            aria-expanded={settingsOpen}
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <i className="fa-solid fa-gear" aria-hidden="true" />
          </button>
          {settingsOpen ? (
            <div className="navSettingsMenu" role="menu" aria-label="Site settings">
              <div className="navSettingsSection">
                <span className="navSettingsLabel">Theme</span>
                <div className="navThemeToggle" role="group" aria-label="Color theme">
                  <button
                    type="button"
                    className={theme === "dark" ? "active" : ""}
                    onClick={() => setTheme("dark")}
                  >
                    Dark
                  </button>
                  <button
                    type="button"
                    className={theme === "light" ? "active" : ""}
                    onClick={() => setTheme("light")}
                  >
                    Light
                  </button>
                </div>
              </div>
              {showPieceSetSetting ? (
                <div className="navSettingsSection">
                  <label className="navSettingsLabel" htmlFor="piece-set-select">
                    Piece set
                  </label>
                  <select
                    id="piece-set-select"
                    value={pieceSet}
                    onChange={(event) => setPieceSet(event.target.value)}
                  >
                    {pieceSets.map((entry) => (
                      <option key={entry.value} value={entry.value}>
                        {entry.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <nav className="topNavLinks" aria-label="Main navigation">
          <Link to="/rankings">Rankings</Link>
          <Link to="/solve">Puzzles</Link>
          <Link to="/recent">Recent</Link>
          <Link to="/h2h">H2H</Link>
        </nav>
      </div>
    </header>
  );
};
