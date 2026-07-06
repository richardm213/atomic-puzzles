import { type AliasIdentityRow, fetchAliasRows } from "../supabase/supabaseAliases";

export type AliasLookupEntry = {
  primary: string;
  aliases: string[];
  openings: string[];
  banned: boolean;
};

export type AliasLookup = Map<string, AliasLookupEntry>;

const buildAliasesLookup = (rows: AliasIdentityRow[]): AliasLookup => {
  const lookup: AliasLookup = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const { aliases, openings } = row;
    const members = [username, ...aliases];
    const entry: AliasLookupEntry = {
      primary: username,
      aliases,
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
