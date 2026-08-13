import { LichessVerificationError, verifyLichessAccount } from "../../lib/lichessAccount";
import { createSiteSessionCookie } from "../../lib/siteSession";
import type { FunctionEvent } from "../../platform/defineFunction";
import { HttpError } from "../../platform/errors";
import type { IdentityRepository } from "./repository";

export type OauthExchange = {
  code: string;
  codeVerifier: string;
  clientId: string;
  redirectUri: string;
};

const OAUTH_VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;

export const parseOauthExchange = (body: string | null | undefined): OauthExchange | null => {
  try {
    const input = JSON.parse(body ?? "") as Record<string, unknown>;
    const code = String(input.code ?? "").trim();
    const codeVerifier = String(input.codeVerifier ?? "").trim();
    const clientId = String(input.clientId ?? "").trim();
    const redirectUri = String(input.redirectUri ?? "").trim();
    const redirect = new URL(redirectUri);
    if (
      !OAUTH_VALUE_PATTERN.test(code) ||
      code.length > 512 ||
      !OAUTH_VALUE_PATTERN.test(codeVerifier) ||
      codeVerifier.length < 43 ||
      codeVerifier.length > 128 ||
      !clientId ||
      clientId.length > 512 ||
      redirectUri.length > 2_048 ||
      !["http:", "https:"].includes(redirect.protocol)
    ) {
      return null;
    }
    return { code, codeVerifier, clientId, redirectUri: redirect.toString() };
  } catch {
    return null;
  }
};

const exchangeLichessCode = async (input: OauthExchange): Promise<string> => {
  const response = await fetch("https://lichess.org/api/token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
    }),
  });
  const body = (await response.json().catch(() => null)) as {
    access_token?: unknown;
    error?: unknown;
    error_description?: unknown;
  } | null;
  const token = String(body?.access_token ?? "").trim();
  if (!response.ok || !OAUTH_VALUE_PATTERN.test(token) || token.length > 512) {
    const description = String(body?.error_description ?? body?.error ?? "").trim();
    throw new Error(description || "Lichess rejected the authorization code.");
  }
  return token;
};

export class IdentityService {
  constructor(private readonly repository: () => IdentityRepository) {}

  async logIn(
    oauthExchange: OauthExchange | null,
    legacyAccessToken: string,
    headers: FunctionEvent["headers"],
  ) {
    const accessToken = oauthExchange
      ? await exchangeLichessCode(oauthExchange)
      : legacyAccessToken;
    try {
      const account = await verifyLichessAccount(accessToken);
      const username = account?.username?.trim().toLowerCase() ?? "";
      if (!username || username.length > 100) {
        throw new HttpError(401, "Your Lichess login is no longer valid.");
      }

      try {
        await this.repository().register(username);
      } catch (error) {
        globalThis.console?.error(error);
      }
      return {
        username,
        cookie: createSiteSessionCookie(username, headers),
      };
    } catch (error) {
      if (error instanceof LichessVerificationError) {
        throw new HttpError(
          error.status === 429 ? 429 : 503,
          error.message,
          error.retryAfter ? { "Retry-After": error.retryAfter } : {},
        );
      }
      throw error;
    } finally {
      if (oauthExchange) {
        try {
          await fetch("https://lichess.org/api/token", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch {
          // Revocation is best effort; the exchanged token is never persisted.
        }
      }
    }
  }
}
