import { buildAliasIdentityRowsFromArchiveRows } from "../archive/aliases";
import { buildAliasesLookup } from "./aliasesLookup";

describe("buildAliasesLookup", () => {
  it("resolves historical authors excluded from public aliases without changing banned status", () => {
    const rows = buildAliasIdentityRowsFromArchiveRows([
      {
        alias: "ralionkaalyebenka",
        username: "thuban",
        banned: true,
        count_games: "y",
        openings: "{}",
        bot: false,
      },
    ]);
    expect(rows[0].aliases).toEqual([]);
    const lookup = buildAliasesLookup(rows);
    expect(lookup.get("ralionkaalyebenka")).toBe(lookup.get("thuban"));
    expect(lookup.get("ralionkaalyebenka")?.primary).toBe("thuban");
    expect(lookup.get("ralionkaalyebenka")?.banned).toBe(true);
  });

  it("keeps platform aliases in their source order and preserves PyChess case", () => {
    const lookup = buildAliasesLookup([
      {
        username: "canonical",
        aliases: ["lichess_alt", "chesscom_one", "chesscom_two"],
        openings: [],
        banned: false,
        bot: false,
        accounts: [
          {
            alias: "canonical",
            displayAlias: "canonical",
            source: "lichess",
            isCounted: true,
            banned: false,
            bot: false,
          },
          {
            alias: "chesscom_one",
            displayAlias: "chesscom_one",
            source: "chesscom",
            isCounted: true,
            banned: false,
            bot: false,
          },
          {
            alias: "chesscom_two",
            displayAlias: "chesscom_two",
            source: "chesscom",
            isCounted: true,
            banned: false,
            bot: false,
          },
          {
            alias: "ExactCase960",
            displayAlias: "exactcase960",
            source: "pychess",
            isCounted: true,
            banned: false,
            bot: false,
          },
        ],
      },
    ]);

    expect(lookup.get("canonical")?.chessComAliases).toEqual(["chesscom_one", "chesscom_two"]);
    expect(lookup.get("lichess_alt")?.chessComAliases[0]).toBe("chesscom_one");
    expect(lookup.get("canonical")?.pyChessAliases).toEqual(["ExactCase960"]);
  });
});
