import "./PlayerHoverCard.css";

import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FocusEventHandler, MouseEventHandler, MutableRefObject, ReactNode, Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type Mode, modeLabels } from "../../constants/matches";
import { fetchPlayerRatingsRows } from "../../lib/archive/ratings";
import { playerSocialQueryOptions } from "../../lib/playerSocial/playerSocial";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";
import { normalizeUsername } from "../../utils/playerNames";
import { lichessIcons } from "./lichessIcons";

type PlayerHoverCardTriggerProps = {
  anchorRef?: Ref<HTMLAnchorElement> | undefined;
  children: (props: {
    onBlur: FocusEventHandler<HTMLAnchorElement>;
    onFocus: FocusEventHandler<HTMLAnchorElement>;
    onMouseEnter: MouseEventHandler<HTMLAnchorElement>;
    onMouseLeave: MouseEventHandler<HTMLAnchorElement>;
    ref: (element: HTMLAnchorElement | null) => void;
  }) => ReactNode;
  username: string;
};

const ratingModes: Mode[] = ["hyperbullet", "bullet", "blitz", "rapid", "wolfrandom", "atomic960"];
const ratingLichessIcons = {
  hyperbullet: lichessIcons.ultraBullet,
  bullet: lichessIcons.bullet,
  blitz: lichessIcons.blitz,
  rapid: lichessIcons.rapid,
  atomic960: lichessIcons.chess960,
} as const;

const playerHoverRatingsQueryOptions = (username: string) => {
  const normalizedUsername = normalizeUsername(username);
  return queryOptions({
    queryKey: ["player-hover-ratings", normalizedUsername],
    queryFn: () => fetchPlayerRatingsRows({ username: normalizedUsername }),
    enabled: Boolean(normalizedUsername),
    staleTime: 5 * 60 * 1_000,
  });
};

const WolfIcon = () => (
  <svg viewBox="0 0 128 128" width="1em" height="1em" aria-hidden="true">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M10 7 43 27 64 15l21 12 33-20-12 41 10 12-17 12-8 27-27 24-27-24-8-27-17-12 10-12L10 7Zm17 19 5 25-8 8 13 5 15-10-14-17-11-11Zm74 0-11 11-14 17 15 10 13-5-8-8 5-25ZM43 69l9 29 12 13 12-13 9-29-21 12-21-12Zm6-16-12-5 7 10 12 3-7-8Zm30 0-7 8 12-3 7-10-12 5Z"
    />
    <path fill="currentColor" d="m55 91 9-5 9 5-9 8-9-8Z" />
  </svg>
);
const assignRef = <T,>(ref: Ref<T> | undefined, value: T | null): void => {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as MutableRefObject<T | null>).current = value;
};

const countryName = (countryCode: string): string => {
  if (!countryCode) return "";
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode.toUpperCase()) ?? "";
  } catch {
    return countryCode.toUpperCase();
  }
};

const countryLabel = (countryCode: string): string =>
  countryCode.toUpperCase() === "US" ? "USA" : countryName(countryCode);

const startedLabel = (dateValue: string | null | undefined): string => {
  if (!dateValue) return "";
  const date = new Date(`${dateValue}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  const elapsedMonths = Math.max(
    0,
    (new Date().getUTCFullYear() - date.getUTCFullYear()) * 12 +
      new Date().getUTCMonth() -
      date.getUTCMonth(),
  );
  if (elapsedMonths >= 24) return `Started ${Math.floor(elapsedMonths / 12)} years ago`;
  if (elapsedMonths >= 1)
    return `Started ${elapsedMonths} ${elapsedMonths === 1 ? "month" : "months"} ago`;
  const days = Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
  return `Started ${Math.max(1, days)} ${days === 1 ? "day" : "days"} ago`;
};

const PlayerHoverCardContent = ({
  username,
  onRemainOpen,
}: {
  username: string;
  onRemainOpen: () => void;
}) => {
  const canonicalUsername = normalizeUsername(username);
  const socialQuery = useQuery(playerSocialQueryOptions(canonicalUsername));
  const ratingsQuery = useQuery(playerHoverRatingsQueryOptions(canonicalUsername));
  const social = socialQuery.data;
  const countryCode = social?.countryCode ?? "";
  const ratings = new Map((ratingsQuery.data ?? []).map((row) => [row.tc, row]));

  return (
    <div className="playerHoverCardBody" onMouseEnter={onRemainOpen}>
      <header className="playerHoverCardHeader">
        <strong>{canonicalUsername}</strong>
        {social?.tourRank ? (
          <Link
            className="playerHoverCardTourRank"
            to="/rankings/tour"
            hash={`${social.tourRank}`}
            aria-label={`Atomic Chess Tour rank ${social.tourRank}`}
            title="Live Atomic Chess Tour rank"
          >
            #{social.tourRank}
          </Link>
        ) : null}
        {social?.flair ? <span className="playerHoverCardFlair">{social.flair}</span> : null}
        {countryCode ? (
          <span className="playerHoverCardCountry" title={countryName(countryCode)}>
            <img
              crossOrigin="anonymous"
              src={countryCodeToFlagUrl(countryCode)}
              alt=""
              decoding="async"
              aria-hidden="true"
            />
            <span>{countryLabel(countryCode)}</span>
          </span>
        ) : null}
      </header>

      <div className="playerHoverCardRatings" aria-label="Atomic ratings">
        {ratingModes.map((mode) => {
          const rating = ratings.get(mode);
          const value = rating?.rating;
          const display =
            value === null || value === undefined || !Number.isFinite(Number(value))
              ? "?"
              : `${Math.round(Number(value))}${(Number(rating?.rd) || 0) >= 100 ? "?" : ""}`;
          return (
            <span key={mode} className={`playerHoverCardRating ${mode}`} title={modeLabels[mode]}>
              {mode === "wolfrandom" ? (
                <WolfIcon />
              ) : (
                <span className="playerHoverCardLichessIcon" aria-hidden="true">
                  {ratingLichessIcons[mode]}
                </span>
              )}
              <span>{display}</span>
            </span>
          );
        })}
      </div>

      <footer className="playerHoverCardFooter">
        <span>{social ? `${social.totalGames.toLocaleString("en-US")} games` : ""}</span>
        <span>{startedLabel(social?.startDate)}</span>
      </footer>
    </div>
  );
};

export const PlayerHoverCardTrigger = ({
  anchorRef,
  children,
  username,
}: PlayerHoverCardTriggerProps) => {
  const triggerRef = useRef<HTMLAnchorElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12 });
  const queryClient = useQueryClient();

  const clearTimers = useCallback(() => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (openTimerRef.current) clearTimeout(openTimerRef.current);
  }, []);

  const placeCard = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const bounds = trigger.getBoundingClientRect();
    const width = Math.min(270, window.innerWidth - 16);
    const left = Math.max(8, Math.min(bounds.left, window.innerWidth - width - 8));
    const estimatedHeight = 138;
    const below = bounds.bottom + 8;
    const top =
      below + estimatedHeight <= window.innerHeight
        ? below
        : Math.max(8, bounds.top - estimatedHeight - 8);
    setPosition({ left, top });
  }, []);

  const openCard = useCallback(
    (immediate = false) => {
      clearTimers();
      const show = () => {
        placeCard();
        setOpen(true);
      };
      if (immediate) show();
      else openTimerRef.current = setTimeout(show, 280);
    },
    [clearTimers, placeCard],
  );

  const closeCard = useCallback(() => {
    clearTimers();
    closeTimerRef.current = setTimeout(() => setOpen(false), 160);
  }, [clearTimers]);

  useEffect(() => {
    if (!open) return;
    const reposition = () => placeCard();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, placeCard]);

  useEffect(() => clearTimers, [clearTimers]);

  const supportsHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  return (
    <>
      {children({
        ref: (element) => {
          triggerRef.current = element;
          assignRef(anchorRef, element);
        },
        onMouseEnter: () => {
          if (supportsHover()) {
            void queryClient.prefetchQuery(playerSocialQueryOptions(username));
            void queryClient.prefetchQuery(playerHoverRatingsQueryOptions(username));
            openCard();
          }
        },
        onMouseLeave: closeCard,
        onFocus: () => openCard(true),
        onBlur: closeCard,
      })}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="playerHoverCard"
              style={{ left: position.left, top: position.top }}
              role="group"
              aria-label={`${username} player card`}
              onFocusCapture={clearTimers}
              onBlurCapture={closeCard}
              onMouseEnter={clearTimers}
              onMouseLeave={closeCard}
            >
              <PlayerHoverCardContent username={username} onRemainOpen={clearTimers} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
};
