import "./PlayerHoverCard.css";

import { faDog, faMedal, faUserCheck, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FocusEventHandler, MouseEventHandler, MutableRefObject, ReactNode, Ref } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { type Mode, modeLabels } from "../../constants/matches";
import { useAuth } from "../../context/AuthContext";
import {
  playerFlairQueryOptions,
  playerSocialQueryOptions,
  updateFollow,
} from "../../lib/playerSocial/playerSocial";
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
    flair: string | null;
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
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const canonicalUsername = normalizeUsername(username);
  const socialQuery = useQuery(playerSocialQueryOptions(canonicalUsername));
  const social = socialQuery.data;
  const countryCode = social?.countryCode ?? "";
  const ratings = new Map((social?.ratings ?? []).map((row) => [row.tc, row]));
  const followMutation = useMutation({
    mutationFn: (follow: boolean) => updateFollow(canonicalUsername, follow),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["player-social", canonicalUsername] });
    },
  });

  return (
    <div className="playerHoverCardBody" onMouseEnter={onRemainOpen}>
      <header className="playerHoverCardHeader">
        <strong>{canonicalUsername}</strong>
        {social?.flair ? <span className="playerHoverCardFlair">{social.flair}</span> : null}
        {countryCode ? (
          <span className="playerHoverCardCountry" title={countryName(countryCode)}>
            <img src={countryCodeToFlagUrl(countryCode)} alt="" aria-hidden="true" />
            <span>{countryName(countryCode)}</span>
          </span>
        ) : null}
        {social?.tourRank ? (
          <span className="playerHoverCardTourRank" title="Live Atomic Chess Tour rank">
            <FontAwesomeIcon icon={faMedal} aria-hidden="true" />#{social.tourRank}
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
                <FontAwesomeIcon icon={faDog} aria-hidden="true" />
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

      <div className="playerHoverCardActions">
        {social?.canFollow && isAuthenticated ? (
          <button
            type="button"
            className={social.isFollowing ? "isFollowing" : ""}
            disabled={followMutation.isPending}
            aria-pressed={social.isFollowing}
            onClick={() => followMutation.mutate(!social.isFollowing)}
          >
            <FontAwesomeIcon
              icon={social.isFollowing ? faUserCheck : faUserPlus}
              aria-hidden="true"
            />
            {followMutation.isPending ? "Saving…" : social.isFollowing ? "Following" : "Follow"}
          </button>
        ) : (
          <span />
        )}
        <span>{social ? `${social.followerCount.toLocaleString("en-US")} followers` : ""}</span>
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
  const flairQuery = useQuery(playerFlairQueryOptions(username));

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
    const estimatedHeight = 170;
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
        flair: flairQuery.data ?? null,
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
