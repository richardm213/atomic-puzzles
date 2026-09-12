/** Archive timestamps are epoch milliseconds; omit timeZone to use the viewer's zone. */
export const formatRankingUpdatedAt = (timestamp: number | null | undefined): string => {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${time.toLowerCase()}`;
};
