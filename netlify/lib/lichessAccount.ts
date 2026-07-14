export type RequestHeaders = Record<string, string | undefined>;

export type LichessAccount = {
  username?: string;
  id?: string;
};

export const getRequestHeader = (headers: RequestHeaders | undefined, name: string): string => {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === lowerName && value) return value;
  }
  return "";
};

export const parseBearerToken = (headers: RequestHeaders | undefined): string => {
  const authorization = getRequestHeader(headers, "authorization");
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
};

export const verifyLichessAccount = async (accessToken: string): Promise<LichessAccount | null> => {
  const response = await fetch("https://lichess.org/api/account", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) return null;

  const account = (await response.json()) as LichessAccount;
  return account?.username ? account : null;
};
