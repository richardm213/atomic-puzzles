export const SITE_URL = "https://atomicpuzzles.org";
export const SITE_NAME = "Atomic Puzzles";
export const ATOMIC_CHESS_PATH = "/atomic-chess/";
export const TACTICAL_MOTIFS_PATH = "/tactical-motifs/";
export const TACTICAL_MOTIFS_TITLE = "Atomic Chess Tactical Motifs";
export const TACTICAL_MOTIFS_DESCRIPTION =
  "Explore atomic chess tactics through definitions and replayable puzzle examples.";
export const HOME_TITLE = "Atomic Chess Puzzles, Analysis & Rankings | Atomic Puzzles";
export const HOME_DESCRIPTION =
  "Improve at atomic chess with 2,000+ puzzles, an analysis board, opening practice, player rankings, and Atomic World Championship brackets.";

export const canonicalUrlForPath = (path: string): string => {
  const pathname = new URL(path, SITE_URL).pathname.replace(/\/+$/, "");
  if (pathname === "/index.html") return `${SITE_URL}/`;
  // Shared board positions are states of the analysis tool, not separate landing pages.
  if (pathname.startsWith("/analysis/")) return `${SITE_URL}/analysis`;
  // Netlify serves these pre-rendered pages from directories with a trailing slash.
  const directory = [ATOMIC_CHESS_PATH, TACTICAL_MOTIFS_PATH].find(
    (entry) => pathname === entry.slice(0, -1) || pathname === `${entry}index.html`,
  );
  return `${SITE_URL}${directory ?? (pathname || "/")}`;
};

export const HOME_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "@id": `${SITE_URL}/#website`,
  name: SITE_NAME,
  url: `${SITE_URL}/`,
  description: HOME_DESCRIPTION,
  inLanguage: "en",
};

export const ATOMIC_CHESS_TITLE = "Atomic Chess: Rules & Strategy Guide | Atomic Puzzles";
export const ATOMIC_CHESS_DESCRIPTION =
  "Learn how to play atomic chess: see which pieces explode, when kings can touch, and how to spot winning attacks in interactive examples.";
export const ATOMIC_CHESS_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}${ATOMIC_CHESS_PATH}#webpage`,
  url: `${SITE_URL}${ATOMIC_CHESS_PATH}`,
  name: ATOMIC_CHESS_TITLE,
  description: ATOMIC_CHESS_DESCRIPTION,
  inLanguage: "en",
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@type": "Thing", name: "Atomic chess" },
};
