import "./TopNav.css";

import {
  faBars,
  faBell,
  faChartLine,
  faCheck,
  faChevronDown,
  faComment,
  faGear,
  faMagnifyingGlass,
  faMoon,
  faReply,
  faRightFromBracket,
  faRightToBracket,
  faSun,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import {
  notificationQueryKeys,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
} from "../../lib/community/notificationQueries";
import { markNotificationsRead, type UserNotification } from "../../lib/community/notifications";
import type { UsernameSearchSuggestion } from "../../lib/users/usernameSearch";
import { appAssetPath } from "../../utils/appAssetPath";
import { formatLocalDateTime } from "../../utils/formatters";
import { normalizeUsername } from "../../utils/playerNames";

type NavItem = {
  to: string;
  label: string;
  isActive: (pathname: string) => boolean;
  linkToPage?: boolean;
  children?: {
    to: string;
    label: string;
    isActive: (pathname: string) => boolean;
  }[];
};

type OpenPanel =
  | { type: "navDropdown"; navItemTo: string }
  | { type: "notifications" }
  | { type: "profile" }
  | { type: "settings" };

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
      pathname === "/solve" ||
      pathname.startsWith("/solve/") ||
      pathname.startsWith("/puzzles/") ||
      pathname === "/dashboard",
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
      {
        to: "/puzzles/motifs",
        label: "Tactical motifs",
        isActive: (pathname) => pathname === "/puzzles/motifs",
      },
      {
        to: "/puzzles/submit",
        label: "Submit puzzles",
        isActive: (pathname) => pathname === "/puzzles/submit",
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
      pathname.startsWith("/tournaments/") ||
      pathname === "/h2h" ||
      pathname.startsWith("/h2h/"),
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
      {
        to: "/h2h",
        label: "H2H",
        isActive: (pathname) => pathname === "/h2h" || pathname.startsWith("/h2h/"),
      },
    ],
  },
  {
    to: "/community",
    label: "Community",
    isActive: (pathname) =>
      pathname.startsWith("/community/") ||
      pathname === "/comments" ||
      pathname === "/users" ||
      pathname.startsWith("/users/"),
    children: [
      {
        to: "/users",
        label: "Players",
        isActive: (pathname) => pathname === "/users" || pathname.startsWith("/users/"),
      },
      {
        to: "/community/puzzles",
        label: "Puzzle votes",
        isActive: (pathname) => pathname === "/community/puzzles",
      },
      {
        to: "/community/users",
        label: "User activity",
        isActive: (pathname) => pathname === "/community/users",
      },
      {
        to: "/comments",
        label: "Comments",
        isActive: (pathname) => pathname === "/comments",
      },
    ],
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

const notificationCopy = (notification: UserNotification): string => {
  if (notification.notification_type === "puzzle_approved") {
    return `Your puzzle #${notification.puzzle_id} was approved.`;
  }
  if (notification.notification_type === "comment_reply") {
    return `${notification.actor_username ?? "Someone"} replied to your comment.`;
  }
  return `${notification.actor_username ?? "Someone"} commented on your puzzle.`;
};

const notificationIcon = (notification: UserNotification) => {
  if (notification.notification_type === "puzzle_approved") return faCheck;
  if (notification.notification_type === "comment_reply") return faReply;
  return faComment;
};

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
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchSuggestionsRequestIdRef = useRef(0);
  const topNavRef = useRef<HTMLElement | null>(null);
  const navDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navDropdownCloseTimeoutRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notificationsOpen = openPanel?.type === "notifications";
  const profileMenuOpen = openPanel?.type === "profile";
  const settingsOpen = openPanel?.type === "settings";
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { isAuthenticated, isLoading, user, login, logout } = useAuth();
  const queryClient = useQueryClient();
  const notificationViewerKey = isAuthenticated ? (user?.username ?? "authenticated") : "anonymous";
  const notificationListQuery = useQuery({
    ...notificationsQueryOptions(notificationViewerKey),
    enabled: isAuthenticated && notificationsOpen,
  });
  const unreadCountQuery = useQuery({
    ...unreadNotificationCountQueryOptions(notificationViewerKey),
    enabled: isAuthenticated,
  });
  const markNotificationsMutation = useMutation({
    mutationFn: markNotificationsRead,
    onSuccess: (result) => {
      queryClient.setQueryData(notificationQueryKeys.list(notificationViewerKey), result);
      queryClient.setQueryData(
        notificationQueryKeys.unreadCount(notificationViewerKey),
        result.unreadCount,
      );
    },
  });
  const notifications = notificationListQuery.data?.notifications ?? [];
  const unreadNotificationCount =
    unreadCountQuery.data ?? notificationListQuery.data?.unreadCount ?? 0;
  const notificationsLoading = notificationListQuery.isFetching;
  const notificationsUpdating = markNotificationsMutation.isPending;
  const notificationErrorValue = notificationListQuery.error ?? markNotificationsMutation.error;
  const notificationsError = notificationErrorValue
    ? notificationErrorValue instanceof Error
      ? notificationErrorValue.message
      : "Unable to update notifications."
    : "";
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
    showChessComRankings,
    setShowChessComRankings,
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
    if (!normalizedAuthUsername || !profileMenuOpen) {
      if (!normalizedAuthUsername) setProfileUsername("");
      return;
    }

    const storedProfileUsername = getStoredProfileUsername(normalizedAuthUsername);
    setProfileUsername(storedProfileUsername || normalizedAuthUsername);

    let cancelled = false;

    const loadProfileUsername = async () => {
      try {
        const { resolveProfileUsernameFromAliases } =
          await import("../../lib/supabase/supabaseAliases");
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
  }, [normalizedAuthUsername, profileMenuOpen]);

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

  const togglePanel = useCallback(
    (panel: OpenPanel): void => {
      clearNavDropdownCloseTimeout();
      setOpenPanel((currentPanel) => {
        if (currentPanel?.type !== panel.type) return panel;
        if (panel.type !== "navDropdown") return null;
        return currentPanel.type === "navDropdown" && currentPanel.navItemTo === panel.navItemTo
          ? null
          : panel;
      });
    },
    [clearNavDropdownCloseTimeout],
  );

  const openNavDropdownFor = useCallback(
    (navItemTo: string): void => {
      clearNavDropdownCloseTimeout();
      setOpenPanel({ type: "navDropdown", navItemTo });
    },
    [clearNavDropdownCloseTimeout],
  );

  const closeNavDropdown = useCallback((): void => {
    clearNavDropdownCloseTimeout();
    setOpenPanel((currentPanel) => (currentPanel?.type === "navDropdown" ? null : currentPanel));
  }, [clearNavDropdownCloseTimeout]);

  const scheduleNavDropdownClose = useCallback((): void => {
    clearNavDropdownCloseTimeout();
    navDropdownCloseTimeoutRef.current = window.setTimeout(() => {
      navDropdownCloseTimeoutRef.current = null;
      setOpenPanel((currentPanel) => (currentPanel?.type === "navDropdown" ? null : currentPanel));
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
    void import("../../lib/users/usernameSearch");
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

      void import("../../lib/users/usernameSearch")
        .then(({ searchUsernameSuggestions }) => searchUsernameSuggestions(trimmedSearchQuery))
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
    clearNavDropdownCloseTimeout();
    setOpenPanel(null);
  }, [clearNavDropdownCloseTimeout, pathname]);

  useEffect(() => {
    if (!openPanel) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      const panelElement =
        openPanel.type === "navDropdown"
          ? navDropdownRefs.current[openPanel.navItemTo]
          : openPanel.type === "notifications"
            ? notificationsRef.current
            : openPanel.type === "profile"
              ? profileMenuRef.current
              : settingsRef.current;

      if (panelElement?.contains(event.target as Node)) return;
      setOpenPanel(null);
    };
    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpenPanel(null);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [openPanel]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent): void => {
      if (topNavRef.current?.contains(event.target as Node)) return;
      setMobileMenuOpen(false);
      clearNavDropdownCloseTimeout();
      setOpenPanel(null);
    };

    const handleEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        clearNavDropdownCloseTimeout();
        setOpenPanel(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [clearNavDropdownCloseTimeout, mobileMenuOpen]);

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>): void => {
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

  const handleSearchSuggestionSelect = (suggestion: UsernameSearchSuggestion): void => {
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

  const markPopupNotificationsRead = async (ids: number[] = []): Promise<void> => {
    if (!isAuthenticated || notificationsUpdating) return;
    try {
      await markNotificationsMutation.mutateAsync(ids);
    } catch {
      // The mutation error is rendered in the notification panel.
    }
  };

  const openPopupNotification = async (notification: UserNotification): Promise<void> => {
    if (!notification.read_at) await markPopupNotificationsRead([notification.id]);
    setOpenPanel(null);
    void navigate({
      to: "/solve/$puzzleId",
      params: { puzzleId: String(notification.puzzle_id) },
      ...(notification.comment_id ? { hash: `comment-${notification.comment_id}` } : {}),
    });
  };

  return (
    <header className={`topNav ${mobileMenuOpen ? "mobileMenuOpen" : ""}`} ref={topNavRef}>
      <Link
        className={`homeBrand ${pathname === "/" ? "isActive" : ""}`}
        to="/"
        aria-label="Go to Atomic Puzzles home page"
        aria-current={pathname === "/" ? "page" : undefined}
      >
        <img
          className="brandMarkDark"
          src={appAssetPath("/favicon.ico")}
          alt=""
          width="30"
          height="30"
          aria-hidden="true"
        />
        <span className="brandMark brandMarkLight" aria-hidden="true">
          <svg viewBox="0 0 48 48" focusable="false">
            <ellipse cx="24" cy="24" rx="21" ry="8.5" transform="rotate(45 24 24)" />
            <ellipse cx="24" cy="24" rx="21" ry="8.5" transform="rotate(-45 24 24)" />
            <circle className="brandMarkNucleus" cx="24" cy="24" r="5.5" />
            <circle className="brandMarkElectron" cx="8" cy="7" r="2.4" />
            <circle className="brandMarkElectron" cx="39" cy="15" r="2.4" />
            <circle className="brandMarkElectron" cx="29" cy="40" r="2.4" />
          </svg>
        </span>
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
          clearNavDropdownCloseTimeout();
          setOpenPanel(null);
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
              const dropdownOpen =
                openPanel?.type === "navDropdown" && openPanel.navItemTo === item.to;
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
                  {item.linkToPage ? (
                    <Link
                      className="navDropdownTrigger"
                      to={item.to}
                      aria-current={active ? "page" : undefined}
                      onFocus={() => openNavDropdownFor(item.to)}
                      onClick={() => {
                        closeNavDropdown();
                        setMobileMenuOpen(false);
                      }}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <button
                      className="navDropdownTrigger"
                      type="button"
                      aria-haspopup="menu"
                      aria-expanded={dropdownOpen}
                      aria-current={active ? "page" : undefined}
                      onClick={() => togglePanel({ type: "navDropdown", navItemTo: item.to })}
                    >
                      {item.label}
                    </button>
                  )}
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
              role="combobox"
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
        {isAuthenticated ? (
          <div className="navNotifications" ref={notificationsRef}>
            <button
              className={`navNotificationsButton ${notificationsOpen ? "active" : ""}`}
              type="button"
              aria-label={
                unreadNotificationCount > 0
                  ? `${unreadNotificationCount} unread notifications`
                  : "Notifications"
              }
              aria-haspopup="dialog"
              aria-expanded={notificationsOpen}
              onClick={() => {
                setMobileMenuOpen(false);
                togglePanel({ type: "notifications" });
              }}
            >
              <FontAwesomeIcon icon={faBell} />
              {unreadNotificationCount > 0 ? (
                <span>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</span>
              ) : null}
            </button>
            {notificationsOpen ? (
              <section
                className="navNotificationsPopup"
                role="dialog"
                aria-modal="false"
                aria-labelledby="nav-notifications-title"
              >
                <header className="navNotificationsHeader">
                  <div>
                    <span>Inbox</span>
                    <h2 id="nav-notifications-title">Notifications</h2>
                  </div>
                  {unreadNotificationCount > 0 ? (
                    <button
                      type="button"
                      disabled={notificationsUpdating}
                      onClick={() => void markPopupNotificationsRead()}
                    >
                      <FontAwesomeIcon icon={faCheck} />
                      Mark all read
                    </button>
                  ) : null}
                </header>
                {notificationsLoading ? (
                  <p className="navNotificationsStatus">Loading notifications…</p>
                ) : null}
                {notificationsError ? (
                  <p className="navNotificationsError">{notificationsError}</p>
                ) : null}
                {!notificationsLoading && !notificationsError && notifications.length === 0 ? (
                  <div className="navNotificationsEmpty">
                    <FontAwesomeIcon icon={faBell} />
                    <strong>You’re all caught up</strong>
                  </div>
                ) : null}
                {notifications.length > 0 ? (
                  <ol className="navNotificationList">
                    {notifications.slice(0, 8).map((notification) => (
                      <li key={notification.id}>
                        <div
                          className={`navNotificationRow ${notification.read_at ? "read" : "unread"}`}
                        >
                          <button
                            type="button"
                            className="navNotificationOpenButton"
                            disabled={notificationsUpdating}
                            onClick={() => void openPopupNotification(notification)}
                          >
                            <span className="navNotificationIcon" aria-hidden="true">
                              <FontAwesomeIcon icon={notificationIcon(notification)} />
                            </span>
                            <span className="navNotificationCopy">
                              <strong>{notificationCopy(notification)}</strong>
                              <span>
                                {`Puzzle #${notification.puzzle_id} · ${formatLocalDateTime(notification.created_at)}`}
                              </span>
                            </span>
                            {!notification.read_at ? <span className="navNotificationDot" /> : null}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : null}
                <Link
                  className="navNotificationsSeeAll"
                  to="/notifications"
                  onClick={() => setOpenPanel(null)}
                >
                  See all notifications
                </Link>
              </section>
            ) : null}
          </div>
        ) : null}
        <div className="navAuth" aria-live="polite">
          {isAuthenticated && user ? (
            <div className="navProfileMenu" ref={profileMenuRef}>
              <button
                className={`navAuthProfileGroup ${profileMenuOpen ? "open" : ""}`}
                type="button"
                aria-label={`Open account menu for ${resolvedProfileUsername}`}
                aria-haspopup="menu"
                aria-expanded={profileMenuOpen}
                onClick={() => togglePanel({ type: "profile" })}
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
                    onClick={() => setOpenPanel(null)}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faUser} />
                    </span>
                    View profile
                  </Link>
                  <Link
                    className="navProfileDropdownItem"
                    to="/dashboard"
                    role="menuitem"
                    onClick={() => setOpenPanel(null)}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faChartLine} />
                    </span>
                    Puzzle dashboard
                  </Link>
                  {normalizedAuthUsername === "seaside_tiramisu" ? (
                    <Link
                      className="navProfileDropdownItem"
                      to="/puzzles/review"
                      role="menuitem"
                      onClick={() => setOpenPanel(null)}
                    >
                      <span className="navProfileDropdownIcon" aria-hidden="true">
                        <FontAwesomeIcon icon={faUser} />
                      </span>
                      Review puzzles
                    </Link>
                  ) : null}
                  <button
                    className="navProfileDropdownItem"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenPanel(null);
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
          ) : isLoading ? null : (
            <button className="navAuthButton" type="button" onClick={() => login(currentLocation)}>
              <FontAwesomeIcon icon={faRightToBracket} aria-hidden="true" />
              <span>Login</span>
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
            onClick={() => togglePanel({ type: "settings" })}
          >
            <FontAwesomeIcon icon={faGear} aria-hidden="true" />
          </button>
          {settingsOpen ? (
            <div className="navSettingsMenu" role="menu" aria-label="Site settings">
              <div className="navSettingsSection">
                <span className="navSettingsLabel">Appearance</span>
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
                    <FontAwesomeIcon className="navThemeCheck" icon={faCheck} aria-hidden="true" />
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
                    <FontAwesomeIcon className="navThemeCheck" icon={faCheck} aria-hidden="true" />
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
                  <label className="navSettingsCheckbox">
                    <span>Show Chess.com users only</span>
                    <input
                      type="checkbox"
                      checked={showChessComRankings}
                      onChange={(event) => setShowChessComRankings(event.target.checked)}
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
