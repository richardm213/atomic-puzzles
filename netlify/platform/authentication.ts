import { isSameOriginRequest, resolveSiteIdentity } from "../lib/siteSession";
import type { FunctionEvent } from "./defineFunction";
import { jsonResponse } from "./defineFunction";
import { HttpError } from "./errors";

export type RequestIdentity = {
  username: string | null;
  hadBearerToken: boolean;
  setCookie: string;
};

export const authenticateRequest = async (
  headers: FunctionEvent["headers"],
  allowAnonymous = false,
): Promise<RequestIdentity> => {
  try {
    return await resolveSiteIdentity(headers);
  } catch (error) {
    if (!allowAnonymous) throw error;
    return { username: null, hadBearerToken: false, setCookie: "" };
  }
};

export const requireSameOrigin = (headers: FunctionEvent["headers"], message: string): void => {
  if (!isSameOriginRequest(headers)) throw new HttpError(403, message);
};

export const requireUsername = (identity: RequestIdentity, message: string): string => {
  if (!identity.username) throw new HttpError(401, message);
  return identity.username;
};

export const identityResponse = (
  identity: RequestIdentity,
  statusCode: number,
  body: Record<string, unknown>,
) => jsonResponse(statusCode, body, identity.setCookie ? { "Set-Cookie": identity.setCookie } : {});
