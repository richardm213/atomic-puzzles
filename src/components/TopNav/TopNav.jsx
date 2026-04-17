import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getBoardThemeColors, useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { resolveUsernameInput } from "../../lib/searchUsernames";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";
import "./TopNav.css";

export const TopNav = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const settingsRef = useRef(null);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();
  const {
    theme,
    setTheme,
    pieceSet,
    setPieceSet,
    pieceSets,
    boardTheme,
    setBoardTheme,
    boardThemes,
    customLightSquare,
    setCustomLightSquare,
    customDarkSquare,
    setCustomDarkSquare,
    boardColorOverrideTheme,
    setBoardColorOverrideTheme,
    boardOverrideLightSquare,
    setBoardOverrideLightSquare,
    boardOverrideDarkSquare,
    setBoardOverrideDarkSquare,
    resetDisplaySettings,
  } = useAppSettings();
  const trimmedSearchQuery = searchQuery.trim();
  const showBoardSettings = pathname === "/solve" || pathname.startsWith("/solve/");
  const activeBoardColors = getBoardThemeColors(
    boardTheme,
    customLightSquare,
    customDarkSquare,
    boardColorOverrideTheme,
    boardOverrideLightSquare,
    boardOverrideDarkSquare,
  );
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const lichessProfilePath = user?.username ? `/@/${normalizeUsername(user.username)}` : "/";

  const handleBoardThemeChange = (event) => {
    setBoardTheme(event.target.value);
    setBoardColorOverrideTheme("");
  };

  const handleCustomLightSquareChange = (event) => {
    const nextLight = event.target.value;

    setCustomLightSquare(nextLight);
    setCustomDarkSquare(activeBoardColors.dark);
    setBoardColorOverrideTheme("");
    setBoardOverrideLightSquare(activeBoardColors.light);
    setBoardOverrideDarkSquare(activeBoardColors.dark);
    setBoardTheme("custom");
  };

  const handleCustomDarkSquareChange = (event) => {
    const nextDark = event.target.value;

    setCustomLightSquare(activeBoardColors.light);
    setCustomDarkSquare(nextDark);
    setBoardColorOverrideTheme("");
    setBoardOverrideLightSquare(activeBoardColors.light);
    setBoardOverrideDarkSquare(activeBoardColors.dark);
    setBoardTheme("custom");
  };

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

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    if (!trimmedSearchQuery) return;
    const resolvedUsername = await resolveUsernameInput(trimmedSearchQuery);
    navigate({
      to: "/@/$username",
      params: { username: normalizeUsername(resolvedUsername) },
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
        <nav className="topNavLinks" aria-label="Main navigation">
          <Link to="/rankings">Rankings</Link>
          <Link to="/solve">Puzzles</Link>
          <Link to="/recent">Recent</Link>
          <Link to="/h2h">H2H</Link>
        </nav>
        <div className="navAuth" aria-live="polite">
          {isAuthenticated && user ? (
            <>
              <Link className="navAuthProfile" to={lichessProfilePath}>
                {user.username}
              </Link>
              <button className="navAuthButton navAuthLogout" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button
              className="navAuthButton"
              type="button"
              onClick={() => login(currentLocation)}
              disabled={isLoading}
            >
              {isLoading ? "Checking..." : "Login"}
            </button>
          )}
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
              {showBoardSettings ? (
                <>
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
                  <div className="navSettingsSection">
                    <label className="navSettingsLabel" htmlFor="board-theme-select">
                      Board
                    </label>
                    <select
                      id="board-theme-select"
                      value={boardTheme}
                      onChange={handleBoardThemeChange}
                    >
                      {boardThemes.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                          {entry.label}
                        </option>
                      ))}
                    </select>
                    <div className="navColorInputs">
                      <label className="navColorField" htmlFor="light-square-color">
                        <span>Light square</span>
                        <input
                          id="light-square-color"
                          type="color"
                          value={activeBoardColors.light}
                          onChange={handleCustomLightSquareChange}
                        />
                      </label>
                      <label className="navColorField" htmlFor="dark-square-color">
                        <span>Dark square</span>
                        <input
                          id="dark-square-color"
                          type="color"
                          value={activeBoardColors.dark}
                          onChange={handleCustomDarkSquareChange}
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      className="navSecondaryButton"
                      onClick={resetDisplaySettings}
                    >
                      Reset to defaults
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};
