import { parseBearerToken } from "../../lib/lichessAccount";
import { clearSiteSessionCookie, readSiteSession } from "../../lib/siteSession";
import { requireSameOrigin } from "../../platform/authentication";
import { type FunctionEvent, jsonResponse } from "../../platform/defineFunction";
import { HttpError } from "../../platform/errors";
import { IdentityService, parseOauthExchange } from "./service";

export const authSessionRoute = async (event: FunctionEvent) => {
  if (event.httpMethod === "GET") {
    const session = readSiteSession(event.headers);
    if (!session) throw new HttpError(401, "No authenticated site session.");
    return jsonResponse(200, { user: { username: session.username } });
  }

  requireSameOrigin(event.headers, "Cross-site session requests are not allowed.");
  if (event.httpMethod === "DELETE") {
    return jsonResponse(
      200,
      { cleared: true },
      { "Set-Cookie": clearSiteSessionCookie(event.headers) },
    );
  }

  const oauthExchange = parseOauthExchange(event.body);
  const legacyAccessToken = parseBearerToken(event.headers);
  if (!oauthExchange && !legacyAccessToken) {
    throw new HttpError(400, "Invalid Lichess login exchange.");
  }
  const service = new IdentityService();
  const login = await service.logIn(oauthExchange, legacyAccessToken, event.headers);
  return jsonResponse(200, { user: { username: login.username } }, { "Set-Cookie": login.cookie });
};
