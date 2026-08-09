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
      "An advanced pawn creates a decisive threat through promotion, control of key squares, or a capture near the king.",
  },
  {
    tag: "queen_angles",
    name: "Queen angles",
    category: "Attack and mate",
    description:
      "The queen maneuvers across files, ranks, or diagonals to attack a target from a new direction and bypass its current defense.",
  },
  {
    tag: "coercion",
    name: "Coercion",
    category: "Clearance and control",
    description:
      "A forcing move drives an opposing piece to a square where it can later be attacked or captured.",
  },
  {
    tag: "diagonal_clearance",
    name: "Diagonal clearance",
    category: "Clearance and control",
    description:
      "A piece is removed from a diagonal, allowing a bishop or queen to use the cleared line. The player's move or a forced opposing capture may provide the clearance.",
  },
  {
    tag: "file_clearance",
    name: "File clearance",
    category: "Clearance and control",
    description:
      "A piece is removed from a file, allowing a rook or queen to use the cleared line. The player's move or a forced opposing capture may provide the clearance.",
  },
  {
    tag: "square_clearance",
    name: "Square clearance",
    category: "Clearance and control",
    description:
      "An occupied, controlled, or explosion-threatened square is cleared so another piece can use it. A capture or forcing move usually provides the clearance.",
  },
  {
    tag: "fork",
    name: "Fork",
    category: "Attack and mate",
    description:
      "One piece attacks two or more targets at the same time, leaving the opponent unable to answer every threat.",
  },
  {
    tag: "zwischenzug",
    name: "Zwischenzug",
    category: "Clearance and control",
    description:
      "An intermediate forcing move is played before the expected reply, escaping a bind or threat with tempo and making the intended continuation possible.",
  },
  {
    tag: "knight_invasion",
    name: "Knight invasion",
    category: "Attack and mate",
    description:
      "A knight enters the opposing position on a key square, forcing the king to move, disrupting the defense, or establishing a difficult-to-remove attacker.",
  },
  {
    tag: "bishop_invasion",
    name: "Bishop invasion",
    category: "Attack and mate",
    description:
      "A bishop enters the opposing position on a key diagonal, forcing the king to move, restricting the defense, or establishing persistent pressure.",
  },
  {
    tag: "rook_invasion",
    name: "Rook invasion",
    category: "Attack and mate",
    description:
      "A rook enters the opposing position on a key rank or file, forcing the king to move, disrupting the defense, or establishing persistent pressure.",
  },
  {
    tag: "castling_rook_invasion",
    name: "Castling rook invasion",
    category: "Attack and mate",
    description:
      "Castling places a rook directly into an invasion, forcing the king to move, disrupting the defense, or establishing persistent pressure.",
  },
  {
    tag: "trident",
    name: "Trident",
    category: "Attack and mate",
    description:
      "A bishop or queen attacks through one piece toward a second piece on the same diagonal. Capturing the nearer piece opens additional lines, while a distant alignment can produce mate.",
  },
  {
    tag: "sacrifice",
    name: "Sacrifice",
    category: "Attack and mate",
    description:
      "A rook or queen is deliberately given up to obtain mate, an invasion, a clearance, or a decisive material gain.",
  },
  {
    tag: "defensive",
    name: "Defensive",
    category: "Defense and survival",
    description:
      "The opponent threatens mate or an invasion, and an accurate defensive move is required. Other natural responses fail.",
  },
  {
    tag: "material",
    name: "Material",
    category: "Attack and mate",
    description:
      "Winning material or preventing a material loss is the principal point of the solution rather than delivering mate.",
  },
  {
    tag: "draw",
    name: "Draw",
    category: "Defense and survival",
    description:
      "A precise sequence secures a draw from a position that would otherwise be lost or clearly worse.",
  },
  {
    tag: "blocking",
    name: "Blocking",
    category: "Defense and survival",
    description:
      "A piece is placed on a file or diagonal to prevent an opposing piece from invading or using that line.",
  },
  {
    tag: "king_walk",
    name: "King walk",
    category: "Defense and survival",
    description:
      "The king escapes danger through a precise sequence of king moves while avoiding controlled and explosion-threatened squares.",
  },
  {
    tag: "avoiding_perpetual",
    name: "Avoiding perpetual",
    category: "Defense and survival",
    description:
      "A repeating sequence of checks or mating threats is prevented while the winning advantage is preserved.",
  },
  {
    tag: "pin",
    name: "Pin",
    category: "Clearance and control",
    description:
      "An attacked piece cannot move without exposing the king or a more valuable piece behind it to attack.",
  },
  {
    tag: "unpinning",
    name: "Unpinning",
    category: "Clearance and control",
    description:
      "A pin is removed, allowing the formerly pinned piece to move or capture and create a decisive threat.",
  },
  {
    tag: "tempo",
    name: "Tempo",
    category: "Clearance and control",
    description:
      "A forcing or waiting move makes the opponent move first, producing a favorable move order or forcing a concession.",
  },
  {
    tag: "discovered_mate",
    name: "Discovered mate",
    category: "Attack and mate",
    description:
      "One piece moves away from a line and uncovers a mating attack by the bishop, rook, or queen behind it.",
  },
  {
    tag: "rook_mate",
    name: "Rook mate",
    category: "Attack and mate",
    description:
      "A rook delivers mate or creates an unavoidable mating threat along a rank or file.",
  },
  {
    tag: "king_blockade",
    name: "King blockade",
    category: "Clearance and control",
    description:
      "The king occupies or controls key squares, preventing the opposing king from approaching, escaping, or supporting another piece.",
  },
  {
    tag: "square",
    name: "Square",
    category: "Clearance and control",
    description:
      "Gaining, controlling, denying, or exploiting one specific square is the essential idea of the solution.",
  },
  {
    tag: "explosion_mate_threat",
    name: "Explosion mate threat",
    category: "Attack and mate",
    description:
      "The threat to capture a piece next to the king forces a concession, enables an invasion, or wins material.",
  },
  {
    tag: "explosion_defense",
    name: "Explosion defense",
    category: "Defense and survival",
    description:
      "An explosion or explosion threat removes an attacker, interrupts an attacking line, or creates a safe square for the king.",
  },
  {
    tag: "development",
    name: "Development",
    category: "Position and endgame",
    description:
      "A piece must be developed to the correct square and in the correct move order to meet a threat or create active play.",
  },
  {
    tag: "stuck_pawn",
    name: "Stuck pawn",
    category: "Position and endgame",
    description:
      "A pawn with no useful advance or capture becomes a weakness, an obstruction, or a target that can be exploited.",
  },
  {
    tag: "stuck_piece",
    name: "Stuck piece",
    category: "Position and endgame",
    description:
      "A piece with no useful or safe move becomes trapped, attacked, or used as an explosion target.",
  },
  {
    tag: "equal",
    name: "Equal",
    category: "Defense and survival",
    description:
      "An accurate move preserves an equal position while other natural moves concede a clear advantage.",
  },
  {
    tag: "endgame",
    name: "Endgame",
    category: "Position and endgame",
    description:
      "The solution depends on endgame technique in a reduced-material position, such as a promotion race, king activity, or precise piece placement.",
  },
  {
    tag: "endgame_draw",
    name: "Endgame draw",
    category: "Position and endgame",
    description:
      "Precise play secures a draw in a reduced-material position through a fortress, perpetual threat, promotion sequence, or other defensive resource.",
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
