export const profileHistoryTabOptions = ["matches", "ranks", "opponents", "comments"] as const;
export type ProfileHistoryTab = (typeof profileHistoryTabOptions)[number];
export type RankHistoryView = "history" | "trophies";

const isProfileHistoryTab = (value: string): value is ProfileHistoryTab =>
  (profileHistoryTabOptions as readonly string[]).includes(value);

export const getProfileHistoryTabFromSearch = (search: string): ProfileHistoryTab => {
  const requestedTab = new URLSearchParams(search).get("tab") ?? "";
  if (requestedTab === "trophies") return "ranks";
  return isProfileHistoryTab(requestedTab) ? requestedTab : "matches";
};

export const getProfileHistoryTabFromLocation = (): ProfileHistoryTab =>
  typeof window === "undefined"
    ? "matches"
    : getProfileHistoryTabFromSearch(window.location.search);

export const getRankHistoryViewFromLocation = (): RankHistoryView => {
  if (typeof window === "undefined") return "history";
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get("tab") === "trophies" || searchParams.get("view") === "trophies"
    ? "trophies"
    : "history";
};

export const pushProfileHistoryLocation = (
  tab: ProfileHistoryTab,
  rankView?: RankHistoryView,
): void => {
  if (typeof window === "undefined") return;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set("tab", tab);
  if (tab === "ranks" && rankView === "trophies") {
    nextUrl.searchParams.set("view", "trophies");
  } else {
    nextUrl.searchParams.delete("view");
  }
  window.history.pushState({}, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
};
