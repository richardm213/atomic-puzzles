import { apiRequest } from "../api/postApi";

export const clearAuthenticatedSiteSession = async (): Promise<void> => {
  await apiRequest("/api/auth/session", {
    method: "DELETE",
    errorMessage: "Unable to clear the site session.",
  });
};
