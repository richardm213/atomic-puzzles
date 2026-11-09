import { ATOMIC_CHESS_DESCRIPTION, ATOMIC_CHESS_TITLE, canonicalUrlForPath, HOME_DESCRIPTION, HOME_TITLE, SITE_NAME } from "../../shared/seo";

export type SocialMetadata = {
  title: string;
  description?: string;
  robots?: string;
};

type EdgeContext = {
  next: () => Promise<Response>;
};

const staticMetadata: Record<string, SocialMetadata> = {
  "/": {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
  "/atomic-chess": { title: ATOMIC_CHESS_TITLE, description: ATOMIC_CHESS_DESCRIPTION },
  "/solve": {
    title: "Solve Atomic Chess Puzzles",
    description: "Solve atomic chess puzzles drawn from real games and community analysis.",
  },
  "/rankings": {
    title: "Atomic Chess Rankings",
    description: "Compare monthly atomic chess ratings across standard and variant modes.",
  },
  "/rankings/yearly": {
    title: "Yearly Atomic Chess Rankings",
    description: "Compare yearly atomic chess ratings and ranking history.",
  },
  "/rankings/openings": {
    title: "Atomic Opening Rankings",
    description: "Rank meaningful opening choices using AtomicDB evaluations.",
  },
  "/rankings/tour": {
    title: "Atomic Chess Tour Rankings",
    description: "View the rolling two-year Atomic Chess Tour standings.",
  },
  "/rankings/puzzles": {
    title: "Atomic Puzzle Rankings",
    description: "Browse monthly and all-time Atomic Puzzles leaderboards.",
  },
  "/users": {
    title: "Atomic Chess Players",
    description: "Browse atomic player ratings, peaks, openings, and linked accounts.",
  },
  "/matches": {
    title: "Recent Atomic Chess Matches",
    description: "Search recent atomic chess matches by player, mode, rating, and date.",
  },
  "/recent": {
    title: "Recent Atomic Chess Matches",
    description: "Search recent atomic chess matches by player, mode, rating, and date.",
  },
  "/tournaments": {
    title: "Atomic Chess Tournaments",
    description: "Browse atomic chess tournament brackets, results, and archives.",
  },
  "/arenas": {
    title: "Atomic Arena Results",
    description: "View official Monthly, Shield, and Yearly Lichess Atomic arena results.",
  },
  "/calendar": {
    title: "Atomic Chess Calendar",
    description: "See the schedule for official Lichess Atomic arenas.",
  },
  "/h2h": {
    title: "Atomic Chess Head-to-Head",
    description: "Compare two atomic chess players across their archived matches.",
  },
  "/analysis": {
    title: "Atomic Chess Analysis",
    description: "Analyze atomic chess positions and explore opening continuations.",
  },
  "/practice": {
    title: "Atomic Chess Opening Practice",
    description: "Practice atomic openings against the game database or a selected player.",
  },
  "/puzzles/endgames": {
    title: "Atomic Endgame Practice",
    description: "Practice timed atomic queen endgames and compare leaderboard results.",
  },
  "/tactical-motifs": {
    title: "Atomic Puzzle Motifs",
    description: "Explore the tactical motifs used to classify Atomic Puzzles.",
  },
  "/solve/sets": {
    title: "Atomic Puzzle Sets",
    description: "Browse atomic puzzle events and solve complete puzzle sets.",
  },
  "/solve/leaderboard": {
    title: "Atomic Puzzle Leaderboard",
    description: "Browse monthly and all-time Atomic Puzzles rankings.",
  },
  "/shop": {
    title: "Atomic Puzzles Shop",
    description: "Earn Atomic Coins by creating and solving puzzles.",
  },
  "/achievements": {
    title: "Atomic Chess Achievements",
    description: "Browse permanent Atomic Chess puzzle and rating badges.",
  },
  "/comments": {
    title: "Atomic Puzzles Community Comments",
    description: "See the newest and top-rated Atomic Puzzles community comments.",
  },
  "/community": {
    title: "Atomic Puzzles Community",
    description: "Explore community puzzle activity, comments, and player contributions.",
  },
};

const decodePathSegment = (value: string | undefined): string => {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const displayPathName = (value: string): string =>
  decodePathSegment(value)
    .replaceAll(/[-_]+/g, " ")
    .replaceAll(/\b\w/g, (letter) => letter.toUpperCase());

const possessive = (value: string): string => (/s$/i.test(value) ? `${value}'` : `${value}'s`);

const profileMetadata = (segments: string[]): SocialMetadata | null => {
  if (segments[0] !== "@" || !segments[1]) return null;

  const username = decodePathSegment(segments[1]);
  const usernamePossessive = possessive(username);
  const section = segments[2] ?? "";
  if (section === "history") {
    return {
      title: `${usernamePossessive} Atomic Chess Matches`,
      description: `View ${usernamePossessive} atomic chess match history, rank history, and favorite opponents.`,
    };
  }
  if (section === "ratings") {
    return {
      title: `${usernamePossessive} Atomic Chess Ratings`,
      description: `View weekly and monthly atomic chess rating history for ${username}.`,
    };
  }
  if (section === "achievements") {
    return {
      title: `${usernamePossessive} Atomic Chess Achievements`,
      description: `View ${usernamePossessive} permanent Atomic Chess badges and milestones.`,
    };
  }
  if (section === "puzzles") {
    return {
      title: `${usernamePossessive} Atomic Puzzles`,
      description: `View puzzle progress, ratings, and created puzzles for ${username}.`,
    };
  }
  if (section === "contributions") {
    return {
      title: `${usernamePossessive} Puzzle Contributions`,
      description: `View Atomic Puzzles community contributions from ${username}.`,
    };
  }

  return {
    title: `${username} — Atomic Chess Profile`,
    description: `View ${usernamePossessive} atomic chess ratings, rankings, aliases, and recent matches.`,
  };
};

const puzzleMetadata = (segments: string[]): SocialMetadata | null => {
  if (segments[0] !== "solve") return null;
  const puzzleId = segments.at(-1);
  if (!puzzleId || !/^\d+$/.test(puzzleId)) return null;

  return {
    title: `Atomic Puzzle #${puzzleId}`,
    description: `Solve atomic chess puzzle #${puzzleId}.`,
  };
};

const dynamicMetadata = (segments: string[]): SocialMetadata | null => {
  const profile = profileMetadata(segments);
  if (profile) return profile;

  const puzzle = puzzleMetadata(segments);
  if (puzzle) return puzzle;

  if (segments[0] === "matches" && segments.length >= 2) {
    const matchId = decodePathSegment(segments.at(-1));
    return {
      title: `Atomic Match ${matchId}`,
      description: "Replay the complete atomic chess match game by game.",
    };
  }

  if (segments[0] === "tournaments" && segments[1] === "players" && segments[2]) {
    const username = decodePathSegment(segments[2]);
    return {
      title: `${possessive(username)} Atomic Tournament History`,
      description: `View tournament appearances and results for ${username}.`,
    };
  }

  if (segments[0] === "tournaments" && segments[1]) {
    const tournamentName = displayPathName(segments[1]);
    return {
      title: `${tournamentName} — Atomic Chess Tournament`,
      description: `View the ${tournamentName} bracket, results, and match archive.`,
    };
  }

  if (segments[0] === "h2h" && segments[1]) {
    return {
      title: "Atomic Chess Head-to-Head",
      description: "Compare these atomic chess players across their archived matches.",
    };
  }

  if (segments[0] === "practice" && segments[1]) {
    const usernames = segments[1].split(",").map(decodePathSegment).filter(Boolean);
    const opponentLabel = usernames.join(", ");
    return {
      title:
        usernames.length === 1 ? `Practice against ${opponentLabel}` : "Opening Database Practice",
      description: `Practice atomic openings against games played by ${opponentLabel}.`,
    };
  }

  return null;
};

export const metadataForPath = (pathname: string): SocialMetadata => {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
  const knownMetadata = staticMetadata[normalizedPath];
  if (knownMetadata) return knownMetadata;

  const segments = normalizedPath.split("/").filter(Boolean);
  const pageMetadata = dynamicMetadata(segments);
  if (pageMetadata) return pageMetadata;

  const isPrivatePage = ["admin", "auth", "dashboard", "notifications"].includes(segments[0] ?? "");
  return isPrivatePage ? { title: SITE_NAME, robots: "noindex,nofollow" } : { title: SITE_NAME };
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const stripExistingSocialMetadata = (html: string): string =>
  html
    .replace(/\s*<title\b[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(
      /\s*<meta\b(?=[^>]*(?:name|property)=["'](?:description|robots|og:title|og:description|og:url|twitter:title|twitter:description)["'])[^>]*>/gi,
      "",
    )
    .replace(/\s*<link\b(?=[^>]*rel=["']canonical["'])[^>]*>/gi, "");

export const injectSocialMetadata = (
  html: string,
  metadata: SocialMetadata,
  canonicalUrl: string,
): string => {
  const title = escapeHtml(metadata.title);
  const url = escapeHtml(canonicalUrl);
  const robots = escapeHtml(metadata.robots ?? "index,follow");
  const description = metadata.description
    ? `\n    <meta name="description" content="${escapeHtml(metadata.description)}" />\n    <meta property="og:description" content="${escapeHtml(metadata.description)}" />\n    <meta name="twitter:description" content="${escapeHtml(metadata.description)}" />`
    : "";
  const tags = `
    <title>${title}</title>
    <meta name="robots" content="${robots}" />
    <meta property="og:title" content="${title}" />${description}
    <meta property="og:url" content="${url}" />
    <meta name="twitter:title" content="${title}" />
    <link rel="canonical" href="${url}" />`;

  return stripExistingSocialMetadata(html).replace("</head>", `${tags}\n  </head>`);
};

export default async (request: Request, context: EdgeContext): Promise<Response> => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const url = new URL(request.url);
  const metadata = metadataForPath(url.pathname);
  const canonicalUrl = canonicalUrlForPath(url.pathname);
  const html = injectSocialMetadata(await response.text(), metadata, canonicalUrl);
  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export const config = {
  path: "/*",
  excludedPath: [
    "/api/*",
    "/.netlify/*",
    "/assets/*",
    "/images/*",
    "/*.css",
    "/*.ico",
    "/*.js",
    "/*.json",
    "/*.map",
    "/*.png",
    "/*.svg",
    "/*.txt",
    "/*.xml",
    "/*.webmanifest",
    "/*.woff2",
  ],
  method: "GET",
  onError: "bypass",
};
