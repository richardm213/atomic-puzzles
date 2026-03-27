import { useEffect, useState } from "react";

const aliasFileUrlCandidates = ["/private/users.txt", "/data/users.txt"];

const parseAliasLookup = (rawText) => {
  const lookup = new Map();
  const lines = String(rawText || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  lines.forEach((line) => {
    const members = line
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (members.length === 0) return;

    const uniqueMembers = [...new Set(members)];
    const [primary, ...aliases] = uniqueMembers;
    const entry = {
      primary,
      aliases,
      members: uniqueMembers,
    };

    uniqueMembers.forEach((member) => {
      lookup.set(member.toLowerCase(), entry);
    });
  });

  return lookup;
};

const loadAliasesLookup = async () => {
  let lastError = null;

  for (const url of aliasFileUrlCandidates) {
    try {
      const response = await fetch(url, { headers: { Accept: "text/plain" } });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      return parseAliasLookup(text);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw new Error(`Could not load aliases from configured sources (${String(lastError)})`);
  }

  return new Map();
};

export const useAliasesLookup = () => {
  const [aliasesLookup, setAliasesLookup] = useState(() => new Map());

  useEffect(() => {
    const loadAliases = async () => {
      try {
        const loadedLookup = await loadAliasesLookup();
        setAliasesLookup(loadedLookup);
      } catch {
        setAliasesLookup(new Map());
      }
    };

    loadAliases();
  }, []);

  return aliasesLookup;
};
