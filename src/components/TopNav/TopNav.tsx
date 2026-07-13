import "./TopNav.css";

import {
  faBars,
  faChevronDown,
  faMagnifyingGlass,
  faMoon,
  faRightFromBracket,
  faRightToBracket,
  faSun,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { getBoardThemeColors, useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { resolveProfileUsernameFromAliases } from "../../lib/supabase/supabaseAliases";
import {
  searchUsernameSuggestions,
  type UsernameSearchSuggestion,
} from "../../lib/users/usernameSearch";
import { appAssetPath } from "../../utils/appAssetPath";
import { normalizeUsername } from "../../utils/playerNames";

type NavItem = {
  to: string;
  label: string;
  isActive: (pathname: string) => boolean;
  children?: {
    to: string;
    label: string;
    isActive: (pathname: string) => boolean;
  }[];
};

const navItems: NavItem[] = [
  {
    to: "/rankings",
    label: "Rankings",
    isActive: (pathname) => pathname === "/rankings" || pathname.startsWith("/rankings/"),
  },
  {
    to: "/solve",
    label: "Puzzles",
    isActive: (pathname) =>
      pathname === "/solve" || pathname.startsWith("/solve/") || pathname === "/dashboard",
    children: [
      {
        to: "/solve",
        label: "Solve puzzles",
        isActive: (pathname) =>
          pathname === "/solve" ||
          (/^\/solve\/[^/]+$/.test(pathname) &&
            pathname !== "/solve/sets" &&
            pathname !== "/solve/leaderboard" &&
            pathname !== "/solve/history"),
      },
      {
        to: "/dashboard",
        label: "Puzzle dashboard",
        isActive: (pathname) => pathname === "/dashboard" || pathname === "/solve/history",
      },
      {
        to: "/solve/leaderboard",
        label: "Puzzle leaderboard",
        isActive: (pathname) => pathname === "/solve/leaderboard",
      },
      {
        to: "/solve/sets",
        label: "Puzzle sets",
        isActive: (pathname) => pathname === "/solve/sets",
      },
    ],
  },
  {
    to: "/recent",
    label: "Games",
    isActive: (pathname) =>
      pathname === "/recent" ||
      pathname === "/matches" ||
      pathname.startsWith("/matches/") ||
      pathname === "/tournaments" ||
      pathname.startsWith("/tournaments/"),
    children: [
      {
        to: "/recent",
        label: "Recent games",
        isActive: (pathname) =>
          pathname === "/recent" || pathname === "/matches" || pathname.startsWith("/matches/"),
      },
      {
        to: "/tournaments",
        label: "Tournaments",
        isActive: (pathname) => pathname === "/tournaments" || pathname.startsWith("/tournaments/"),
      },
    ],
  },
  {
    to: "/h2h",
    label: "H2H",
    isActive: (pathname) => pathname === "/h2h" || pathname.startsWith("/h2h/"),
  },
  {
    to: "/users",
    label: "Players",
    isActive: (pathname) => pathname === "/users" || pathname.startsWith("/users/"),
  },
  {
    to: "/analysis",
    label: "Analysis",
    isActive: (pathname) => pathname === "/analysis" || pathname === "/practice",
    children: [
      {
        to: "/analysis",
        label: "Analysis board",
        isActive: (pathname) => pathname === "/analysis",
      },
      {
        to: "/practice",
        label: "Practice",
        isActive: (pathname) => pathname === "/practice",
      },
    ],
  },
];

const PROFILE_USERNAME_STORAGE_PREFIX = "atomic-puzzles.profile-username";
const SEARCH_SUGGESTION_MIN_LENGTH = 3;
const SEARCH_SUGGESTION_DELAY_MS = 150;
const NAV_DROPDOWN_CLOSE_DELAY_MS = 180;

const getStoredProfileUsername = (username: string | null | undefined): string => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof window === "undefined") return "";

  return normalizeUsername(
    window.localStorage.getItem(`${PROFILE_USERNAME_STORAGE_PREFIX}.${normalizedUsername}`),
  );
};

const setStoredProfileUsername = (username: string, profileUsername: string): void => {
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
  const [searchPending, setSearchPending] = useState(false);
  const [searchSuggestionsPending, setSearchSuggestionsPending] = useState(false);
  const [searchSuggestionsSearched, setSearchSuggestionsSearched] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<UsernameSearchSuggestion[]>([]);
  const [activeSearchSuggestionIndex, setActiveSearchSuggestionIndex] = useState(-1);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openNavDropdown, setOpenNavDropdown] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchSuggestionsRequestIdRef = useRef(0);
  const topNavRef = useRef<HTMLElement | null>(null);
  const navDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navDropdownCloseTimeoutRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
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
    hideRankingsOpenings,
    setHideRankingsOpenings,
    showPuzzleTimer,
    setShowPuzzleTimer,
  } = useAppSettings();
  const trimmedSearchQuery = searchQuery.trim();
  const normalizedAuthUsername = normalizeUsername(user?.username);
  const [profileUsername, setProfileUsername] = useState(() =>
    getStoredProfileUsername(user?.username),
  );
  const showBoardSettings =
    pathname === "/solve" ||
    pathname.startsWith("/solve/") ||
    pathname === "/analysis" ||
    pathname.startsWith("/analysis/");
  const showPuzzleTimerSetting =
    pathname === "/solve" ||
    (/^\/solve\/[^/]+$/.test(pathname) &&
      pathname !== "/solve/sets" &&
      pathname !== "/solve/leaderboard" &&
      pathname !== "/solve/history");
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
          (await resolveProfileUsernameFromAliases(normalizedAuthUsername)) ||
          normalizedAuthUsername;
        if (cancelled) return;
        setProfileUsername(resolvedProfileUsername);
        setStoredProfileUsername(normalizedAuthUsername, resolvedProfileUsername);
      } catch {
        if (cancelled) return;
        setProfileUsername(normalizedAuthUsername);
        setStoredProfileUsername(normalizedAuthUsername, normalizedAuthUsername);
      }
    };

    void loadProfileUsername();

    return () => {
      cancelled = true;
    };
  }, [normalizedAuthUsername]);

  const resolvedProfileUsername = profileUsername || normalizedAuthUsername;
  const searchExpanded = searchOpen;
  const searchBusy = searchPending || searchSuggestionsPending;
  const showSearchSuggestions =
    searchExpanded &&
    trimmedSearchQuery.length >= SEARCH_SUGGESTION_MIN_LENGTH &&
    (searchSuggestionsPending || searchSuggestionsSearched || searchSuggestions.length > 0);

  const clearNavDropdownCloseTimeout = useCallback((): void => {
    if (navDropdownCloseTimeoutRef.current === null) return;
    window.clearTimeout(navDropdownCloseTimeoutRef.current);
    navDropdownCloseTimeoutRef.current = null;
  }, []);

  const openNavDropdownFor = useCallback(
    (navItemTo: string): void => {
      clearNavDropdownCloseTimeout();
      setOpenNavDropdown(navItemTo);
    },
    [clearNavDropdownCloseTimeout],
  );

  const closeNavDropdown = useCallback((): void => {
    clearNavDropdownCloseTimeout();
    setOpenNavDropdown(null);
  }, [clearNavDropdownCloseTimeout]);

  const scheduleNavDropdownClose = useCallback((): void => {
    clearNavDropdownCloseTimeout();
    navDropdownCloseTimeoutRef.current = window.setTimeout(() => {
      navDropdownCloseTimeoutRef.current = null;
      setOpenNavDropdown(null);
    }, NAV_DROPDOWN_CLOSE_DELAY_MS);
  }, [clearNavDropdownCloseTimeout]);

  const handleBoardThemeChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    setBoardTheme(event.target.value);
    setBoardColorOverrideTheme("");
  };

  const handleCustomLightSquareChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextLight = event.target.value;

    setCustomLightSquare(nextLight);
    setCustomDarkSquare(activeBoardColors.dark);
    setBoardColorOverrideTheme("");
    setBoardOverrideLightSquare(activeBoardColors.light);
    setBoardOverrideDarkSquare(activeBoardColors.dark);
    setBoardTheme("custom");
  };

  const handleCustomDarkSquareChange = (event: ChangeEvent<HTMLInputElement>): void => {
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

  useEffect(() => clearNavDropdownCloseTimeout, [clearNavDropdownCloseTimeout]);

  useEffect(() => {
    const requestId = searchSuggestionsRequestIdRef.current + 1;
    searchSuggestionsRequestIdRef.current = requestId;
    setActiveSearchSuggestionIndex(-1);
    setSearchSuggestionsSearched(false);
    setSearchSuggestionsPending(false);

    if (!searchOpen || searchPending || trimmedSearchQuery.length < SEARCH_SUGGESTION_MIN_LENGTH) {
      setSearchSuggestions([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setSearchSuggestionsPending(true);

      void searchUsernameSuggestions(trimmedSearchQuery)
        .then((suggestions) => {
          if (requestId !== searchSuggestionsRequestIdRef.current) return;
          setSearchSuggestions(suggestions);
          setSearchSuggestionsSearched(true);
        })
        .catch(() => {
          if (requestId !== searchSuggestionsRequestIdRef.current) return;
          setSearchSuggestions([]);
          setSearchSuggestionsSearched(true);
        })
        .finally(() => {
          if (requestId === searchSuggestionsRequestIdRef.current) {
            setSearchSuggestionsPending(false);
          }
        });
    }, SEARCH_SUGGESTION_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [searchOpen, searchPending, trimmedSearchQuery]);

  useEffect(() => {
    setMobileMenuOpen(false);
    closeNavDropdown();
    setProfileMenuOpen(false);
    setSettingsOpen(false);
  }, [closeNavDropdown, pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      if (topNavRef.current?.contains(event.target as Node)) return;
      setMobileMenuOpen(false);
      closeNavDropdown();
      setProfileMenuOpen(false);
      setSettingsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        closeNavDropdown();
        setProfileMenuOpen(false);
        setSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeNavDropdown, mobileMenuOpen]);

  useEffect(() => {
    if (!openNavDropdown) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      if (navDropdownRefs.current[openNavDropdown]?.contains(event.target as Node)) return;
      closeNavDropdown();
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeNavDropdown();
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [closeNavDropdown, openNavDropdown]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      if (profileMenuRef.current?.contains(event.target as Node)) return;
      setProfileMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent): void => {
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

    const handlePointerDown = (event: MouseEvent): void => {
      if (settingsRef.current?.contains(event.target as Node)) return;
      setSettingsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent): void => {
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

  const handleSearchSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!trimmedSearchQuery || searchPending) return;

    setSearchPending(true);

    try {
      void navigate({
        to: "/@/$username",
        params: { username: trimmedSearchQuery },
      });
      setSearchQuery("");
      setSearchSuggestions([]);
      setSearchSuggestionsSearched(false);
      setActiveSearchSuggestionIndex(-1);
      setSearchOpen(false);
      setMobileMenuOpen(false);
    } finally {
      setSearchPending(false);
    }
  };

  const handleSearchSuggestionSelect = async (
    suggestion: UsernameSearchSuggestion,
  ): Promise<void> => {
    if (searchPending) return;

    setSearchPending(true);

    try {
      void navigate({
        to: "/@/$username",
        params: { username: suggestion.matchedName },
      });
      setSearchQuery("");
      setSearchSuggestions([]);
      setSearchSuggestionsSearched(false);
      setActiveSearchSuggestionIndex(-1);
      setSearchOpen(false);
      setMobileMenuOpen(false);
    } finally {
      setSearchPending(false);
    }
  };

  const handleSearchInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      if (searchSuggestions.length > 0) {
        event.preventDefault();
        setSearchSuggestions([]);
        setSearchSuggestionsSearched(false);
        setActiveSearchSuggestionIndex(-1);
        return;
      }

      setSearchOpen(false);
      searchInputRef.current?.blur();
      return;
    }

    if (searchSuggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSearchSuggestionIndex((currentIndex) =>
        currentIndex >= searchSuggestions.length - 1 ? 0 : currentIndex + 1,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSearchSuggestionIndex((currentIndex) =>
        currentIndex <= 0 ? searchSuggestions.length - 1 : currentIndex - 1,
      );
      return;
    }

    if (event.key === "Enter" && activeSearchSuggestionIndex >= 0) {
      event.preventDefault();
      const activeSuggestion = searchSuggestions[activeSearchSuggestionIndex];
      if (activeSuggestion) {
        void handleSearchSuggestionSelect(activeSuggestion);
      }
    }
  };

  const closeSearchIfFocusOutside = () => {
    window.requestAnimationFrame(() => {
      if (searchPending) return;

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
    if (searchPending) return;
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  return (
    <header className={`topNav ${mobileMenuOpen ? "mobileMenuOpen" : ""}`} ref={topNavRef}>
      <Link
        className={`homeBrand ${pathname === "/" ? "isActive" : ""}`}
        to="/"
        aria-label="Go to Atomic Puzzles home page"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <img src={appAssetPath("/favicon.ico")} alt="Atomic Puzzles" width="24" height="24" />
        <span>Atomic Puzzles</span>
      </Link>
      <button
        className="mobileMenuButton"
        type="button"
        aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
        aria-expanded={mobileMenuOpen}
        aria-controls="top-nav-menu"
        onClick={() => {
          setMobileMenuOpen((open) => !open);
          closeNavDropdown();
          setProfileMenuOpen(false);
          setSettingsOpen(false);
        }}
      >
        <FontAwesomeIcon icon={mobileMenuOpen ? faXmark : faBars} />
      </button>
      <div className="topNavCenter">
        <nav className="topNavLinks" id="top-nav-menu" aria-label="Main navigation">
          <Link
            className={`mobileHomeLink ${pathname === "/" ? "isActive" : ""}`}
            to="/"
            aria-current={pathname === "/" ? "page" : undefined}
            onClick={() => setMobileMenuOpen(false)}
          >
            Home
          </Link>
          {navItems.map((item) => {
            const active = item.isActive(pathname);
            if (item.children) {
              const dropdownOpen = openNavDropdown === item.to;
              return (
                <div
                  className={`navDropdown ${active ? "isActive" : ""} ${
                    dropdownOpen ? "open" : ""
                  }`}
                  key={item.to}
                  ref={(element) => {
                    navDropdownRefs.current[item.to] = element;
                  }}
                  onMouseEnter={() => openNavDropdownFor(item.to)}
                  onMouseLeave={scheduleNavDropdownClose}
                >
                  <button
                    className="navDropdownTrigger"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded={dropdownOpen}
                    aria-current={active ? "page" : undefined}
                    onClick={() => {
                      clearNavDropdownCloseTimeout();
                      setOpenNavDropdown((openDropdown) =>
                        openDropdown === item.to ? null : item.to,
                      );
                      setProfileMenuOpen(false);
                      setSettingsOpen(false);
                    }}
                  >
                    {item.label}
                  </button>
                  {dropdownOpen ? (
                    <div
                      className="navDropdownMenu"
                      role="menu"
                      aria-label={`${item.label} navigation`}
                    >
                      {item.children.map((child) => {
                        const childActive = child.isActive(pathname);
                        return (
                          <Link
                            key={child.to}
                            className={childActive ? "isActive" : ""}
                            to={child.to}
                            aria-current={childActive ? "page" : undefined}
                            role="menuitem"
                            onClick={() => {
                              closeNavDropdown();
                              setMobileMenuOpen(false);
                            }}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            }

            return (
              <Link
                key={item.to}
                className={active ? "isActive" : ""}
                to={item.to}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="navSearchSlot">
          <form
            className={`navSearch ${searchExpanded ? "open" : ""} ${
              searchPending ? "pending" : ""
            } ${searchSuggestionsPending ? "suggesting" : ""}`}
            onSubmit={handleSearchSubmit}
            onMouseEnter={() => {
              if (!searchPending) setSearchOpen(true);
            }}
            onMouseLeave={closeSearchOnMouseLeave}
            onFocusCapture={() => {
              if (!searchPending) setSearchOpen(true);
            }}
            onBlurCapture={closeSearchIfFocusOutside}
          >
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              placeholder="Search player"
              aria-label="Search player username"
              aria-busy={searchBusy}
              aria-autocomplete="list"
              aria-controls="nav-search-results"
              aria-expanded={showSearchSuggestions}
              aria-activedescendant={
                activeSearchSuggestionIndex >= 0
                  ? `nav-search-result-${activeSearchSuggestionIndex}`
                  : undefined
              }
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={handleSearchInputKeyDown}
              disabled={searchPending}
              tabIndex={searchExpanded ? 0 : -1}
            />
            <div className="navSearchStatus" aria-hidden={!searchBusy}>
              <span className="navSearchProgress" />
            </div>
            <button
              className="navSearchIcon"
              type={searchExpanded ? "submit" : "button"}
              aria-label={searchPending ? "Searching for player" : "Search player"}
              disabled={searchPending}
              onClick={() => {
                if (!searchOpen) {
                  setSearchOpen(true);
                }
              }}
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
            </button>
            {showSearchSuggestions ? (
              <div className="navSearchResults" id="nav-search-results" role="listbox">
                {searchSuggestionsPending ? (
                  <div className="navSearchResultsHint">Searching...</div>
                ) : null}
                {!searchSuggestionsPending && searchSuggestions.length === 0 ? (
                  <div className="navSearchResultsHint">No players found</div>
                ) : null}
                {!searchSuggestionsPending
                  ? searchSuggestions.map((suggestion, index) => (
                      <button
                        className={`navSearchResult ${
                          index === activeSearchSuggestionIndex ? "active" : ""
                        }`}
                        id={`nav-search-result-${index}`}
                        key={`${suggestion.username}-${suggestion.matchedName}`}
                        type="button"
                        role="option"
                        aria-selected={index === activeSearchSuggestionIndex}
                        onMouseDown={(event) => event.preventDefault()}
                        onMouseEnter={() => setActiveSearchSuggestionIndex(index)}
                        onClick={() => void handleSearchSuggestionSelect(suggestion)}
                      >
                        <span className="navSearchResultName">{suggestion.matchedName}</span>
                        {suggestion.matchType === "alias" ? (
                          <span className="navSearchResultMeta">{suggestion.username}</span>
                        ) : null}
                      </button>
                    ))
                  : null}
              </div>
            ) : null}
          </form>
        </div>
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
                      void logout();
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
              <FontAwesomeIcon icon={faRightToBracket} aria-hidden="true" />
              <span>{isLoading ? "Checking..." : "Login"}</span>
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
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                  >
                    <span className="navThemeIcon navThemeIconDark" aria-hidden="true">
                      <FontAwesomeIcon icon={faMoon} />
                    </span>
                    <span>Dark</span>
                    <span className="navThemeStatus" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={theme === "light" ? "active" : ""}
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                  >
                    <span className="navThemeIcon navThemeIconLight" aria-hidden="true">
                      <FontAwesomeIcon icon={faSun} />
                    </span>
                    <span>Light</span>
                    <span className="navThemeStatus" aria-hidden="true" />
                  </button>
                </div>
              </div>
              {pathname === "/rankings" ? (
                <div className="navSettingsSection">
                  <label className="navSettingsCheckbox">
                    <span>Hide openings</span>
                    <input
                      type="checkbox"
                      checked={hideRankingsOpenings}
                      onChange={(event) => setHideRankingsOpenings(event.target.checked)}
                    />
                  </label>
                </div>
              ) : null}
              {showBoardSettings ? (
                <>
                  {showPuzzleTimerSetting ? (
                    <div className="navSettingsSection">
                      <label className="navSettingsCheckbox">
                        <span>Show puzzle timer</span>
                        <input
                          type="checkbox"
                          checked={showPuzzleTimer}
                          onChange={(event) => setShowPuzzleTimer(event.target.checked)}
                        />
                      </label>
                    </div>
                  ) : null}
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
