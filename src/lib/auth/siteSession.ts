import { appAssetPath } from "../../utils/appAssetPath";
import { invalidateLichessSessionForResponse } from "./lichessAuth";

export const registerAuthenticatedSiteUser = async (accessToken: string): Promise<void> => {
  if (!accessToken) return;

  const response = await fetch(appAssetPath("/api/auth/session"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });
  invalidateLichessSessionForResponse(response, accessToken);
  if (!response.ok) throw new Error("Unable to register the authenticated site user.");
};
