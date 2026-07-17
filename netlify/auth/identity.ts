import type { NetlifyEvent } from "../http/handler";
import { resolveSiteIdentity } from "../lib/siteSession";

export type RequestIdentity = {
  username: string | null;
  hadBearerToken: boolean;
  setCookie: string;
};

export const authenticateRequest = async (
  headers: NetlifyEvent["headers"],
  allowAnonymous: boolean,
): Promise<RequestIdentity> => {
  try {
    return await resolveSiteIdentity(headers);
  } catch (error) {
    if (!allowAnonymous) throw error;
    return { username: null, hadBearerToken: false, setCookie: "" };
  }
};
