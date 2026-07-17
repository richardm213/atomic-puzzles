import type { AliasAccountSource } from "../../lib/supabase/supabaseAliases";

const lichessProfileUrl = (username: string): string =>
  `https://lichess.org/@/${encodeURIComponent(String(username || "").trim())}`;

const chessComProfileUrl = (username: string): string =>
  `https://www.chess.com/member/${encodeURIComponent(String(username || "").trim())}`;

export const NON_COUNTED_ALIAS_MESSAGE =
  "This account is marked as a drunk account and is not included in the rating system.";

const openingToneClasses: Record<string, string> = {
  "nf3 e3": "openingToneNf3E3",
  "nf3 e4": "openingToneNf3E4",
  "nf3 na3": "openingToneNf3Na3",
  e4: "openingToneE4",
  e5: "openingToneE5",
  d4: "openingToneD4",
  d6: "openingToneD6",
  "2n": "openingTone2n",
  "2n h3": "openingTone2nH3",
  "nh3 d4": "openingToneNh3D4",
  "nh3 e4": "openingToneNh3E4",
  "nh3 e3": "openingToneNh3E3",
  "nh3 na3": "openingToneNh3Na3",
  nc3: "openingToneNc3",
  na3: "openingToneNa3",
  "nf3 d4": "openingToneNf3D4",
  "nf3 nd4": "openingToneNf3Nd4",
  "nf3 c3": "openingToneNf3C3",
  "e3 nc3": "openingToneE3Nc3",
  "e3 qh5": "openingToneE3Qh5",
  "e3 qf3": "openingToneE3Qf3",
  "e3 f4": "openingToneE3F4",
  "e3 b4": "openingToneE3B4",
  "nh3 nc3": "openingToneNh3Nc3",
  variety: "openingToneVariety",
};

export const getOpeningToneClass = (opening: string): string =>
  openingToneClasses[
    String(opening || "")
      .trim()
      .toLowerCase()
  ] ?? "openingToneDefault";

export const profileResultToneClass = (playerScore: number, opponentScore: number): string => {
  if (playerScore > opponentScore) return " winner";
  if (playerScore < opponentScore) return " loser";
  return "";
};

export const getAliasProfileHref = (source: AliasAccountSource, alias: string): string =>
  source === "chesscom" ? chessComProfileUrl(alias) : lichessProfileUrl(alias);

export const getAliasProfileSourceLabel = (source: AliasAccountSource): string =>
  source === "chesscom" ? "Chess.com" : "Lichess";

export const LichessProfileIcon = () => (
  <svg viewBox="0 0 50 50" aria-hidden="true" focusable="false">
    <path
      d="M38.956.5c-3.53.418-6.452.902-9.286 2.984C5.534 1.786-.692 18.533.68 29.364 3.493 50.214 31.918 55.785 41.329 41.7c-7.444 7.696-19.276 8.752-28.323 3.084S-.506 27.392 4.683 17.567C9.873 7.742 18.996 4.535 29.03 6.405c2.43-1.418 5.225-3.22 7.655-3.187l-1.694 4.86 12.752 21.37c-.439 5.654-5.459 6.112-5.459 6.112-.574-1.47-1.634-2.942-4.842-6.036-3.207-3.094-17.465-10.177-15.788-16.207-2.001 6.967 10.311 14.152 14.04 17.663 3.73 3.51 5.426 6.04 5.795 6.756 0 0 9.392-2.504 7.838-8.927L37.4 7.171z"
      fill="currentColor"
    />
  </svg>
);

export const ChessComProfileIcon = () => (
  <svg className="chessComProfileIcon" viewBox="-2 0 82 110" aria-hidden="true" focusable="false">
    <path
      className="chessComIconShadow"
      d="M46.3 4.6C55.1 7.4 61.5 15.7 61.5 25.7c0 6.7-2.8 12.6-7.3 16.7l10.6 8c-.4 5.5-2.1 9.7-5.2 12.6h-9.3c.9 8 5.4 14.1 13.4 19.4 7.1 4.6 10.8 10 11 16.3-5.6 2.9-17.5 4.3-35.7 4.3-18.5 0-30.5-1.4-36.1-4.3.2-6.3 3.9-11.7 11-16.3 8-5.3 12.5-11.4 13.4-19.4H18c-3.1-2.9-4.8-7.1-5.2-12.6l10.6-8c-4.5-4.1-7.3-10-7.3-16.7C16.1 13.5 26 3.7 38.2 3.7c2.8 0 5.5.3 8.1.9z"
    />
    <path
      className="chessComIconBody"
      d="M38.2 3.7c12.2 0 22.2 9.8 22.2 22 0 6.7-2.9 12.6-7.3 16.7l10.6 8c-.4 5.5-2.1 9.7-5.2 12.6h-9.3c.9 8 5.4 14.1 13.4 19.4 7.1 4.6 10.8 10 11 16.3-5.6 2.9-17.6 4.3-36 4.3S7.3 101.6 1.7 98.7c.2-6.3 3.9-11.7 11-16.3 8-5.3 12.5-11.4 13.4-19.4h-9.3c-3.1-2.9-4.8-7.1-5.2-12.6l10.6-8c-4.4-4.1-7.3-10-7.3-16.7 0-12.2 10-22 22.2-22h1.1z"
    />
    <path
      className="chessComIconFront"
      d="M35.7 5.5C24.9 6.8 16.4 16.1 16.4 27.4c0 6.1 2.4 11.4 6.3 15.4l-9.9 7.6c.5 3.7 1.7 6.4 3.7 8.2h16.2c.3 12.5-4.7 22.2-14.9 29-5.4 3.6-8.8 7.2-10.3 10.6 5.2 1.8 14.3 2.7 27.2 2.7 2.8 0 5.3 0 7.7-.1 7.7-5.1 12-13.3 12.9-24.4.7-7.6-.8-13-4.6-16.1-3.2-2.6-8.4-3.9-15.7-3.9h-5.8L34.5 40 24.4 25.4C34.9 22 40.5 15.2 41 5c-1.7-.4-3.5-.6-5.3-.6z"
    />
    <ellipse
      className="chessComIconHighlight"
      cx="33.5"
      cy="16.8"
      rx="9.2"
      ry="4.9"
      transform="rotate(-35 33.5 16.8)"
    />
  </svg>
);
