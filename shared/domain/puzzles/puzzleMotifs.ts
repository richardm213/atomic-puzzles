export type PuzzleMotif = {
  tag: string;
  name: string;
  description: string;
  parentTag?: string;
};

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
      "A forcing move drives an opposing piece onto a square where it can be attacked or captured.",
  },
  {
    tag: "diagonal_clearance",
    name: "Diagonal clearance",
    description:
      "An explosion clears a diagonal, allowing a bishop or queen to use the opened line. The player's move or a forced opposing capture may cause the explosion.",
  },
  {
    tag: "file_clearance",
    name: "File clearance",
    description:
      "An explosion clears a file, allowing a rook or queen to use the opened line. The player's move or a forced opposing capture may cause the explosion.",
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
    tag: "zwischenzug",
    name: "Zwischenzug",
    description:
      "A forcing move is inserted before the expected reply, escaping a threat or making the intended continuation possible.",
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
      "A bishop or queen lines up two pieces on the same diagonal. Capturing the nearer piece opens new lines, while attacking from a distance may lead to mate.",
  },
  {
    tag: "sacrifice",
    name: "Sacrifice",
    description:
      "A rook or queen is deliberately given up to force mate, enable an invasion or clearance, or win material.",
  },
  {
    tag: "defensive",
    name: "Defensive",
    description:
      "The opponent threatens mate or an invasion, and only an accurate defensive move keeps the position safe.",
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
      "A tactic that involves pinning a piece, attacking a pinned piece, or using a pin to invade on squares that would otherwise be defended.",
  },
  {
    tag: "unpinning",
    name: "Unpinning",
    description:
      "A pin is removed so the pinned piece can move or capture and create a decisive threat.",
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
    tag: "king_blockade",
    name: "King blockade",
    description: "The king blocks an opposing pawn from advancing, usually in the endgame.",
  },
  {
    tag: "square",
    name: "Square",
    description:
      "A drawing mechanism in which the king moves safely around a 2×2 square, preventing the opponent from creating an explosion mate.",
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
    description: "A pawn with no useful move becomes a weakness, an obstruction, or a target.",
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
];

const puzzleMotifTagSet = new Set(puzzleMotifs.map((motif) => motif.tag));
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

export const getPuzzleMotifAnchor = (tag: string): string => `motif-${tag}`;
