import { fetchAliasRows } from "./supabaseAliases";

export const buildAliasesLookup = (rows) => {
  const lookup = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    const members = [username, ...aliases];
    const entry = {
      primary: username,
      aliases,
      members,
      banned: Boolean(row.banned),
    };

    members.forEach((member) => {
      lookup.set(member, entry);
    });
  });

  return lookup;
};

export const loadAliasesLookup = async () => buildAliasesLookup(await fetchAliasRows());
