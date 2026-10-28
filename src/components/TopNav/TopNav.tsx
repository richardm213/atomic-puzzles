import "./TopNav.css";

import {
  faBan,
  faBars,
  faBell,
  faChartLine,
  faChevronDown,
  faClipboardCheck,
  faGear,
  faRightFromBracket,
  faRightToBracket,
  faTriangleExclamation,
  faTrophy,
  faUser,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { type ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

import { modeLabels } from "../../constants/matches";
import { getBoardThemeColors, type Theme, useAppSettings } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import { useNotificationNavigation } from "../../hooks/useNotificationNavigation";
import { formatCoinBalance } from "../../lib/coins/coinDisplay";
import { coinSummaryQueryOptions } from "../../lib/coins/coinQueries";
import {
  notificationQueryKeys,
  notificationsQueryOptions,
  unreadNotificationCountQueryOptions,
} from "../../lib/community/notificationQueries";
import { markNotificationsRead, type UserNotification } from "../../lib/community/notifications";
import { appAssetPath } from "../../utils/appAssetPath";
import { getBrowserStorageItem, setBrowserStorageItem } from "../../utils/browserStorage";
import { getErrorMessage } from "../../utils/errors";
import { normalizeUsername } from "../../utils/playerNames";
import { PlayerLink } from "../PlayerLink/PlayerLink";
import { TournamentPlayerLink } from "../TournamentPlayerLink/TournamentPlayerLink";
import { NavNotificationsPanel } from "./NavNotificationsPanel";
import { NavPlayerSearch } from "./NavPlayerSearch";
import { navItems } from "./topNavItems";

type OpenPanel =
  | { type: "navDropdown"; navItemTo: string }
  | { type: "notifications" }
  | { type: "profile" }
  | { type: "settings" };

const PROFILE_USERNAME_STORAGE_PREFIX = "atomic-puzzles.profile-username";
const NAV_DROPDOWN_CLOSE_DELAY_MS = 180;

const getStoredProfileUsername = (username: string | null | undefined): string => {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername || typeof window === "undefined") return "";

  return normalizeUsername(
    getBrowserStorageItem("local", `${PROFILE_USERNAME_STORAGE_PREFIX}.${normalizedUsername}`),
  );
};

const setStoredProfileUsername = (username: string, profileUsername: string): void => {
  const normalizedUsername = normalizeUsername(username);
  const normalizedProfileUsername = normalizeUsername(profileUsername);
  if (!normalizedUsername || !normalizedProfileUsername || typeof window === "undefined") return;

  setBrowserStorageItem(
    "local",
    `${PROFILE_USERNAME_STORAGE_PREFIX}.${normalizedUsername}`,
    normalizedProfileUsername,
  );
};

export const TopNav = () => {
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const topNavRef = useRef<HTMLElement | null>(null);
  const navDropdownRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const navDropdownCloseTimeoutRef = useRef<number | null>(null);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const settingsRef = useRef<HTMLDivElement | null>(null);
  const notificationsRef = useRef<HTMLDivElement | null>(null);
  const notificationsOpen = openPanel?.type === "notifications";
  const profileMenuOpen = openPanel?.type === "profile";
  const settingsOpen = openPanel?.type === "settings";
  const navigateToNotification = useNotificationNavigation();
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
  const coinSummaryQuery = useQuery({
    ...coinSummaryQueryOptions(user?.username ?? "anonymous"),
    enabled: isAuthenticated,
    refetchInterval: 15_000,
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
    ? getErrorMessage(notificationErrorValue, "Unable to update notifications.")
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
    showWolfrandomProfileRatings,
    setShowWolfrandomProfileRatings,
    showProfileActionButtons,
    setShowProfileActionButtons,
    hiddenRatingGraphModes,
    setHiddenRatingGraphModes,
    ratingGraphDots,
    setRatingGraphDots,
    ratingGraphFrequency,
    setRatingGraphFrequency,
    showRatingGraphLines,
    setShowRatingGraphLines,
    showPuzzleTimer,
    setShowPuzzleTimer,
    showCoinBalance,
    setShowCoinBalance,
    showCoinChangePopups,
    setShowCoinChangePopups,
  } = useAppSettings();
  const normalizedAuthUsername = normalizeUsername(user?.username);
  const canUseAmethystTheme =
    normalizedAuthUsername === "admin" || normalizedAuthUsername === "seaside_tiramisu";
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
      pathname !== "/solve/custom-sets" &&
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
        const { resolveProfileUsernameFromAliases } = await import("../../lib/archive/aliases");
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

  useEffect(() => {
    if (!isLoading && theme === "amethyst" && !canUseAmethystTheme) {
      setTheme("dark");
    }
  }, [canUseAmethystTheme, isLoading, setTheme, theme]);

  const resolvedProfileUsername = profileUsername || normalizedAuthUsername;

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

  useEffect(() => clearNavDropdownCloseTimeout, [clearNavDropdownCloseTimeout]);

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
    navigateToNotification(notification);
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
          className="brandMarkImage brandMarkDark"
          src={appAssetPath("/favicon.ico")}
          alt=""
          width="30"
          height="30"
          aria-hidden="true"
        />
        <img
          className="brandMarkImage brandMarkLight"
          src={appAssetPath("/images/brand/atomic-logo-light.png")}
          alt=""
          width="30"
          height="30"
          aria-hidden="true"
        />
        <img
          className="brandMarkImage brandMarkAmethyst"
          src={appAssetPath("/images/brand/atomic-logo-amethyst.png")}
          alt=""
          width="30"
          height="30"
          aria-hidden="true"
        />
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
          {navItems.map((item) => {
            const active = item.isActive(pathname);
            if (item.children) {
              const dropdownOpen =
                openPanel?.type === "navDropdown" && openPanel.navItemTo === item.to;
              return (
                <div
                  className={`navDropdown ${item.hideInCompactNav ? "compactNavHidden" : ""} ${active ? "isActive" : ""} ${
                    dropdownOpen ? "open" : ""
                  }`}
                  key={item.to}
                  ref={(element) => {
                    navDropdownRefs.current[item.to] = element;
                  }}
                  onMouseEnter={mobileMenuOpen ? undefined : () => openNavDropdownFor(item.to)}
                  onMouseLeave={mobileMenuOpen ? undefined : scheduleNavDropdownClose}
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
        <NavPlayerSearch onNavigate={() => setMobileMenuOpen(false)} />
        {isAuthenticated && showCoinBalance && coinSummaryQuery.data ? (
          <Link
            className="navCoinBalance"
            to="/shop"
            aria-label={`${formatCoinBalance(coinSummaryQuery.data.balance)} coins${
              coinSummaryQuery.data.dailyClaimAvailable ? ". Daily bonus available" : ""
            }. Open coin shop.`}
          >
            <img
              src={appAssetPath("/images/coins/gold-coin-stack-v2.png")}
              alt=""
              aria-hidden="true"
            />
            <span>{formatCoinBalance(coinSummaryQuery.data.balance)}</span>
          </Link>
        ) : null}
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
              <NavNotificationsPanel
                notifications={notifications}
                unreadCount={unreadNotificationCount}
                loading={notificationsLoading}
                updating={notificationsUpdating}
                error={notificationsError}
                onMarkAllRead={() => void markPopupNotificationsRead()}
                onOpenNotification={(notification) => void openPopupNotification(notification)}
                onClose={() => setOpenPanel(null)}
              />
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
                  <PlayerLink
                    className="navProfileDropdownItem"
                    username={resolvedProfileUsername}
                    role="menuitem"
                    onClick={() => setOpenPanel(null)}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faUser} />
                    </span>
                    View profile
                  </PlayerLink>
                  <TournamentPlayerLink
                    className="navProfileDropdownItem"
                    username={resolvedProfileUsername}
                    role="menuitem"
                    onClick={() => setOpenPanel(null)}
                  >
                    <span className="navProfileDropdownIcon" aria-hidden="true">
                      <FontAwesomeIcon icon={faTrophy} />
                    </span>
                    Tournament profile
                  </TournamentPlayerLink>
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
                    <>
                      <div className="navProfileDropdownDivider" role="separator" />
                      <Link
                        className="navProfileDropdownItem"
                        to="/admin/shop-redemptions"
                        role="menuitem"
                        onClick={() => setOpenPanel(null)}
                      >
                        <span className="navProfileDropdownIcon" aria-hidden="true">
                          <FontAwesomeIcon icon={faClipboardCheck} />
                        </span>
                        Shop redemptions
                      </Link>
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
                      <Link
                        className="navProfileDropdownItem"
                        to="/puzzles/issues"
                        role="menuitem"
                        onClick={() => setOpenPanel(null)}
                      >
                        <span className="navProfileDropdownIcon" aria-hidden="true">
                          <FontAwesomeIcon icon={faTriangleExclamation} />
                        </span>
                        Puzzle issues
                      </Link>
                      <Link
                        className="navProfileDropdownItem"
                        to="/admin/coin-bans"
                        role="menuitem"
                        onClick={() => setOpenPanel(null)}
                      >
                        <span className="navProfileDropdownIcon" aria-hidden="true">
                          <FontAwesomeIcon icon={faBan} />
                        </span>
                        Coin economy bans
                      </Link>
                    </>
                  ) : null}
                  <div className="navProfileDropdownDivider" role="separator" />
                  <button
                    className="navProfileDropdownItem navProfileDropdownLogout"
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
                <label className="navSettingsLabel" htmlFor="site-theme-select">
                  Theme
                </label>
                <select
                  id="site-theme-select"
                  value={theme}
                  onChange={(event) => {
                    const nextTheme = event.target.value as Theme;
                    if (nextTheme === "amethyst" && !canUseAmethystTheme) return;
                    if (nextTheme === "amethyst" && boardTheme === "blue") {
                      setBoardTheme("purple");
                      setBoardColorOverrideTheme("");
                    }
                    setTheme(nextTheme);
                  }}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="amethyst" disabled={!canUseAmethystTheme}>
                    {canUseAmethystTheme ? "Amethyst" : "Amethyst — Locked"}
                  </option>
                </select>
              </div>
              <div className="navSettingsSection">
                <label className="navSettingsCheckbox">
                  <span>Show coin balance</span>
                  <input
                    type="checkbox"
                    checked={showCoinBalance}
                    onChange={(event) => setShowCoinBalance(event.target.checked)}
                  />
                </label>
              </div>
              {pathname === "/rankings" || pathname === "/rankings/yearly" ? (
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
              {/^\/@\/[^/]+\/?$/.test(pathname) ? (
                <div className="navSettingsSection">
                  <label className="navSettingsCheckbox">
                    <span>Show Wolfrandom ratings</span>
                    <input
                      type="checkbox"
                      checked={showWolfrandomProfileRatings}
                      onChange={(event) => setShowWolfrandomProfileRatings(event.target.checked)}
                    />
                  </label>
                  <label className="navSettingsCheckbox">
                    <span>Show profile action buttons</span>
                    <input
                      type="checkbox"
                      checked={showProfileActionButtons}
                      onChange={(event) => setShowProfileActionButtons(event.target.checked)}
                    />
                  </label>
                </div>
              ) : null}
              {/^\/@\/[^/]+\/ratings\/?$/.test(pathname) ? (
                <div className="navSettingsSection">
                  <label className="navSettingsLabel" htmlFor="rating-frequency">
                    Rating frequency
                  </label>
                  <select
                    id="rating-frequency"
                    value={ratingGraphFrequency}
                    onChange={(event) =>
                      setRatingGraphFrequency(event.target.value as "weekly" | "monthly")
                    }
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                  <label className="navSettingsLabel" htmlFor="rating-dots">
                    Dots
                  </label>
                  <select
                    id="rating-dots"
                    value={ratingGraphDots}
                    onChange={(event) =>
                      setRatingGraphDots(event.target.value as "auto" | "show" | "hide")
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="show">Show</option>
                    <option value="hide">Hide</option>
                  </select>
                  {(["blitz", "bullet", "hyperbullet"] as const).map((mode) => (
                    <label className="navSettingsCheckbox" key={mode}>
                      <span>{modeLabels[mode]}</span>
                      <input
                        type="checkbox"
                        checked={!hiddenRatingGraphModes.includes(mode)}
                        onChange={(event) => {
                          const visible = event.target.checked;
                          setHiddenRatingGraphModes((current) =>
                            visible
                              ? current.filter((value) => value !== mode)
                              : [...new Set([...current, mode])],
                          );
                        }}
                      />
                    </label>
                  ))}
                  <label className="navSettingsCheckbox">
                    <span>Show lines</span>
                    <input
                      type="checkbox"
                      checked={showRatingGraphLines}
                      onChange={(event) => setShowRatingGraphLines(event.target.checked)}
                    />
                  </label>
                </div>
              ) : null}
              {showBoardSettings ? (
                <>
                  {showPuzzleTimerSetting ? (
                    <div className="navSettingsSection puzzleTimerSettingsSection">
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
                  {showPuzzleTimerSetting ? (
                    <div className="navSettingsSection">
                      <label className="navSettingsCheckbox">
                        <span>Show coin change popups</span>
                        <input
                          type="checkbox"
                          checked={showCoinChangePopups}
                          onChange={(event) => setShowCoinChangePopups(event.target.checked)}
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
