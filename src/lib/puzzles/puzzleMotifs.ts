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
      "An advanced pawn creates a decisive threat through promotion, control of key squares, or a capture near the king.",
  },
  {
    tag: "queen_angles",
    name: "Queen angles",
    description:
      "The queen maneuvers across files, ranks, or diagonals to attack a target from a new direction and bypass its current defense.",
  },
  {
    tag: "coercion",
    name: "Coercion",
    description:
      "A forcing move drives an opposing piece to a square where it can later be attacked or captured.",
  },
  {
    tag: "diagonal_clearance",
    name: "Diagonal clearance",
    description:
      "A piece is removed from a diagonal, allowing a bishop or queen to use the cleared line. The player's move or a forced opposing capture may provide the clearance.",
  },
  {
    tag: "file_clearance",
    name: "File clearance",
    description:
      "A piece is removed from a file, allowing a rook or queen to use the cleared line. The player's move or a forced opposing capture may provide the clearance.",
  },
  {
    tag: "square_clearance",
    name: "Square clearance",
    description:
      "An occupied, controlled, or explosion-threatened square is cleared so another piece can use it. A capture or forcing move usually provides the clearance.",
  },
  {
    tag: "fork",
    name: "Fork",
    description:
      "One piece attacks two or more targets at the same time, leaving the opponent unable to answer every threat.",
  },
  {
    tag: "epaulette_fork",
    name: "Epaulette fork",
    parentTag: "fork",
    description:
      "A knight attacks two pieces flanking the king, creating an explosion mate threat against either piece.",
  },
  {
    tag: "zwischenzug",
    name: "Zwischenzug",
    description:
      "An intermediate forcing move is played before the expected reply, escaping a bind or threat with tempo and making the intended continuation possible.",
  },
  {
    tag: "knight_invasion",
    name: "Knight invasion",
    description:
      "A knight enters the opposing position on a key square, forcing the king to move, disrupting the defense, or establishing a difficult-to-remove attacker.",
  },
  {
    tag: "bishop_invasion",
    name: "Bishop invasion",
    description:
      "A bishop enters the opposing position on a key diagonal, forcing the king to move, restricting the defense, or establishing persistent pressure.",
  },
  {
    tag: "rook_invasion",
    name: "Rook invasion",
    description:
      "A rook enters the opposing position on a key rank or file, forcing the king to move, disrupting the defense, or establishing persistent pressure.",
  },
  {
    tag: "castling_rook_invasion",
    name: "Castling rook invasion",
    parentTag: "rook_invasion",
    description:
      "Castling places a rook directly into an invasion, forcing the king to move, disrupting the defense, or establishing persistent pressure.",
  },
  {
    tag: "trident",
    name: "Trident",
    description:
      "A bishop or queen attacks through one piece toward a second piece on the same diagonal. Capturing the nearer piece opens additional lines, while a distant alignment can produce mate.",
  },
  {
    tag: "sacrifice",
    name: "Sacrifice",
    description:
      "A rook or queen is deliberately given up to obtain mate, an invasion, a clearance, or a decisive material gain.",
  },
  {
    tag: "defensive",
    name: "Defensive",
    description:
      "The opponent threatens mate or an invasion, and an accurate defensive move is required. Other natural responses fail.",
  },
  {
    tag: "material",
    name: "Material",
    description:
      "Winning material or preventing a material loss is the principal point of the solution rather than delivering mate.",
  },
  {
    tag: "draw",
    name: "Draw",
    description:
      "A precise sequence secures a draw from a position that would otherwise be lost or clearly worse.",
  },
  {
    tag: "blocking",
    name: "Blocking",
    description:
      "A piece is placed on a file or diagonal to prevent an opposing piece from invading or using that line.",
  },
  {
    tag: "king_walk",
    name: "King walk",
    parentTag: "defensive",
    description:
      "The king escapes danger through a precise sequence of king moves while avoiding controlled and explosion-threatened squares.",
  },
  {
    tag: "avoiding_perpetual",
    name: "Avoiding perpetual",
    parentTag: "defensive",
    description:
      "A repeating sequence of checks or mating threats is prevented while the winning advantage is preserved.",
  },
  {
    tag: "pin",
    name: "Pin",
    description:
      "An attacked piece cannot move without exposing the king or a more valuable piece behind it to attack.",
  },
  {
    tag: "unpinning",
    name: "Unpinning",
    description:
      "A pin is removed, allowing the formerly pinned piece to move or capture and create a decisive threat.",
  },
  {
    tag: "tempo",
    name: "Tempo",
    description:
      "A forcing or waiting move makes the opponent move first, producing a favorable move order or forcing a concession.",
  },
  {
    tag: "discovered_mate",
    name: "Discovered mate",
    description:
      "One piece moves away from a line and uncovers a mating attack by the bishop, rook, or queen behind it.",
  },
  {
    tag: "rook_mate",
    name: "Rook mate",
    description:
      "A rook delivers mate or creates an unavoidable mating threat along a rank or file.",
  },
  {
    tag: "king_blockade",
    name: "King blockade",
    description:
      "The king occupies or controls key squares, preventing the opposing king from approaching, escaping, or supporting another piece.",
  },
  {
    tag: "square",
    name: "Square",
    description:
      "Gaining, controlling, denying, or exploiting one specific square is the essential idea of the solution.",
  },
  {
    tag: "explosion_mate_threat",
    name: "Explosion mate threat",
    description:
      "The threat to capture a piece next to the king forces a concession, enables an invasion, or wins material.",
  },
  {
    tag: "exposed_king",
    name: "Exposed king",
    description:
      "The king begins the puzzle without sufficient shelter, allowing direct checks or forcing attacks that depend on its exposure.",
  },
  {
    tag: "explosion_defense",
    name: "Explosion defense",
    parentTag: "defensive",
    description:
      "An explosion or explosion threat removes an attacker, interrupts an attacking line, or creates a safe square for the king.",
  },
  {
    tag: "development",
    name: "Development",
    description:
      "A piece must be developed to the correct square and in the correct move order to meet a threat or create active play.",
  },
  {
    tag: "stuck_pawn",
    name: "Stuck pawn",
    description:
      "A pawn with no useful advance or capture becomes a weakness, an obstruction, or a target that can be exploited.",
  },
  {
    tag: "stuck_piece",
    name: "Stuck piece",
    description:
      "A piece with no useful or safe move becomes trapped, attacked, or used as an explosion target.",
  },
  {
    tag: "endgame",
    name: "Endgame",
    description:
      "The solution depends on endgame technique in a reduced-material position, such as a promotion race, king activity, or precise piece placement.",
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
