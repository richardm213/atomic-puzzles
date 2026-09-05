const ARCHIVE_API_PATH = "/api/archive-data";

export const fetchArchiveJson = async <T>(params: URLSearchParams): Promise<T> => {
  const response = await fetch(`${ARCHIVE_API_PATH}?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error?: unknown }).error ?? "")
        : "";
    throw new Error(message || `Archive request failed with HTTP ${response.status}`);
  }
  return body as T;
};

export const appendArchiveParam = (params: URLSearchParams, key: string, value: unknown): void => {
  if (value === undefined || value === null || String(value).trim() === "") return;
  params.set(key, String(value));
};
