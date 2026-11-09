import { type ComponentProps, type ComponentType, type ReactNode, useRef, useState } from "react";

import { TACTICAL_MOTIFS_PATH } from "../../../shared/seo";
import { buildPgnHistory } from "../../components/Chessboard/pgnHistory";
import type { ReplayFocusRequest } from "../PuzzleMotifs/PuzzleMotifExample";
import { atomicChessExamples, type GuideExample, type GuideExampleId } from "./atomicChessExamples";
import { GuideBoardFigure } from "./GuideBoardDiagram";

const Anchor = ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>;
export type GuideReplayProps = { id: GuideExampleId; focusRequest?: ReplayFocusRequest | null };

const ExampleCaption = ({ id }: { id: GuideExampleId }) => {
  const { name, note, pgn } = atomicChessExamples[id];
  return (
    <figure className="motifExample">
      <p>
        <strong>{name}:</strong> <span className="atomicChessExampleLine">{pgn}</span>
      </p>
      <figcaption>{note}</figcaption>
    </figure>
  );
};

const GuideReplayDisclosure = ({
  label,
  children,
}: {
  label: string;
  children: (focusRequest: ReplayFocusRequest | null) => ReactNode;
}) => {
  const activation = useRef<ReplayFocusRequest | null>(null);
  const [focusRequest, setFocusRequest] = useState<ReplayFocusRequest | null>(null);

  return (
    <details
      className="atomicChessReplayDisclosure"
      onToggle={({ currentTarget }) => {
        setFocusRequest(currentTarget.open ? activation.current : null);
        activation.current = null;
      }}
    >
      <summary
        onClick={(event) => {
          activation.current = { pointer: event.detail > 0 };
        }}
      >
        {label}
      </summary>
      {children(focusRequest)}
    </details>
  );
};

const topics = {
  blast: ["blast", "The blast radius"],
  kings: ["kings", "Kings, check, and checkmate"],
  specialMoves: ["special-moves", "Castling, promotion, and en passant"],
  queenAttacks: ["queen-attacks", "Early queen attacks"],
  knightInvasions: ["knight-invasions", "Knight invasions"],
  development: ["development", "Development and king safety"],
  kingTargets: ["king-targets", "Find targets beside the king"],
  sacrifices: ["sacrifices", "Sacrifices and material"],
  blastDefense: ["blast-defense", "Defending with an explosion"],
  connectedKings: ["connected-kings", "Connected kings"],
  twoQueens: ["kqq-vs-k", "Two queens vs. king (KQQ vs K)"],
  pawnRaces: ["pawn-races", "Pawn endings and promotion races"],
  extraMaterial: ["extra-material", "Converting extra material"],
} as const;

const contents = [
  ["rules", "The rules", [topics.blast, topics.kings, topics.specialMoves]],
  ["opening", "The opening", [topics.queenAttacks, topics.knightInvasions, topics.development]],
  ["middlegame", "The middlegame", [topics.kingTargets, topics.sacrifices, topics.blastDefense]],
  [
    "endgame",
    "The endgame",
    [topics.connectedKings, topics.twoQueens, topics.pawnRaces, topics.extraMaterial],
  ],
  ["practice", "How to practice", []],
] as const;

const Topic = ({ name }: { name: keyof typeof topics }) => {
  const [id, label] = topics[name];
  return <h3 id={id}>{label}</h3>;
};

const replayFenAt = (id: GuideExampleId, ply: number) => {
  const { fen, pgn } = atomicChessExamples[id];
  const replay = buildPgnHistory(fen, pgn);
  const position = replay.ok ? replay.history.plies[ply] : undefined;
  if (!position) throw new Error(`Guide diagram ${id} has no position at ply ${ply}`);
  return position.fen;
};

const explosionAfter = replayFenAt("explosion", 1);
const queensBeforeSeparation = replayFenAt("twoQueens", 1);
const queensAfterSeparation = replayFenAt("twoQueens", 2);

const GuideContents = () => (
  <nav className="atomicChessGuideContents" aria-labelledby="guide-contents-title">
    <h2 id="guide-contents-title">Contents</h2>
    <ul className="atomicChessContentsSections">
      {contents.map(([id, label, subsections]) => (
        <li key={id}>
          <a className="atomicChessContentsSection" href={`#${id}`}>
            {label}
          </a>
          {subsections.length > 0 && (
            <ul>
              {subsections.map(([anchor, name]) => (
                <li key={anchor}>
                  <a href={`#${anchor}`}>{name}</a>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  </nav>
);

export const AtomicChessGuideContent = ({
  LinkComponent = Anchor,
  ExampleComponent = ExampleCaption,
}: {
  LinkComponent?: ComponentType<ComponentProps<"a">>;
  ExampleComponent?: ComponentType<GuideReplayProps>;
}) => {
  const Example = ({ id, focusRequest = null }: GuideReplayProps) => {
    const { sourceUrl, sourceName }: GuideExample = atomicChessExamples[id];
    return (
      <div className="atomicChessGuideExample">
        <ExampleComponent id={id} focusRequest={focusRequest} />
        {sourceUrl && sourceName && (
          <p className="atomicChessGuideSource">
            Source: <a href={sourceUrl}>{sourceName}</a>
          </p>
        )}
      </div>
    );
  };
  return (
    <article className="atomicChessGuide">
      <header>
        <LinkComponent href="/">Back to home</LinkComponent>
        <h1>Atomic chess: rules and strategy</h1>
      </header>

      <section className="atomicChessGuideIntro" id="introduction" aria-labelledby="intro-title">
        <h2 id="intro-title">Introduction</h2>
        <p>
          Atomic chess is a variant in which every capture causes an explosion. Both pieces involved
          in the capture are removed, along with adjacent pieces other than pawns. You win by
          exploding the opposing king or by checkmate.
        </p>
      </section>

      <GuideContents />

      <section id="rules" aria-labelledby="rules-title">
        <h2 id="rules-title">The rules</h2>
        <Topic name="blast" />
        <p>
          Start from the normal chess position. The blast is centered on the square where the
          capturing piece lands. Both pieces involved in the capture are removed, along with
          neighboring pieces of either color, including diagonally adjacent ones. A neighboring pawn
          survives unless it made the capture or was captured.
        </p>
        <GuideBoardFigure
          panels={[
            {
              title: "Before …axb6",
              fen: atomicChessExamples.explosion.fen,
              blast: "b6",
              marked: "b7",
              description:
                "Black can capture the queen on b6 with the pawn from a7. The knight on c6 and the pawn on b7 are also inside the outlined blast.",
            },
            {
              title: "After …axb6",
              fen: explosionAfter,
              blast: "b6",
              marked: "b7",
              description:
                "The pawn from a7, queen on b6, and knight on c6 are gone. The pawn on b7 and the rook outside the blast on a8 remain.",
            },
          ]}
          caption="The solid square marks the capture; the dashed outline marks the blast. The boxed b7-pawn survives because it was only a neighbor."
        />
        <GuideReplayDisclosure label="Replay the explosion">
          {(focusRequest) => <Example id="explosion" focusRequest={focusRequest} />}
        </GuideReplayDisclosure>
        <Topic name="kings" />
        <p>
          A move that explodes your own king is illegal. Kings cannot capture, because the capturing
          piece is destroyed. Kings can stand next to each other, and checks do not apply while they
          are connected.
        </p>
        <p>
          You can win by exploding the opposing king or by checkmate. A winning explosion takes
          priority over answering a check, as long as your own king survives. With no legal moves
          and no check, the game is a draw by stalemate.
        </p>
        <GuideBoardFigure
          panels={[
            {
              title: "Illegal: both kings would explode",
              fen: "5k2/3Kp3/8/8/8/8/r3R3/8 w - - 0 1",
              blast: "e7",
              marked: "d7",
              description:
                "Capturing e7 with the white rook would explode both the black king on f8 and the boxed white king on d7.",
            },
            {
              title: "Winning: only Black’s king explodes",
              fen: atomicChessExamples.winInCheck.fen,
              blast: "e7",
              marked: "a1",
              description:
                "White's king is on a1, far from the blast. Although the black rook on a2 gives check, Rxe7 wins by exploding the black king on f8.",
            },
          ]}
          caption="Compare the same capture, Rxe7, with White’s king in two different places. Check the blast around your own king before counting an explosion as a win."
        />
        <Example id="winInCheck" />
        <p>
          You can also win without capturing anything. A queen can give mate from the next square:
          unlike in regular chess, the king cannot capture an unprotected queen.
        </p>
        <Example id="quietMate" />
        <Topic name="specialMoves" />
        <p>
          Castling and promotion are still part of the game. Check whether castling puts a
          capturable piece next to your king; the usual habit of castling early is no guarantee of
          safety here. En passant causes an explosion on the square the capturing pawn lands on,
          which can reach pieces on the next rank.
        </p>
        <Example id="enPassant" />
        <p>
          For the full rules and more positions, see
          <a href="https://lichess.org/variant/atomic"> Lichess’s atomic rules</a> and
          <a href="https://lichess.org/study/uf9GpQyI"> ijh’s Atomic Rules study</a>.
        </p>
      </section>

      <section id="opening" aria-labelledby="opening-title">
        <h2 id="opening-title">The opening</h2>
        <p>
          Before worrying about development, check for immediate threats to the squares around your
          king. A pawn move can open a useful line, but it can also give a queen or knight a route
          into your position. Learn the threats behind an opening rather than copying moves from
          standard chess.
        </p>
        <Topic name="queenAttacks" />
        <p>
          Bringing the queen out early can be dangerous for the defender. The queen may only need
          one capture on d2, f2, d7, or f7 to end the game. Captures in the center deserve
          particular care: when both pawns disappear, an entire file can open.
        </p>
        <Example id="queenFile" />
        <p>
          Driving the queen away once may not solve the problem. It can switch diagonals and attack
          two squares near the king at the same time. Look for the next queen move before deciding
          that a pawn push has defended everything.
        </p>
        <Example id="queenAngles" />
        <Topic name="knightInvasions" />
        <p>
          Knights can jump over a pawn shield and attack several targets beside the king. A knight
          on e5, for example, attacks both d7 and f7. Once it reaches d7 or f7, it may threaten a
          bishop or queen next to the king, even if the original pawn has moved.
        </p>
        <Example id="knight" />
        <p>
          Defend the knight’s route, not just the pawn it wants to take. After 1.Nf3, …f6 controls
          e5 and g5 before the knight gets there. This is one answer to this opening, not a general
          rule: moving the f-pawn can open other lines.
        </p>
        <Example id="knightDefense" />
        <Topic name="development" />
        <p>
          Bring pieces into play with a purpose. A developed bishop can stop a knight entry or
          create a threat of its own. Avoid trapping a pawn beside your king behind another piece:
          when that pawn is attacked, you may need to move it out of the blast zone. Before
          castling, examine captures near the destination square too.
        </p>
      </section>

      <section id="middlegame" aria-labelledby="middlegame-title">
        <h2 id="middlegame-title">The middlegame</h2>
        <Topic name="kingTargets" />
        <p>
          A protected piece can still be a winning target if capturing it explodes the king.
          Recapturing is irrelevant when the game has already ended. Look for bishops lining up with
          pawns near the king, knights reaching the back rank, and rooks entering along open files.
        </p>
        <p>
          Check which squares the king can leave to. A forcing attack often works by taking away an
          escape square before delivering the final threat. Sometimes moving a pawn away from the
          king is a better defense than adding another defender to it.
        </p>
        <Topic name="sacrifices" />
        <p>
          Count what remains after an explosion. Capturing a pawn may remove a rook behind it;
          capturing a defended piece may open a line for a different attacker. A queen sacrifice can
          be worth considering when it removes the one pawn blocking a bishop’s attack.
        </p>
        <Example id="sacrifice" />
        <p>
          That does not mean every sacrifice works. After each forcing move, look for an escape, a
          counterattack, or a capture that removes your attacker. If there is no immediate win, the
          material you gave up still matters.
        </p>
        <Topic name="blastDefense" />
        <p>
          When you are under attack, inspect your own captures before retreating. You may be able to
          remove several attacking pieces at once, or destroy the piece blocking an escape route. An
          explosion can also uncover a rook or bishop behind your king, so check the newly opened
          lines before playing it.
        </p>
        <Example id="blastDefense" />
        <p>
          For more replayable examples of forks, clearance, pins, and explosion defense, visit the
          <a href={TACTICAL_MOTIFS_PATH}> tactical motifs page</a>.
        </p>
      </section>

      <section id="endgame" aria-labelledby="endgame-title">
        <h2 id="endgame-title">The endgame</h2>
        <Topic name="connectedKings" />
        <p>
          In standard chess, you use your king to push the opposing king away. In atomic, the
          defender may want to get next to your king. Connected kings protect each other from
          captures that would explode both of them. A large material advantage can be insufficient
          if you cannot separate them.
        </p>
        <Example id="connectedKings" />
        <p>
          If you are trying to win, stop the defending king from making contact before you start a
          mating plan. If the kings are already connected, look for ways to limit the defender’s
          following squares. Extra pawns can change the answer by blocking a square or forcing a
          pawn move; do not assume every position with connected kings is drawn.
        </p>
        <Topic name="twoQueens" />
        <p>
          A second queen lets you separate kings that a lone queen may never pry apart. Use the
          queens to narrow the defending king’s space near an edge. Then take away the squares that
          keep it next to your king, but leave one legal move away from it. If you cover every
          square while the kings are still touching, you risk stalemate, not mate.
        </p>
        <GuideBoardFigure
          panels={[
            {
              title: "After 1. Qhh2: one legal move",
              fen: queensBeforeSeparation,
              marked: "f3",
              description:
                "White has queens on g1 and h2 and a king on h1. Black's king on g2 is connected to White's king. The only legal move is to the boxed square f3.",
            },
            {
              title: "After 1…Kf3: the kings are apart",
              fen: queensAfterSeparation,
              marked: "f3",
              description:
                "Black’s king is now on f3, separated from the white king on h1. White can give check again.",
            },
          ]}
          caption="The queens leave f3 open on purpose. Black must step away, and White can give check again."
        />
        <Example id="twoQueens" />
        <p>
          Here <span className="atomicChessExampleLine">Qhh2</span> means the queen on the h-file
          moves to h2; the g-file queen stays put. For another corner setup, see
          <a href="https://illion-atomic.netlify.app/2017/09/02/n2n-basic-endgames/#kqq-v-k">
            &#32;Illion’s two-queen endgame guide
          </a>
          .
        </p>
        <Topic name="pawnRaces" />
        <p>
          Kings can block pawns but cannot take them. Getting in front of a passed pawn is therefore
          very different from approaching it from the side. Count promotion moves, check whether the
          king can blockade the pawn, and remember that a pawn advancing toward a king may give
          check.
        </p>
        <Example id="pawnRace" />
        <Topic name="extraMaterial" />
        <p>
          Keep the kings apart and restrict the defender’s safe squares. A queen can control escape
          routes from a distance; bringing your king too close may give the defender the connection
          it needs. Before simplifying, check the ending you are entering. Removing the last pawn or
          exchanging an attacking piece can turn a win into a draw.
        </p>
        <p>
          Try <LinkComponent href="/puzzles/endgames">endgame practice</LinkComponent> to work on
          these positions, and see
          <a href="https://lichess.org/study/ikJM4K3L"> tipau’s Atomic Endgames Level 1</a> for the
          full lines and alternative defenses.
        </p>
      </section>

      <section id="practice" aria-labelledby="practice-title">
        <h2 id="practice-title">How to practice</h2>
        <p>
          Start with short <LinkComponent href="/solve">atomic chess puzzles</LinkComponent>&#32;
          and explain the winning threat to yourself before making a move. Puzzle solving requires a
          Lichess login. After an attempt, review the explanation and analysis, especially the
          opponent’s best defense.
        </p>
        <p>
          Use the <LinkComponent href="/analysis">analysis board</LinkComponent> to test a line,
          then <LinkComponent href="/practice">practice openings</LinkComponent> against moves from
          the game database. Play atomic games on
          <a href="https://lichess.org/variant/atomic"> Lichess</a> and review the first threat you
          missed, rather than only the final losing move.
        </p>
        <p>
          You can also search the <LinkComponent href="/recent">game archive</LinkComponent>, find
          players in the <LinkComponent href="/rankings">rankings</LinkComponent>, and follow
          <LinkComponent href="/tournaments"> Atomic World Championship games </LinkComponent>
          to see how experienced players handle the same ideas.
        </p>
      </section>
    </article>
  );
};
