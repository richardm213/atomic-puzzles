import { apiRequest } from "../api/postApi";

const ARCHIVE_API_PATH = "/api/archive-data";

export const fetchArchiveJson = <T>(params: URLSearchParams, signal?: AbortSignal): Promise<T> =>
  apiRequest<T>(`${ARCHIVE_API_PATH}?${params.toString()}`, {
    errorMessage: (response) => `Archive request failed with HTTP ${response.status}`,
    invalidMessage: "The archive returned invalid data.",
    ...(signal ? { signal } : {}),
  });

export const appendArchiveParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null || String(value).trim() === "") return;
  params.set(key, String(value));
};
