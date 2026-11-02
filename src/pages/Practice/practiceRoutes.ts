import { normalizePracticeUsernames } from "./usePracticeSettings";

export const practiceUsernamesFromRoute = (value: string | undefined): string[] =>
  normalizePracticeUsernames(value?.split(",") ?? []);

export const practiceRouteParam = (usernames: string[]): string | undefined => {
  const normalizedUsernames = normalizePracticeUsernames(usernames);
  return normalizedUsernames.length ? normalizedUsernames.join(",") : undefined;
};

export const practicePath = (usernames: string[]): string => {
  const normalizedUsernames = normalizePracticeUsernames(usernames);
  return normalizedUsernames.length
    ? `/practice/${normalizedUsernames.map(encodeURIComponent).join(",")}`
    : "/practice";
};
