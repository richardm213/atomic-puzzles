import { fetchAliasRows, type MergedAliasRow } from "../supabase/supabaseAliases";

export type AliasLookupEntry = {
  primary: string;
  aliases: string[];
  members: string[];
  countableAliases: string[];
  banned: boolean;
};

export type AliasLookup = Map<string, AliasLookupEntry>;

const buildAliasesLookup = (rows: MergedAliasRow[]): AliasLookup => {
  const lookup: AliasLookup = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    const members = [username, ...aliases];
    const countableAliases = Array.isArray(row.countableAliases) ? row.countableAliases : members;
    const entry: AliasLookupEntry = {
      primary: username,
      aliases,
      members,
      countableAliases,
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
