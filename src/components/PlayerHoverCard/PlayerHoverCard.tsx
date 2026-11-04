import "./PlayerHoverCard.css";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { FocusEventHandler, MouseEventHandler, MutableRefObject, ReactNode, Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type Mode, modeLabels } from "../../constants/matches";
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

const WolfIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M2 1 8 5l4-3 4 3 6-4-2 9 2 2-3 2-1.5 4L12 23l-5.5-5L5 14l-3-2 2-2-2-9Zm4.1 8.2 4.1 1.6-1.7 2.4-3-2.1.6-1.9Zm11.8 0 .6 1.9-3 2.1-1.7-2.4 4.1-1.6ZM8.2 15l3.8-2.3 3.8 2.3-1 3.3L12 21l-2.8-2.7-1-3.3Z"
    />
    <path fill="currentColor" d="m10.4 16.1 1.6-.8 1.6.8-1.6 1.5-1.6-1.5Z" />
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
  const social = socialQuery.data;
  const countryCode = social?.countryCode ?? "";
  const ratings = new Map((social?.ratings ?? []).map((row) => [row.tc, row]));

  return (
    <div className="playerHoverCardBody" onMouseEnter={onRemainOpen}>
      <header className="playerHoverCardHeader">
        <strong>{canonicalUsername}</strong>
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
        {social?.tourRank ? (
          <Link
            className="playerHoverCardTourRank"
            to="/rankings/tour"
            aria-label={`Atomic Chess Tour rank ${social.tourRank}`}
            title="Live Atomic Chess Tour rank"
          >
            #{social.tourRank}
          </Link>
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
