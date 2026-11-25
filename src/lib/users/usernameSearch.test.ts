import { expect, it, vi } from "vitest";

import { searchUsernameSuggestions } from "./usernameSearch";

vi.mock("../archive/client", () => ({
  appendArchiveParam: (params: URLSearchParams, key: string, value: string) =>
    params.set(key, value),
  fetchArchiveJson: async (params: URLSearchParams) => {
    if (params.get("resource") === "usernames") return [{ username: "needle960" }];
    return [
      { username: "needleplayer", alias: "Needle960", count_games: "p" },
      { username: "needleplayer", alias: "NeedleShared", count_games: "p" },
      { username: "needleplayer", alias: "needleshared", count_games: "y" },
      { username: "needleplayer", alias: "needleside", count_games: "y" },
    ];
  },
}));

vi.mock("../supabase/client", () => ({
  getSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        ilike: () => ({
          limit: async () => ({ data: [{ username: "needle960" }, { username: "needlefan" }] }),
        }),
        in: async () => ({ data: [] }),
        order: () => ({ limit: async () => ({ data: [] }) }),
      }),
    }),
  }),
}));

it("excludes PyChess-only aliases even when the username sources also return them", async () => {
  const results = await searchUsernameSuggestions("needle", undefined, {
    excludePyChessAliases: true,
  });

  expect(results.map(({ matchedName }) => matchedName).sort()).toEqual([
    "needlefan",
    "needleplayer",
    "needleshared",
    "needleside",
  ]);
});
