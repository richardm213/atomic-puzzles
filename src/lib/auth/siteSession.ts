import { appAssetPath } from "../../utils/appAssetPath";

export const clearAuthenticatedSiteSession = async (): Promise<void> => {
  await fetch(appAssetPath("/api/auth/session"), {
    method: "DELETE",
    credentials: "same-origin",
  });
};
