import { buildAliasesLookup } from "./aliasesLookup";

describe("buildAliasesLookup", () => {
  it("keeps Chess.com aliases in their source order", () => {
    const lookup = buildAliasesLookup([
      {
        username: "canonical",
        aliases: ["lichess_alt", "chesscom_one", "chesscom_two"],
        openings: [],
        banned: false,
        accounts: [
          {
            alias: "canonical",
            displayAlias: "canonical",
            source: "lichess",
            isCounted: true,
            banned: false,
          },
          {
            alias: "chesscom_one",
            displayAlias: "chesscom_one",
            source: "chesscom",
            isCounted: true,
            banned: false,
          },
          {
            alias: "chesscom_two",
            displayAlias: "chesscom_two",
            source: "chesscom",
            isCounted: true,
            banned: false,
          },
        ],
      },
    ]);

    expect(lookup.get("canonical")?.chessComAliases).toEqual(["chesscom_one", "chesscom_two"]);
    expect(lookup.get("lichess_alt")?.chessComAliases[0]).toBe("chesscom_one");
  });
});
