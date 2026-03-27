export const formatSignedDecimal = (value) => {
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
};

export const formatLocalDateTime = (timestamp) => {
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

export const formatScore = (value) => {
  const numeric = Number(value);
  return String(numeric);
};

export const formatOpponentWithRating = (opponent, opponentRating) => {
  return `${opponent} (${opponentRating})`;
};
