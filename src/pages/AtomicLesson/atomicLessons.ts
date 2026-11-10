// Each chapter tests one idea before explaining it. Opponent replies are authored,
// not engine-generated, so the feedback describes the position the learner sees.
type Reply = { san: string; note: string };
export type LessonTurn = {
  san: string;
  prompt: string;
  hint: string;
  note: string;
  reply?: Reply;
  alternateFinishes?: Record<string, string>;
  alternatives?: Record<string, { note: string; reply?: string }>;
};

const groups = ["Rules", "Tactics", "Endgame", "Starter openings"] as const;
export const lessonGroups = groups;

type Chapter = {
  id: string;
  group: (typeof groups)[number];
  title: string;
} & ({ fen: string; setup?: never } | { fen?: never; setup: string });

export type LessonDefinition = Chapter &
  (
    | { turns: readonly LessonTurn[]; question?: never }
    | {
        turns?: never;
        question: {
          prompt: string;
          hint: string;
          options: readonly { label: string; note: string; correct?: true }[];
        };
      }
  );

export const atomicLessons: readonly LessonDefinition[] = [
  {
    id: "explosion",
    group: "Rules",
    title: "What explodes?",
    fen: "5r1k/2p3p1/1nB5/8/8/8/4P3/KR6 w - - 0 1",
    turns: [
      {
        san: "Rxb6",
        prompt: "Capture the black knight.",
        hint: "The rook can reach the knight in one move.",
        note: "The rook, knight, and bishop disappear. The nearby pawn survives because it didn’t capture or get captured.",
      },
    ],
  },
  {
    id: "own-king",
    group: "Rules",
    title: "Your king has to survive",
    fen: "5k2/3Kp3/8/8/8/8/r3R3/8 w - - 0 1",
    question: {
      prompt: "Is Rxe7 legal?",
      hint: "Count the neighboring squares of e7 for both kings.",
      options: [
        {
          label: "Yes, Black’s king explodes",
          note: "The explosion does reach f8, but it also reaches White’s king on d7.",
        },
        {
          label: "No, both kings would explode",
          note: "Exactly. Both d7 and f8 are next to e7, so White can’t make this capture.",
          correct: true,
        },
      ],
    },
  },
  {
    id: "connected-kings",
    group: "Rules",
    title: "Kings can touch",
    fen: "8/8/8/8/4k3/r7/4K3/8 w - - 0 1",
    turns: [
      {
        san: "Ke3",
        prompt: "Move next to Black’s king, onto the rook’s row.",
        hint: "Find a square that touches Black’s king, even diagonally.",
        note: "On e3 the kings are connected. The rook can’t take on e3 without also exploding its own king on e4.",
        alternateFinishes: {
          Kd3: "On d3 your king touches Black’s king on e4 diagonally. If the rook took on d3, the explosion would reach e4 too.",
          Kf3: "On f3 your king touches Black’s king on e4 diagonally. The rook has a clear line to f3, but a capture there would explode its own king too.",
        },
      },
    ],
  },
  {
    id: "win-in-check",
    group: "Rules",
    title: "Win while in check",
    fen: "5k2/4p3/8/8/8/1r6/4R3/1K6 w - - 0 1",
    turns: [
      {
        san: "Rxe7#",
        prompt: "You’re in check. Find a winning move.",
        hint: "Look for a target next to the king on f8.",
        note: "Rxe7 explodes Black’s king and leaves yours safe. The game ends before Black can take your king.",
      },
    ],
  },
  {
    id: "quiet-mate",
    group: "Rules",
    title: "Mate without a capture",
    fen: "k7/8/1Q6/8/8/8/4K3/8 w - - 0 1",
    turns: [
      {
        san: "Qb7#",
        prompt: "",
        hint: "Try checking from a square next to the king.",
        note: "The queen checks on the diagonal and covers a7 and b8. Black can’t capture on b7 because a king can’t survive its own capture.",
        alternateFinishes: {
          "Qa7#": "The queen checks from a7 and covers b7 and b8. Black’s king can’t capture it.",
          "Qb8#": "The queen checks from b8 and covers a7 and b7. Black’s king can’t capture it.",
        },
      },
    ],
  },
  {
    id: "stalemate",
    group: "Rules",
    title: "No moves isn’t always mate",
    fen: "8/8/8/8/5Q2/8/6kQ/6QK b - - 0 1",
    question: {
      prompt: "Black has no legal moves. What’s the result?",
      hint: "Look at the two kings on g2 and h1. They’re connected.",
      options: [
        {
          label: "White wins by checkmate",
          note: "The queens cover every escape, but Black isn’t in check while the kings touch.",
        },
        {
          label: "Draw by stalemate",
          note: "Black has no legal move and isn’t in check. The game is a draw.",
          correct: true,
        },
      ],
    },
  },
  {
    id: "castling",
    group: "Rules",
    title: "Castle away from the threat",
    fen: "1k6/8/3b4/8/8/8/5PPP/R3K2R w KQ - 0 1",
    turns: [
      {
        san: "O-O-O",
        prompt: "Choose the safer castle.",
        hint: "Which castle puts your king next to the pawn the bishop attacks?",
        note: "On c1 your king is nowhere near h2. The bishop can still take that pawn, but the capture won’t win the game.",
        alternatives: {
          "O-O": {
            note: "Kingside castling is legal, but it puts your king on g1. Black takes on h2 and the explosion reaches g1.",
            reply: "Bxh2#",
          },
        },
      },
    ],
  },
  {
    id: "promotion",
    group: "Rules",
    title: "Promote with check",
    fen: "k7/6P1/8/8/8/8/8/K7 w - - 0 1",
    turns: [
      {
        san: "g8=Q+",
        prompt: "Promote the pawn to a queen.",
        hint: "Move the pawn to the far edge of the board.",
        note: "The new queen gives check. A pawn can also promote to a rook, bishop, or knight.",
        alternatives: {
          "g8=R+": {
            note: "A rook also gives check. For this exercise, try promoting to a queen instead.",
          },
          "g8=B": {
            note: "That promotion is legal, but a bishop can’t check along the eighth rank.",
          },
          "g8=N": { note: "That promotion is legal, but the knight doesn’t check the king on a8." },
        },
      },
    ],
  },
  {
    id: "en-passant",
    group: "Rules",
    title: "En passant moves the explosion",
    fen: "8/4k3/2r5/3pP3/8/8/8/K7 w - d6 0 2",
    turns: [
      {
        san: "exd6#",
        prompt: "Black just played …d5. Find a winning move.",
        hint: "Move the e5-pawn diagonally to the empty d6-square.",
        note: "The black pawn is removed from d5, but the explosion happens on d6. That reaches both the rook on c6 and the king on e7.",
      },
    ],
  },
  {
    id: "queen",
    group: "Tactics",
    title: "Find the queen’s second route",
    setup: "e4 a6 Qh5 g6",
    turns: [
      {
        san: "Qd5",
        prompt: "Attack two pawns next to Black’s king.",
        hint: "Look across the fifth rank from h5.",
        note: "From d5 the queen attacks d7 up the file and f7 along the diagonal.",
        reply: { san: "d6", note: "Black moves one target away. The other pawn hasn’t moved." },
      },
      {
        san: "Qxf7#",
        prompt: "Take the remaining target.",
        hint: "The queen reaches f7 through e6.",
        note: "The f7 explosion reaches e8. When a queen changes routes, check every target it can reach, not just the one it attacked first.",
      },
    ],
  },
  {
    id: "knight",
    group: "Tactics",
    title: "Stop the knight before it lands",
    setup: "Nf3",
    turns: [
      {
        san: "f6",
        prompt: "Stop both knight jumps with one pawn move.",
        hint: "Look for a pawn that can cover e5 and g5.",
        note: "The f-pawn covers both jumps. You’re defending the knight’s route, not trying to guard two targets after the fork.",
        reply: { san: "Ne5", note: "White jumps anyway. This time you can remove the knight." },
        alternatives: {
          e6: {
            note: "…e6 leaves e5 open. From there the knight threatens both d7 and f7.",
            reply: "Ne5",
          },
          c5: {
            note: "…c5 doesn’t cover e5 either. Moving one pawn after the fork won’t save the other.",
            reply: "Ne5",
          },
        },
      },
      {
        san: "fxe5",
        prompt: "Take the knight safely.",
        hint: "The pawn on f6 can capture the knight on e5.",
        note: "The explosion on e5 is far from the king on e8. Taking the knight here is much safer than letting it capture next to your king.",
      },
    ],
  },
  {
    id: "defense",
    group: "Tactics",
    title: "One capture, two attackers gone",
    fen: "6k1/8/8/8/8/2qn4/8/2R1K3 w - - 0 1",
    turns: [
      {
        san: "Rxc3",
        prompt: "Stop both attackers in one move.",
        hint: "Can you take one attacker and explode the other?",
        note: "The rook and queen disappear, along with the knight on d3. One capture removes both attackers and ends the check.",
      },
    ],
  },
  {
    id: "sacrifice",
    group: "Tactics",
    title: "Sacrifice to clear a route",
    fen: "4k2r/4p1pp/5n2/8/8/3Q4/8/2B1K3 w - - 0 1",
    turns: [
      {
        san: "Qg6+",
        prompt: "Sacrifice your queen with check.",
        hint: "The diagonal from g6 to e8 goes through the empty f7-square.",
        note: "Qg6+ makes Black deal with a check. The h-pawn can take, but look at what else is near g6.",
        reply: {
          san: "hxg6",
          note: "The queen, h-pawn, and knight on f6 disappear. The bishop now has a route to e7.",
        },
      },
      {
        san: "Bg5",
        prompt: "Create a winning threat with the bishop.",
        hint: "From c1, go through d2, e3, and f4.",
        note: "The bishop threatens Bxe7#. The sacrifice was about removing the f6-knight and creating a new threat, not winning material back.",
      },
    ],
  },
  {
    id: "separate",
    group: "Endgame",
    title: "Separate the kings",
    fen: "8/8/7Q/8/8/8/6k1/6QK w - - 0 1",
    turns: [
      {
        san: "Qhh2",
        prompt: "Leave Black just one move to separate the kings.",
        hint: "Move the queen on h6 straight down to h2.",
        note: "The queens leave f3 open on purpose. Taking away the last legal move would only stalemate Black.",
        reply: { san: "Kf3", note: "Black has to step away. Now checks work again." },
      },
      {
        san: "Qgg2+",
        prompt: "Give a diagonal check with the g1 queen.",
        hint: "From g2 the queen attacks f3.",
        note: "The check forces the king farther from its safe contact square.",
        reply: {
          san: "Ke3",
          note: "The king is on e3. Look for a queen move that gives check and closes the exits.",
        },
      },
      {
        san: "Qe4#",
        prompt: "Finish with mate.",
        hint: "The queen on g2 can reach e4 in one move.",
        note: "The queen on e4 gives mate. The decisive step was making the kings separate, not adding another check while they touched.",
      },
    ],
  },
  {
    id: "blockade",
    group: "Endgame",
    title: "Get in front of the pawn",
    fen: "5k2/8/6P1/8/8/8/8/K7 b - - 0 1",
    turns: [
      {
        san: "Kg7",
        prompt: "Block the pawn.",
        hint: "Stand directly in front of the pawn, not beside it.",
        note: "The king on g7 blocks the pawn. Don’t assume an extra pawn wins: check the promotion race and the blockade before trading down.",
      },
    ],
  },
  {
    id: "two-knights",
    group: "Starter openings",
    title: "Two Knights",
    setup: "Nf3 f6",
    turns: [
      {
        san: "Nc3",
        prompt: "Develop the second knight.",
        hint: "The b1-knight can move to c3.",
        note: "Both knights are in play. The c3-knight can look toward b5 or d5.",
        reply: { san: "Nh6", note: "Black’s knight is ready to jump to g4 and threaten f2." },
      },
      {
        san: "g4",
        prompt: "Occupy the knight’s landing square.",
        hint: "Occupy g4 instead of only defending it.",
        note: "Black can’t land on g4 without a capture. …Nxg4 would explode both knights and the pawn, rather than leave an attacker on g4.",
        reply: {
          san: "c6",
          note: "Black keeps the knight and covers b5 and d5. Learn this position separately from the direct 2…c6 line.",
        },
        alternatives: {
          h3: {
            note: "3. h3 is another real line. Here we’re practicing 3. g4, which occupies the square instead of covering it.",
          },
        },
      },
    ],
  },
  {
    id: "nf3-e3",
    group: "Starter openings",
    title: "Nf3 e3",
    setup: "Nf3 f6",
    turns: [
      {
        san: "e3",
        prompt: "Open a diagonal for the queen.",
        hint: "Move e2 one square.",
        note: "e3 opens the queen’s diagonal. The knight on f3 is still in the way for now.",
        reply: {
          san: "d5",
          note: "Black chooses …d5. The knight still blocks the queen.",
        },
      },
      {
        san: "Ng5",
        prompt: "Offer the knight as a sacrifice.",
        hint: "Jump to g5.",
        note: "The knight leaves f3 and invites a capture on g5.",
        reply: {
          san: "fxg5",
          note: "Both pieces are gone. The queen has a route to the king.",
        },
      },
      {
        san: "Qh5+",
        prompt: "Give check.",
        hint: "The queen can now reach h5 from d1.",
        note: "The diagonal from h5 to e8 is open because the f-pawn disappeared.",
        reply: {
          san: "g6",
          note: "Black blocks the check. Look for a new target.",
        },
      },
      {
        san: "Qe5",
        prompt: "Find a new route to c7.",
        hint: "Slide along the fifth rank.",
        note: "A capture on c7 can reach the queen on d8 and the knight on b8.",
        reply: {
          san: "Be6",
          note: "The c8-bishop moves out of the explosion. The queen and knight are still beside c7.",
        },
      },
      {
        san: "Qxc7",
        prompt: "Trade queens and win pawns.",
        hint: "Take on c7 through d6.",
        note: "Both queens and Black’s b8-knight disappear. White is two pawns up, but Black still has both rooks and both bishops. Practice playing on from here, not just reaching it.",
      },
    ],
  },
  {
    id: "nh3-d4",
    group: "Starter openings",
    title: "Nh3 d4",
    setup: "Nh3 h6",
    turns: [
      {
        san: "d4",
        prompt: "Make room for the bishop on c1.",
        hint: "Advance the d-pawn two squares.",
        note: "The d-pawn opens a route from c1 to g5. That route is what distinguishes this line from an early e4.",
        reply: {
          san: "e6",
          note: "Black moves the pawn off e7, clearing the bishop’s future line all the way to d8.",
        },
      },
      {
        san: "Bg5",
        prompt: "Threaten a win with the bishop.",
        hint: "From g5, the bishop points through f6 and e7 to d8.",
        note: "Bg5 threatens Bxd8#. Taking the queen on d8 would explode the neighboring king on e8.",
        reply: {
          san: "f6",
          note: "Black blocks the diagonal and attacks the bishop at the same time.",
        },
      },
      {
        san: "Bf4",
        prompt: "Retreat the bishop one square on the same diagonal.",
        hint: "Move from g5 to f4.",
        note: "Black can follow with …e5, …d6, or …Bb4+. They lead to different fights; preparing the bishop attack is only the start.",
      },
    ],
  },
];
