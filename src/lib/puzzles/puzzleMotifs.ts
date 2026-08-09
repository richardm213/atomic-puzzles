export type PuzzleMotifCategory =
  "Attack and mate" | "Clearance and control" | "Defense and survival" | "Position and endgame";

export type PuzzleMotif = {
  tag: string;
  name: string;
  category: PuzzleMotifCategory;
  description: string;
};

export const puzzleMotifs: PuzzleMotif[] = [
  {
    tag: "advanced_pawn",
    name: "Advanced pawn",
    category: "Position and endgame",
    description:
      "A tactic in which a pawn advanced into the opponent's position creates a decisive threat through promotion, control of key squares, or a capture near the king.",
  },
  {
    tag: "queen_angles",
    name: "Queen angles",
    category: "Attack and mate",
    description:
      "A tactic in which the queen changes files, ranks, or diagonals to attack a target from a new angle and bypass its current defense.",
  },
  {
    tag: "coercion",
    name: "Coercion",
    category: "Clearance and control",
    description:
      "A tactic in which a forcing move drives an opposing piece to a square where it will later be attacked or captured.",
  },
  {
    tag: "diagonal_clearance",
    name: "Diagonal clearance",
    category: "Clearance and control",
    description:
      "A tactic in which a piece is removed from a diagonal so that a bishop or queen can use the opened line. The clearance may result from the player's move or a forced opposing capture.",
  },
  {
    tag: "file_clearance",
    name: "File clearance",
    category: "Clearance and control",
    description:
      "A tactic in which a piece is removed from a file so that a rook or queen can use the opened line. The clearance may result from the player's move or a forced opposing capture.",
  },
  {
    tag: "square_clearance",
    name: "Square clearance",
    category: "Clearance and control",
    description:
      "A tactic in which an occupied, controlled, or explosion-vulnerable square is cleared so that another piece can use it. The clearance is usually achieved by a capture or forcing move.",
  },
  {
    tag: "fork",
    name: "Fork",
    category: "Attack and mate",
    description:
      "A tactic in which one piece attacks two or more targets at the same time, leaving the opponent unable to answer every threat.",
  },
  {
    tag: "zwischenzug",
    name: "Zwischenzug",
    category: "Clearance and control",
    description:
      "A tactic in which an intermediate forcing move is played before the expected reply, escaping a bind or threat with tempo and making the intended continuation possible.",
  },
  {
    tag: "knight_invasion",
    name: "Knight invasion",
    category: "Attack and mate",
    description:
      "A tactic in which a knight enters the opponent's position on a key square and creates a decisive mating, fork, or material threat.",
  },
  {
    tag: "bishop_invasion",
    name: "Bishop invasion",
    category: "Attack and mate",
    description:
      "A tactic in which a bishop enters the opponent's position on a key diagonal and creates a decisive mating, explosion, or restriction threat.",
  },
  {
    tag: "rook_invasion",
    name: "Rook invasion",
    category: "Attack and mate",
    description:
      "A tactic in which a rook enters the opponent's position on a key rank or file and creates a decisive mating, explosion, or material threat.",
  },
  {
    tag: "castling_rook_invasion",
    name: "Castling rook invasion",
    category: "Attack and mate",
    description:
      "A tactic in which castling places a rook on the rank or file from which it can invade the opponent's position or create a decisive threat.",
  },
  {
    tag: "trident",
    name: "Trident",
    category: "Attack and mate",
    description:
      "A tactic in which a bishop or queen pierces two pieces on the same diagonal. A capture can open additional files and diagonals, while greater separation can produce a mating threat.",
  },
  {
    tag: "sacrifice",
    name: "Sacrifice",
    category: "Attack and mate",
    description:
      "A tactic in which a rook or queen is deliberately given up to obtain a stronger result, such as mate, invasion, clearance, or a decisive material gain.",
  },
  {
    tag: "defensive",
    name: "Defensive",
    category: "Defense and survival",
    description:
      "A tactic in which the opponent threatens mate or an invasion and an accurate defensive move is required. Other natural responses fail.",
  },
  {
    tag: "material",
    name: "Material",
    category: "Attack and mate",
    description:
      "A tactic whose principal result is winning material or preventing a material loss rather than delivering mate.",
  },
  {
    tag: "draw",
    name: "Draw",
    category: "Defense and survival",
    description:
      "A tactic in which a precise sequence secures a draw from a position that would otherwise be lost or clearly worse.",
  },
  {
    tag: "blocking",
    name: "Blocking",
    category: "Defense and survival",
    description:
      "A tactic in which a piece is placed on a file or diagonal to prevent an opposing piece from invading or using that line.",
  },
  {
    tag: "king_walk",
    name: "King walk",
    category: "Defense and survival",
    description:
      "A defensive tactic in which the king escapes danger through a precise sequence of king moves while avoiding controlled and explosion-vulnerable squares.",
  },
  {
    tag: "avoiding_perpetual",
    name: "Avoiding perpetual",
    category: "Defense and survival",
    description:
      "A defensive tactic in which a repeating sequence of checks or mating threats is prevented while the winning advantage is preserved.",
  },
  {
    tag: "pin",
    name: "Pin",
    category: "Clearance and control",
    description:
      "A tactic in which a piece cannot move without exposing the king or a more valuable piece to a decisive attack.",
  },
  {
    tag: "unpinning",
    name: "Unpinning",
    category: "Clearance and control",
    description:
      "A tactic in which a pin is removed so that the formerly pinned piece can move or capture and create a decisive threat.",
  },
  {
    tag: "tempo",
    name: "Tempo",
    category: "Clearance and control",
    description:
      "A tactic in which a forcing or waiting move makes the opponent move first, producing a favorable move order or forcing a concession.",
  },
  {
    tag: "discovered_mate",
    name: "Discovered mate",
    category: "Attack and mate",
    description:
      "A tactic in which one piece moves away from a line and uncovers a mating attack by the bishop, rook, or queen behind it.",
  },
  {
    tag: "rook_mate",
    name: "Rook mate",
    category: "Attack and mate",
    description:
      "A mating tactic in which a rook delivers mate or creates an unavoidable mating threat along a rank or file.",
  },
  {
    tag: "king_blockade",
    name: "King blockade",
    category: "Clearance and control",
    description:
      "A tactic in which the king occupies or controls key squares to prevent the opposing king from approaching, escaping, or supporting another piece.",
  },
  {
    tag: "square",
    name: "Square",
    category: "Clearance and control",
    description:
      "A tactic in which gaining, controlling, denying, or exploiting one specific square is the essential idea.",
  },
  {
    tag: "explosion_mate_threat",
    name: "Explosion mate threat",
    category: "Attack and mate",
    description:
      "A tactic in which the threat to capture a piece next to the king is used to force a concession, enable an invasion, or win material.",
  },
  {
    tag: "explosion_defense",
    name: "Explosion defense",
    category: "Defense and survival",
    description:
      "A defensive tactic in which an explosion or explosion threat removes an attacker, interrupts an attacking line, or creates a safe square for the king.",
  },
  {
    tag: "development",
    name: "Development",
    category: "Position and endgame",
    description:
      "A tactic in which a piece must be developed to the correct square and in the correct move order to meet a threat or create active play.",
  },
  {
    tag: "stuck_pawn",
    name: "Stuck pawn",
    category: "Position and endgame",
    description:
      "A tactic in which a pawn with no useful advance or capture becomes a weakness, an obstruction, or a target that can be exploited.",
  },
  {
    tag: "stuck_piece",
    name: "Stuck piece",
    category: "Position and endgame",
    description:
      "A tactic in which a piece with no useful or safe move becomes trapped, attacked, or used as an explosion target.",
  },
  {
    tag: "equal",
    name: "Equal",
    category: "Defense and survival",
    description:
      "A tactic in which an accurate move preserves an equal position while other natural moves concede a clear advantage.",
  },
  {
    tag: "endgame",
    name: "Endgame",
    category: "Position and endgame",
    description:
      "A tactic in a reduced-material position whose solution depends on endgame technique, such as a promotion race, king activity, or precise piece placement.",
  },
  {
    tag: "endgame_draw",
    name: "Endgame draw",
    category: "Position and endgame",
    description:
      "A tactic in a reduced-material position in which precise play secures a draw through a fortress, perpetual threat, promotion tactic, or other defensive resource.",
  },
];

export const puzzleMotifCategories: PuzzleMotifCategory[] = [
  "Attack and mate",
  "Clearance and control",
  "Defense and survival",
  "Position and endgame",
];

const puzzleMotifTagSet = new Set(puzzleMotifs.map((motif) => motif.tag));

export const isPuzzleMotifTag = (value: unknown): value is string =>
  typeof value === "string" && puzzleMotifTagSet.has(value);

export const normalizePuzzleMotifTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isPuzzleMotifTag))];
};

export const getPuzzleMotifAnchor = (tag: string): string => `motif-${tag}`;
