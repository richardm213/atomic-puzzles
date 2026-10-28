export const formatSignedDecimal = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return "";
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
};

export const formatElapsedDuration = (milliseconds: number): string => {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
};

export const formatLocalDateTime = (timestamp: number | string | Date): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const includeYear = date.getFullYear() !== now.getFullYear();
  const month = date.toLocaleString("en-US", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const time = date
    .toLocaleString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();

  return includeYear ? `${month} ${day}, ${year} ${time}` : `${month} ${day} ${time}`;
};

export const formatGameCount = (games: number): string => {
  if (games >= 1_000_000) {
    return `${(games / 1_000_000).toFixed(games >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")}M`;
  }

  if (games >= 1_000) {
    return `${(games / 1_000).toFixed(games >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }

  return String(games);
};

export const formatTimeControl = (timeControl: string): string =>
  timeControl.replace(/^0\.5\+/, "½+");

export const formatOrdinal = (value: number): string => {
  const lastTwoDigits = value % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
};

export const formatCalendarDate = (value: string | null | undefined): string => {
  if (!value) return "";

  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
};

export const formatCalendarMonth = (
  value: string | null | undefined,
  month: "short" | "long" = "long",
): string => {
  const monthValue = String(value ?? "").slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthValue)) return "";

  return new Date(`${monthValue}-01T00:00:00Z`).toLocaleString("en-US", {
    month,
    year: "numeric",
    timeZone: "UTC",
  });
};

export const formatCalendarDateRange = (
  startValue: string | null | undefined,
  endValue: string | null | undefined,
): string => {
  const start = formatCalendarDate(startValue);
  if (!start) return "";

  const end = formatCalendarDate(endValue);
  if (!end) return `${start} – present`;

  const startYear = String(startValue).slice(0, 4);
  const endYear = String(endValue).slice(0, 4);
  if (startYear !== endYear) return `${start} – ${end}`;

  return `${start.replace(`, ${startYear}`, "")} – ${end}`;
};

export const formatScore = (value: number | string): string => {
  const numeric = Number(value);
  return String(numeric);
};

export const formatOpponentWithRating = (
  opponent: string,
  opponentRating: number | string | null,
): string => {
  if (
    opponentRating === null ||
    String(opponentRating).trim() === "" ||
    !Number.isFinite(Number(opponentRating))
  )
    return opponent;
  return `${opponent} (${opponentRating})`;
};
