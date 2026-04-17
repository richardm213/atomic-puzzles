import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faRightFromBracket, faUser } from "@fortawesome/free-solid-svg-icons";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { getBoardThemeColors, useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { resolveUsernameInput } from "../../lib/searchUsernames";
import { resolveProfileUsernameFromAliases } from "../../lib/supabaseAliases";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";
import "./TopNav.css";

const navItems = [
  {
    to: "/rankings",
    label: "Rankings",
    isActive: (pathname) => pathname === "/rankings" || pathname.startsWith("/rankings/"),
  },
  {
    to: "/solve",
    label: "Puzzles",
    isActive: (pathname) => pathname === "/solve" || pathname.startsWith("/solve/"),
  },
  {
    to: "/recent",
    label: "Recent",
    isActive: (pathname) => pathname === "/recent" || pathname === "/matches",
  },
  {
    to: "/h2h",
    label: "H2H",
    isActive: (pathname) => pathname === "/h2h" || pathname.startsWith("/h2h/"),
  },
];

const PROFILE_USERNAME_STORAGE_PREFIX = "atomic-puzzles.profile-username";

const getStoredProfileUsername = (username) => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof window === "undefined") return "";

  return normalizeUsername(
    window.localStorage.getItem(`${PROFILE_USERNAME_STORAGE_PREFIX}.${normalizedUsername}`),
  );
};

const setStoredProfileUsername = (username, profileUsername) => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedProfileUsername = normalizeUsername(profileUsername);
  if (!normalizedUsername || !normalizedProfileUsername || typeof window === "undefined") return;

  window.localStorage.setItem(
    `${PROFILE_USERNAME_STORAGE_PREFIX}.${normalizedUsername}`,
    normalizedProfileUsername,
  );
};

export const TopNav = () => {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchInputRef = useRef(null);
  const profileMenuRef = useRef(null);
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
  const normalizedAuthUsername = normalizeUsername(user?.username);
  const [profileUsername, setProfileUsername] = useState(() => getStoredProfileUsername(user?.username));
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

  useEffect(() => {
    if (!normalizedAuthUsername) {
      setProfileUsername("");
      return;
    }

    const storedProfileUsername = getStoredProfileUsername(normalizedAuthUsername);
    setProfileUsername(storedProfileUsername || normalizedAuthUsername);

    let cancelled = false;

    const loadProfileUsername = async () => {
      try {
        const resolvedProfileUsername =
          (await resolveProfileUsernameFromAliases(normalizedAuthUsername)) || normalizedAuthUsername;
        if (cancelled) return;
        setProfileUsername(resolvedProfileUsername);
        setStoredProfileUsername(normalizedAuthUsername, resolvedProfileUsername);
      } catch {
        if (cancelled) return;
        setProfileUsername(normalizedAuthUsername);
        setStoredProfileUsername(normalizedAuthUsername, normalizedAuthUsername);
      }
    };

    loadProfileUsername();

    return () => {
      cancelled = true;
    };
  }, [normalizedAuthUsername]);

  const resolvedProfileUsername = profileUsername || normalizedAuthUsername;

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
    if (!profileMenuOpen) return undefined;

    const handlePointerDown = (event) => {
      if (profileMenuRef.current?.contains(event.target)) return;
      setProfileMenuOpen(false);
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [profileMenuOpen]);

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
      <Link
        className={`homeBrand ${pathname === "/" ? "isActive" : ""}`}
        to="/"
        aria-label="Go to Atomic Puzzles home page"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <img src={appAssetPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
        <span>Atomic Puzzles</span>
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
          {navItems.map((item) => {
            const active = item.isActive(pathname);
            return (
              <Link
                key={item.to}
                className={active ? "isActive" : ""}
                to={item.to}
                aria-current={active ? "page" : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="navAuth" aria-live="polite">
          {isAuthenticated && user ? (
            <div className="navProfileMenu" ref={profileMenuRef}>
              <button
                className={`navAuthProfileGroup ${profileMenuOpen ? "open" : ""}`}
                type="button"
                aria-label={`Open account menu for ${resolvedProfileUsername}`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                onClick={() => setProfileMenuOpen((open) => !open)}
              >
                <span className="navAuthProfileIcon" aria-hidden="true">
                  <FontAwesomeIcon icon={faUser} />
                </span>
                <span className="navAuthProfile">{user.username}</span>
                <span className="navAuthProfileCaret" aria-hidden="true">
                  <FontAwesomeIcon icon={faChevronDown} />
                </span>
              </button>
              {profileMenuOpen ? (
                <div className="navProfileDropdown" role="menu" aria-label="Account menu">
                  <Link
                    className="navProfileDropdownItem"
                    to="/@/$username"
                    params={{ username: resolvedProfileUsername }}
                    role="menuitem"
                    onClick={() => setProfileMenuOpen(false)}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faUser} />
                    </span>
                    View profile
                  </Link>
                  <button
                    className="navProfileDropdownItem"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faRightFromBracket} />
                    </span>
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
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
