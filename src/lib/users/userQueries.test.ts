import { afterEach, describe, expect, it, vi } from "vitest";

import { registeredSiteUsernameQueryOptions, userQueryKeys } from "./userQueries";

const isRegisteredSiteUser = vi.hoisted(() => vi.fn());
vi.mock("../supabase/users", () => ({ isRegisteredSiteUser }));

afterEach(() => vi.clearAllMocks());

describe("registered site username lookup", () => {
  it("uses a registered alias when the canonical username has no site account", async () => {
    isRegisteredSiteUser.mockImplementation(
      async (username: string) => username === "active_alias",
    );

    const options = registeredSiteUsernameQueryOptions([
      "Canonical_User",
      "ACTIVE_ALIAS",
      "active_alias",
    ]);

    expect(options.queryKey).toEqual(
      userQueryKeys.aliasRegistration(["canonical_user", "active_alias"]),
    );
    await expect(options.queryFn?.({} as never)).resolves.toBe("active_alias");
    expect(isRegisteredSiteUser).toHaveBeenCalledTimes(2);
  });

  it("prefers the canonical username when it has a site account", async () => {
    isRegisteredSiteUser.mockResolvedValue(true);

    const options = registeredSiteUsernameQueryOptions(["canonical_user", "other_alias"]);

    await expect(options.queryFn?.({} as never)).resolves.toBe("canonical_user");
    expect(isRegisteredSiteUser).toHaveBeenCalledOnce();
  });
});
