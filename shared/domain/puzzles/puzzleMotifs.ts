import { atomicOpenings, getOpeningVariations } from "../atomicOpenings";

export type PuzzleMotif = {
  tag: string;
  name: string;
  description: string;
  parentTag?: string;
};

const openingTheoryMotif = (id: string, name: string, pgn: string): PuzzleMotif => ({
  tag: `theory_${id.replaceAll("-", "_")}`,
  name,
  parentTag: "theory",
  description: `Opening line: ${pgn}`,
});

export const puzzleMotifs: PuzzleMotif[] = [
  {
    tag: "advanced_pawn",
    name: "Advanced pawn",
    description:
      "An advanced pawn creates a decisive threat by promoting, controlling key squares, or capturing near the king.",
  },
  {
    tag: "queen_angles",
    name: "Queen angles",
    description:
      "The queen maneuvers around the position to create threats the defense cannot meet.",
  },
  {
    tag: "coercion",
    name: "Coercion",
    description:
      "A forcing move drives an opposing piece onto a square where it can be attacked or exploded.",
  },
  {
    tag: "diagonal_clearance",
    name: "Diagonal clearance",
    description:
      "An explosion clears a diagonal, allowing a bishop or queen to use the opened line. The explosion can come from your own capture or a capture you force your opponent to make.",
  },
  {
    tag: "file_clearance",
    name: "File clearance",
    description:
      "An explosion clears a file, allowing a rook or queen to use the opened line. The explosion can come from your own capture or a capture you force your opponent to make.",
  },
  {
    tag: "square_clearance",
    name: "Square clearance",
    description:
      "A square is cleared so another piece can use it, usually through a capture or forcing move.",
  },
  {
    tag: "fork",
    name: "Fork",
    description:
      "One piece attacks two or more targets at once, and the opponent cannot defend them all.",
  },
  {
    tag: "epaulette_fork",
    name: "Epaulette fork",
    parentTag: "fork",
    description:
      "A knight attacks both pieces beside the king, threatening to explode the king by capturing either one.",
  },
  {
    tag: "crescent_fork",
    name: "Crescent fork",
    parentTag: "fork",
    description:
      "A knight checks the king while attacking pieces around its escape squares, so every king move allows a capture that explodes the king.",
  },
  {
    tag: "zwischenzug",
    name: "Zwischenzug",
    description:
      "A forcing move is inserted before the natural continuation. Often, it lets a player escape a threat with tempo and then resume the intended line.",
  },
  {
    tag: "knight_invasion",
    name: "Knight invasion",
    description: "A tactic in which a knight enters the opponent's position.",
  },
  {
    tag: "bishop_invasion",
    name: "Bishop invasion",
    description: "A tactic in which a bishop enters the opponent's position.",
  },
  {
    tag: "rook_invasion",
    name: "Rook invasion",
    description: "A tactic in which a rook enters the opponent's position.",
  },
  {
    tag: "castling_rook_invasion",
    name: "Castling rook invasion",
    parentTag: "rook_invasion",
    description:
      "Castling activates a rook on a key file, where it forces the king to move, disrupts the defense, or creates lasting pressure.",
  },
  {
    tag: "trident",
    name: "Trident",
    description:
      "A bishop or queen lines up two pieces on the same diagonal, usually with a pawn in front, and threatens a capture that can’t be stopped.",
  },
  {
    tag: "sacrifice",
    name: "Sacrifice",
    description:
      "A rook or queen is deliberately given up to force mate, enable an invasion or clearance, or win material.",
  },
  {
    tag: "defensive",
    name: "Defensive move",
    description:
      "The opponent threatens mate or an invasion, and only an accurate defensive move keeps the position safe.",
  },
  {
    tag: "prophylaxis",
    name: "Prophylaxis",
    parentTag: "defensive",
    description:
      "A move that anticipates and prevents an opponent’s plan before it becomes a direct threat, often by guarding an invasion square or closing a line of entry.",
  },
  {
    tag: "prevent_invasion",
    name: "Prevent invasion",
    parentTag: "defensive",
    description:
      "A defensive move stops an opposing piece from entering the player's position and creating a threat.",
  },
  {
    tag: "prevent_knight_invasion",
    name: "Prevent knight invasion",
    parentTag: "prevent_invasion",
    description: "A defensive move denies an opposing knight a key landing square.",
  },
  {
    tag: "prevent_rook_invasion",
    name: "Prevent rook invasion",
    parentTag: "prevent_invasion",
    description: "A defensive move stops an opposing rook from penetrating along a file or rank.",
  },
  {
    tag: "prevent_queen_invasion",
    name: "Prevent queen invasion",
    parentTag: "prevent_invasion",
    description: "A defensive move closes or guards an entry point for the opposing queen.",
  },
  {
    tag: "prevent_bishop_invasion",
    name: "Prevent bishop invasion",
    parentTag: "prevent_invasion",
    description: "A defensive move stops an opposing bishop from penetrating along a diagonal.",
  },
  {
    tag: "material",
    name: "Material",
    description: "A tactic that wins material.",
  },
  {
    tag: "draw",
    name: "Draw",
    description: "A precise sequence earns a draw.",
  },
  {
    tag: "blocking",
    name: "Blocking",
    parentTag: "defensive",
    description:
      "A piece blocks a file or diagonal to stop an opposing piece from using or invading along it.",
  },
  {
    tag: "king_walk",
    name: "King walk",
    parentTag: "defensive",
    description:
      "The king escapes danger through a precise series of moves, avoiding controlled or explosion-threatened squares.",
  },
  {
    tag: "avoiding_perpetual",
    name: "Avoiding perpetual",
    parentTag: "defensive",
    description:
      "The player avoids a repeating series of checks or mating threats while preserving the winning advantage.",
  },
  {
    tag: "pin",
    name: "Pin",
    description:
      "A tactic that involves pinning a piece or using a pin to invade squares that would otherwise be defended.",
  },
  {
    tag: "unpinning",
    name: "Unpinning",
    description: "A pin is removed so a capture or invasion can be made.",
  },
  {
    tag: "tempo",
    name: "Tempo",
    description:
      "A forcing move compels the opponent to respond, often with a capture, passing the move back to you with a gained tempo.",
  },
  {
    tag: "discovered_mate",
    name: "Discovered mate",
    description:
      "A piece moves out of the way, uncovering a mating attack from the bishop, rook, or queen behind it.",
  },
  {
    tag: "rook_mate",
    name: "Rook mate",
    description: "A rook gives mate or creates an unavoidable mating threat along a rank or file.",
  },
  {
    tag: "bishop_knight_mate",
    name: "Bishop and knight mate",
    description:
      "A bishop and knight coordinate to give mate or create an unavoidable explosion-mate threat.",
  },
  {
    tag: "king_blockade",
    name: "King blockade",
    description: "The king blocks an opposing pawn from advancing, usually in the endgame.",
  },
  {
    tag: "square",
    name: "Square",
    description:
      "A tactic that relies on whether the king can draw by moving within a safe 2×2 square or is vulnerable to explosion mate without one.",
  },
  {
    tag: "explosion_mate_threat",
    name: "Explosion mate threat",
    description:
      "The threat to explode the king forces a concession, enables an invasion, or wins material.",
  },
  {
    tag: "exposed_king",
    name: "Exposed king",
    description:
      "The king has too little shelter, allowing direct checks or attacks that rely on its exposure.",
  },
  {
    tag: "explosion_defense",
    name: "Explosion defense",
    parentTag: "defensive",
    description:
      "An explosion or its threat stops an attack by removing an attacker, breaking an attacking line, or giving the king a safe square.",
  },
  {
    tag: "development",
    name: "Development",
    description:
      "Accurate piece development is required to maintain the advantage, and the sequence usually ends in castling.",
  },
  {
    tag: "stuck_pawn",
    name: "Stuck pawn",
    description: "A pawn stuck under another piece becomes a target.",
  },
  {
    tag: "stuck_piece",
    name: "Stuck piece",
    description:
      "A piece with no useful or safe move becomes trapped, attacked, or a target for an explosion.",
  },
  {
    tag: "endgame",
    name: "Endgame",
    description:
      "The solution requires precise endgame play with little material, such as a promotion race, active king, or exact piece placement.",
  },
  {
    tag: "threading_the_needle",
    name: "Threading the needle",
    parentTag: "endgame",
    description:
      "In an endgame, the queen and king thread an escape path away from the enemy king, forcing it next to its pawn where it will be exploded.",
  },
  {
    tag: "pawn_endgame",
    name: "Pawn endgame",
    parentTag: "endgame",
    description:
      "The solution requires precise play in an endgame where pawns, promotion races, and king activity are the central factors.",
  },
  {
    tag: "theory",
    name: "Theory",
    description: "The solution tests a move or idea from atomic opening theory.",
  },
  ...atomicOpenings.flatMap((opening) => [
    openingTheoryMotif(opening.id, opening.tag.label, opening.setup),
    ...getOpeningVariations(opening).flatMap((line) =>
      line.tag ? [openingTheoryMotif(line.id, line.tag.label, line.pgn)] : [],
    ),
  ]),
];

const puzzleMotifTagSet = new Set(puzzleMotifs.map((motif) => motif.tag));
const puzzleMotifParentByTag = new Map(puzzleMotifs.map(({ tag, parentTag }) => [tag, parentTag]));
const puzzleMotifTagAliases: Record<string, string> = {
  endgame_draw: "draw",
  equal: "draw",
};

export const isPuzzleMotifTag = (value: unknown): value is string =>
  typeof value === "string" && puzzleMotifTagSet.has(value);

export const normalizePuzzleMotifTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => puzzleMotifTagAliases[tag] ?? tag)
        .filter(isPuzzleMotifTag),
    ),
  ];
};

export const getPuzzleMotifParent = (motif: PuzzleMotif): PuzzleMotif | undefined =>
  motif.parentTag ? puzzleMotifs.find((candidate) => candidate.tag === motif.parentTag) : undefined;

export const getPuzzleMotifAncestors = (tag: string): string[] => {
  const ancestors: string[] = [];
  let current: string | undefined = tag;
  while (current && !ancestors.includes(current)) {
    ancestors.push(current);
    current = puzzleMotifParentByTag.get(current);
  }
  return ancestors;
};

export const getPuzzleMotifTreeRows = (
  motifs: PuzzleMotif[],
  expanded: ReadonlySet<string>,
  search: string,
  getName: (tag: string) => string,
): { motif: PuzzleMotif; depth: number; hasChildren: boolean }[] => {
  const query = search.trim().toLowerCase();
  const sorted = [...motifs].sort((a, b) => getName(a.tag).localeCompare(getName(b.tag)));
  if (query) {
    return sorted
      .filter(({ tag, name }) =>
        [name, tag.replaceAll("_", " "), getName(tag)].some((value) =>
          value.toLowerCase().includes(query),
        ),
      )
      .map((motif) => ({ motif, depth: 0, hasChildren: false }));
  }
  const tags = new Set(motifs.map(({ tag }) => tag));
  const rows: { motif: PuzzleMotif; depth: number; hasChildren: boolean }[] = [];
  const visit = (motif: PuzzleMotif, depth: number) => {
    const children = sorted.filter(({ parentTag }) => parentTag === motif.tag);
    rows.push({ motif, depth, hasChildren: children.length > 0 });
    if (expanded.has(motif.tag)) children.forEach((child) => visit(child, depth + 1));
  };
  sorted
    .filter(({ parentTag }) => !parentTag || !tags.has(parentTag))
    .forEach((root) => visit(root, 0));
  return rows;
};

// For display only: pass positive-net tags, leaving stored tags and filters intact.
export const getMostSpecificPuzzleMotifTags = (tags: readonly string[]): string[] => {
  const superseded = new Set<string>();
  for (const tag of tags) {
    let parent = puzzleMotifParentByTag.get(tag);
    while (parent && !superseded.has(parent)) {
      superseded.add(parent);
      parent = puzzleMotifParentByTag.get(parent);
    }
  }
  return tags.filter((tag) => !superseded.has(tag));
};

export const isPuzzleEndgameMotifTag = (tag: string): boolean => {
  const visited = new Set<string>();
  let currentTag = tag;

  while (currentTag && !visited.has(currentTag)) {
    if (currentTag === "endgame") return true;
    visited.add(currentTag);
    currentTag = puzzleMotifs.find((motif) => motif.tag === currentTag)?.parentTag ?? "";
  }

  return false;
};
