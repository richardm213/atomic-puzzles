export const ATOMIC_OPENINGS_PATH = "/atomic-chess/openings";
export const TWO_KNIGHTS_OPENING_LINE = "1. Nf3 f6 2. Nc3";

type OpeningTone = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type OpeningTag = { label: string; tone?: OpeningTone };

export type OpeningLine = {
  name: string;
  pgn: string;
  replies?: readonly OpeningLine[];
} & ({ id: string; tag: OpeningTag } | { id?: never; tag?: never });

type OpeningBranch = {
  id: string;
  reply: string;
  setup?: string;
  groups?: readonly { id: string; name: string; setup: string; lines: readonly OpeningLine[] }[];
  lines: readonly OpeningLine[];
};

type Opening = {
  id: string;
  name: string;
  tag: OpeningTag;
  setup: string;
  branches?: readonly OpeningBranch[];
};

const twoKnightsNh6 = `${TWO_KNIGHTS_OPENING_LINE} Nh6`;
const twoKnightsG4 = `${twoKnightsNh6} 3. g4`;
const twoKnightsG4F5 = `${twoKnightsG4} c6 4. d4 e6 5. e4 f5`;
const nf3E3 = "1. Nf3 f6 2. e3";
const nf3E3D5 = `${nf3E3} d5`;
const nf3E3D5Fxg5 = `${nf3E3D5} 3. Ng5 fxg5 4. Qh5+ g6 5. Qe5 Be6`;
const nf3E4 = "1. Nf3 f6 2. e4";
const nf3E4D5 = `${nf3E4} d5`;
const nf3E4E6 = `${nf3E4} e6`;
const nf3Nd4 = "1. Nf3 f6 2. Nd4";
const nf3Nd4Nh6 = `${nf3Nd4} Nh6`;
const nf3Nd4Nh6E3 = `${nf3Nd4Nh6} 3. e3`;
const nf3Nd4Nh6E3F4 = `${nf3Nd4Nh6E3} Ng4 4. f4`;
const nh3D4 = "1. Nh3 h6 2. d4";
const nh3D4E6 = `${nh3D4} e6 3. Bg5 f6 4. Bf4`;
const nh3E4 = "1. Nh3 h6 2. e4";

export const NF3_E3_D5_GUIDE_LINE = `${nf3E3D5Fxg5} 6. Qxc7 b5 7. Nc3 Bf5 8. Ne4 Bg4`;
export const NH3_D4_E6_GUIDE_LINE = `${nh3D4E6} e5 5. Na3 a6 6. c3`;

export const normalizeOpeningKey = (opening: string): string =>
  String(opening || "")
    .trim()
    .toLowerCase();

const taggedOpening = (name: string, setup: string, tone?: OpeningTone): Opening => ({
  id: normalizeOpeningKey(name).replaceAll(" ", "-"),
  name,
  tag: { label: name, ...(tone ? { tone } : {}) },
  setup,
});

const firstMoveOpening = (
  move: string,
  replies: readonly string[],
  tone?: OpeningTone,
): Opening => {
  const opening = taggedOpening(move, `1. ${move}`, tone);
  return {
    ...opening,
    branches: replies.map((reply) => ({
      id: `${opening.id}-${reply.toLowerCase()}`,
      reply: `1…${reply}`,
      lines: [{ name: `1…${reply}`, pgn: `${opening.setup} ${reply}` }],
    })),
  };
};

const nf3Defense = (
  defense: string,
  continuations: readonly string[],
  tone: OpeningTone,
): Opening => {
  const setup = `1. Nf3 ${defense}`;
  const id = `nf3-${defense}`;
  return {
    ...taggedOpening(defense, setup, tone),
    id,
    name: setup,
    branches: continuations.map((move) => ({
      id: `${id}-${move.toLowerCase()}`,
      reply: `2. ${move}`,
      lines: [{ name: `2. ${move}`, pgn: `${setup} 2. ${move}` }],
    })),
  };
};

// Inferred replies use the General Analysis explorer (all dates; hyperbullet, bullet and blitz,
// 2026-11-09). For two-move tags, compare counts for the tagged White continuation after the
// most-played Black replies. Keep the explicitly curated lines and opening names unchanged.
export const atomicOpenings: readonly Opening[] = [
  {
    id: "two-knights",
    name: "Two Knights (2N)",
    tag: { label: "2N", tone: 1 },
    setup: TWO_KNIGHTS_OPENING_LINE,
    branches: [
      {
        id: "two-knights-nh6",
        reply: "2…Nh6",
        setup: twoKnightsNh6,
        groups: [
          {
            id: "two-knights-nh6-g4",
            name: "3. g4",
            setup: twoKnightsG4,
            lines: [
              { name: "6. exf5 (main line)", pgn: `${twoKnightsG4F5} 6. exf5` },
              { name: "6. Nh4 (alternative)", pgn: `${twoKnightsG4F5} 6. Nh4` },
            ],
          },
        ],
        lines: [
          {
            id: "two-knights-nh6-h3",
            name: "3. h3",
            tag: { label: "2N h3", tone: 6 },
            pgn: `${twoKnightsNh6} 3. h3 Ng4 4. hxg4`,
          },
          { name: "3. Ne5 fxe5", pgn: `${twoKnightsNh6} 3. Ne5 fxe5` },
        ],
      },
      {
        id: "two-knights-c6",
        reply: "2…c6",
        lines: [{ name: "2…c6", pgn: `${TWO_KNIGHTS_OPENING_LINE} c6` }],
      },
    ],
  },
  {
    ...taggedOpening("Nf3 e3", nf3E3, 2),
    name: "Nf3 e3 (Atomic Attack)",
    branches: [
      {
        id: "nf3-e3-e6",
        reply: "2…e6",
        lines: [{ name: "2…e6", pgn: `${nf3E3} e6` }],
      },
      {
        id: "nf3-e3-d5",
        reply: "2…d5",
        setup: nf3E3D5,
        lines: [
          { name: "3. Ng5 fxg5", pgn: nf3E3D5Fxg5 },
          { name: "3. Ng5 Bg4", pgn: `${nf3E3D5} 3. Ng5 Bg4 4. f3 fxg5` },
          { name: "3. Ne5 Bg4", pgn: `${nf3E3D5} 3. Ne5 Bg4 4. Qf3` },
        ],
      },
    ],
  },
  {
    ...taggedOpening("Nh3 d4", nh3D4, 3),
    branches: [
      {
        id: "nh3-d4-d5",
        reply: "2…d5",
        lines: [{ name: "2…d5", pgn: `${nh3D4} d5` }],
      },
      {
        id: "nh3-d4-e6",
        reply: "2…e6",
        lines: [{ name: "2…e6", pgn: nh3D4E6 }],
      },
    ],
  },
  nf3Defense("d6", ["Ng5", "Nc3", "e3"], 8),
  nf3Defense("e5", ["Ng5", "e4", "d4", "e3"], 5),
  {
    ...taggedOpening("Nf3 e4", nf3E4, 4),
    branches: [
      {
        id: "nf3-e4-d5",
        reply: "2…d5",
        setup: nf3E4D5,
        lines: [
          { name: "3. Nc3", pgn: `${nf3E4D5} 3. Nc3` },
          { name: "3. e5", pgn: `${nf3E4D5} 3. e5` },
        ],
      },
      {
        id: "nf3-e4-e6",
        reply: "2…e6",
        setup: nf3E4E6,
        lines: [
          { name: "3. Nd4", pgn: `${nf3E4E6} 3. Nd4` },
          { name: "3. Na3", pgn: `${nf3E4E6} 3. Na3` },
        ],
      },
    ],
  },
  taggedOpening("Nf3 Na3", "1. Nf3 f6 2. Na3", 7),
  taggedOpening("Nf3 d4", "1. Nf3 f6 2. d4", 6),
  {
    ...taggedOpening("Nf3 Nd4", nf3Nd4, 1),
    branches: [
      {
        id: "nf3-nd4-nh6",
        reply: "2…Nh6",
        setup: nf3Nd4Nh6,
        groups: [
          {
            id: "nf3-nd4-nh6-e3",
            name: "3. e3",
            setup: nf3Nd4Nh6E3,
            lines: [
              {
                name: "3…Ng4 4. f4",
                pgn: nf3Nd4Nh6E3F4,
                replies: [
                  { name: "4…b5", pgn: `${nf3Nd4Nh6E3F4} b5` },
                  { name: "4…c6", pgn: `${nf3Nd4Nh6E3F4} c6` },
                  { name: "4…Na6", pgn: `${nf3Nd4Nh6E3F4} Na6` },
                ],
              },
            ],
          },
        ],
        lines: [
          { name: "3. Nf5", pgn: `${nf3Nd4Nh6} 3. Nf5` },
          { name: "3. h3", pgn: `${nf3Nd4Nh6} 3. h3` },
          { name: "3. g4", pgn: `${nf3Nd4Nh6} 3. g4` },
        ],
      },
    ],
  },
  taggedOpening("Nf3 Ne5", "1. Nf3 f6 2. Ne5"),
  taggedOpening("Nf3 c3", "1. Nf3 f6 2. c3", 8),
  {
    ...taggedOpening("Nh3 e4", nh3E4, 5),
    branches: [
      {
        id: "nh3-e4-d5",
        reply: "2…d5",
        lines: [{ name: "2…d5", pgn: `${nh3E4} d5` }],
      },
      {
        id: "nh3-e4-e6",
        reply: "2…e6",
        lines: [{ name: "2…e6", pgn: `${nh3E4} e6 3. d4` }],
      },
    ],
  },
  taggedOpening("Nh3 e3", "1. Nh3 h6 2. e3", 4),
  taggedOpening("Nh3 Na3", "1. Nh3 h6 2. Na3", 8),
  taggedOpening("Nh3 Nc3", "1. Nh3 h6 2. Nc3", 2),
  taggedOpening("Nh3 e6", "1. Nh3 e6"),
  taggedOpening("e3 Nc3", "1. e3 e6 2. Nc3", 5),
  taggedOpening("e3 Nf3", "1. e3 e6 2. Nf3"),
  taggedOpening("e3 Nh3", "1. e3 e6 2. Nh3"),
  taggedOpening("e3 Qh5", "1. e3 e6 2. Qh5", 6),
  {
    ...taggedOpening("e3 Qf3", "1. e3 e6 2. Qf3", 7),
    branches: [
      {
        id: "e3-qf3-nf6",
        reply: "1…Nf6",
        lines: [{ name: "1…Nf6", pgn: "1. e3 Nf6 2. Qf3" }],
      },
    ],
  },
  taggedOpening("e3 f4", "1. e3 e6 2. f4", 3),
  taggedOpening("e3 b4", "1. e3 e6 2. b4", 2),
  firstMoveOpening("e4", ["e6"], 7),
  firstMoveOpening("d4", ["d5", "Nh6", "Nf6"], 3),
  firstMoveOpening("Nc3", ["e6"], 8),
  firstMoveOpening("Na3", ["e6"], 4),
  firstMoveOpening("c3", ["e6"]),
];

const flattenOpeningLines = (lines: readonly OpeningLine[]): OpeningLine[] =>
  lines.flatMap((line) => [line, ...flattenOpeningLines(line.replies ?? [])]);

export const getOpeningVariations = (opening: Opening): OpeningLine[] =>
  opening.branches?.flatMap((branch) => [
    ...(branch.groups?.flatMap((group) => flattenOpeningLines(group.lines)) ?? []),
    ...flattenOpeningLines(branch.lines),
  ]) ?? [];

type OpeningTagDetails = OpeningTag & { anchor?: string; pgn?: string };
const allAround = { label: "All-around", tone: 6 } as const;
const tagsByKey = new Map<string, OpeningTagDetails>([
  ["variety", allAround],
  ["all around", allAround],
]);

for (const opening of atomicOpenings) {
  tagsByKey.set(normalizeOpeningKey(opening.tag.label), {
    ...opening.tag,
    anchor: opening.id,
    pgn: opening.setup,
  });

  for (const line of getOpeningVariations(opening)) {
    if (!line.tag) continue;
    tagsByKey.set(normalizeOpeningKey(line.tag.label), {
      ...line.tag,
      anchor: line.id,
      pgn: line.pgn,
    });
  }
}

export const getOpeningTag = (opening: string): OpeningTagDetails | undefined =>
  tagsByKey.get(normalizeOpeningKey(opening));

export const getOpeningDisplayLabel = (opening: string): string =>
  getOpeningTag(opening)?.label ?? String(opening || "").trim();

export const getOpeningMoveLine = (opening: string): string | undefined =>
  normalizeOpeningKey(opening) === "2n" ? TWO_KNIGHTS_OPENING_LINE : undefined;
