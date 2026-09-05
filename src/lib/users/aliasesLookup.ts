import { type AliasIdentityRow, fetchAliasRows } from "../archive/aliases";

export type AliasLookupEntry = {
  primary: string;
  aliases: string[];
  chessComAliases: string[];
  openings: string[];
  banned: boolean;
};

export type AliasLookup = Map<string, AliasLookupEntry>;

export const buildAliasesLookup = (rows: AliasIdentityRow[]): AliasLookup => {
  const lookup: AliasLookup = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const { aliases, openings } = row;
    const members = [username, ...aliases];
    const chessComAliases = [
      ...new Set(
        row.accounts
          .filter((account) => account.source === "chesscom")
          .map((account) => account.displayAlias || account.alias)
          .filter(Boolean),
      ),
    ];
    const entry: AliasLookupEntry = {
      primary: username,
      aliases,
      chessComAliases,
      openings,
      banned: Boolean(row.banned),
    };

    members.forEach((member) => {
      lookup.set(member, entry);
    });
  });

  return lookup;
};

export const loadAliasesLookup = async (): Promise<AliasLookup> =>
  buildAliasesLookup(await fetchAliasRows());
