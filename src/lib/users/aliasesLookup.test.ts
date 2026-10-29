import { buildAliasesLookup } from "./aliasesLookup";

describe("buildAliasesLookup", () => {
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
            displayAlias: "ExactCase960",
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
