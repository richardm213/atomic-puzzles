export const formatSignedDecimal = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
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

export const formatScore = (value: number | string): string => {
  const numeric = Number(value);
  return String(numeric);
};

export const formatOpponentWithRating = (
  opponent: string,
  opponentRating: number | string,
): string => {
  return `${opponent} (${opponentRating})`;
};
