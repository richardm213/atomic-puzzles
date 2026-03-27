export const formatSignedDecimal = (value) => {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  if (rounded > 0) return `+${rounded.toFixed(1)}`;
  return rounded.toFixed(1);
};

export const formatLocalDateTime = (timestamp) => {
  if (!Number.isFinite(timestamp)) return "—";
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
  if (!Number.isFinite(numeric)) return "0.0";
  return numeric.toFixed(1);
};

export const formatOpponentWithRating = (opponent, opponentRating) => {
  if (!Number.isFinite(opponentRating)) return opponent;
  return `${opponent} (${opponentRating.toFixed(1)})`;
};
