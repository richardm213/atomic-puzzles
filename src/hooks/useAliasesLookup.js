import { useEffect, useState } from "react";
import { fetchAliasRows } from "../lib/supabaseAliases";

const emptyLookup = new Map();

const buildAliasesLookup = (rows) => {
  const lookup = new Map();

  rows.forEach((row) => {
    const username = row.username;
    const aliases = Array.isArray(row.aliases) ? row.aliases : [];
    const members = [username, ...aliases];
    const entry = {
      primary: username,
      aliases,
      members,
    };

    members.forEach((member) => {
      lookup.set(member, entry);
    });
  });

  return lookup;
};

export const useAliasesLookup = () => {
  const [aliasesLookup, setAliasesLookup] = useState(() => emptyLookup);

  useEffect(() => {
    let isCurrent = true;

    const loadAliases = async () => {
      try {
        const rows = await fetchAliasRows();
        if (isCurrent) setAliasesLookup(buildAliasesLookup(rows));
      } catch {
        if (isCurrent) setAliasesLookup(emptyLookup);
      }
    };

    loadAliases();

    return () => {
      isCurrent = false;
    };
  }, []);

  return aliasesLookup;
};
