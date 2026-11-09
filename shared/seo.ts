export const SITE_URL = "https://atomicpuzzles.org";
export const SITE_NAME = "Atomic Puzzles";
export const HOME_TITLE = "Atomic Chess Puzzles, Analysis & Rankings | Atomic Puzzles";
export const HOME_DESCRIPTION =
  "Improve at atomic chess with 2,000+ puzzles, an analysis board, opening practice, player rankings, and Atomic World Championship brackets.";

export const canonicalUrlForPath = (path: string): string => {
  const pathname = new URL(path, SITE_URL).pathname.replace(/\/+$/, "");
  return `${SITE_URL}${pathname || "/"}`;
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

export const ATOMIC_CHESS_TITLE = "Atomic Chess: Rules, Strategy & Puzzles | Atomic Puzzles";
export const ATOMIC_CHESS_DESCRIPTION =
  "Learn atomic chess rules and strategy, from early queen attacks and knight invasions to middlegame tactics and endgames, with replayable study examples.";
export const ATOMIC_CHESS_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  "@id": `${SITE_URL}/atomic-chess#webpage`,
  url: `${SITE_URL}/atomic-chess`,
  name: ATOMIC_CHESS_TITLE,
  description: ATOMIC_CHESS_DESCRIPTION,
  inLanguage: "en",
  isPartOf: { "@id": `${SITE_URL}/#website` },
  about: { "@type": "Thing", name: "Atomic chess" },
};
