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
  specialMoves: ["special-moves", "Castling and promotion"],
  enPassant: ["en-passant", "En passant"],
  queenAttacks: ["queen-attacks", "Watch for open queen lines"],
  knightInvasions: ["knight-invasions", "Stop the knight before it forks"],
  starterOpenings: ["opening-lines", "Starter openings"],
  twoKnightsOpening: ["two-knights-opening", "Two Knights (2N)"],
  nf3E3Opening: ["nf3-e3-opening", "Nf3 e3 (Atomic Attack)"],
  nh3D4Opening: ["nh3-d4-opening", "Nh3 d4"],
  development: ["development", "How to study an atomic opening"],
  kingTargets: ["king-targets", "Find targets beside the king"],
  sacrifices: ["sacrifices", "Sacrifices and material"],
  blastDefense: ["blast-defense", "Defending with an explosion"],
  connectedKings: ["connected-kings", "Connected kings"],
  twoQueens: ["kqq-vs-k", "Two queens vs. king (KQQ vs K)"],
  pawnRaces: ["pawn-races", "Pawn endings and promotion races"],
  extraMaterial: ["extra-material", "Converting extra material"],
} as const;

const contents = [
  ["rules", "The rules", [topics.blast, topics.kings, topics.specialMoves, topics.enPassant]],
  [
    "opening",
    "Opening",
    [topics.queenAttacks, topics.knightInvasions, topics.starterOpenings, topics.development],
  ],
  ["middlegame", "Middlegame", [topics.kingTargets, topics.sacrifices, topics.blastDefense]],
  [
    "endgame",
    "Endgame",
    [topics.connectedKings, topics.twoQueens, topics.pawnRaces, topics.extraMaterial],
  ],
  ["how-to-play", "How to play", []],
  ["practice", "How to improve", []],
] as const;

const Topic = ({ name, as: Heading = "h3" }: { name: keyof typeof topics; as?: "h3" | "h4" }) => {
  const [id, label] = topics[name];
  return <Heading id={id}>{label}</Heading>;
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
          Start from the normal chess position. The explosion is centered on the square where the
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
                "Black can capture the queen on b6 with the pawn from a7. The dashed outline shows that the explosion also reaches the knight on c6 and the pawn on b7.",
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
          caption="Compare the same capture, Rxe7, with White’s king in two different places. Before counting an explosion as a win, check whether it reaches your own king."
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
          safety here.
        </p>
        <GuideBoardFigure
          panels={[
            {
              title: "Safe after 1. O-O",
              fen: "k7/4b3/8/8/8/8/5PPP/5RK1 b - - 1 1",
              marked: "g1",
              description:
                "After White castles kingside, Black’s bishop on e7 cannot capture anything next to the boxed king on g1.",
            },
            {
              title: "Unsafe after 1. O-O",
              fen: "k7/8/3b4/8/8/8/5PPP/5RK1 b - - 1 1",
              blast: "h2",
              marked: "g1",
              description:
                "After White castles kingside, Black’s bishop on d6 can capture the pawn on h2. The dashed outline shows that the explosion reaches the boxed white king on g1.",
            },
          ]}
          caption="Both castles are legal. From e7, the bishop has no capture next to the king. From d6, it wins immediately with 1…Bxh2#, exploding the king on g1."
        />
        <Topic name="enPassant" />
        <p>
          En passant causes an explosion on the square the capturing pawn lands on, which can reach
          pieces on the next rank.
        </p>
        <Example id="enPassant" />
        <p>
          For the full rules and more positions, see
          <a href="https://lichess.org/variant/atomic"> Lichess’s atomic rules</a> and
          <a href="https://lichess.org/study/uf9GpQyI"> ijh’s Atomic Rules study</a>.
        </p>
      </section>

      <section id="opening" aria-labelledby="opening-title">
        <h2 id="opening-title">Opening</h2>
        <p>
          Many atomic games are won or lost in the opening. A move that looks like ordinary
          development can give your opponent a winning capture next to your king, and you won’t get
          another turn to fix it. That’s why it’s worth studying the opening early, even if you
          don’t want to memorize long lines.
        </p>
        <p>
          Develop traps in openings you’d still be happy to play if your opponent sees them coming.
          For each trap, learn which natural-looking reply it punishes and what you’ll play if your
          opponent avoids it. Then study the traps you face from the defending side: start from the
          losing position, go back a move or two, and find where you could have cut off the attack.
        </p>
        <p>When you replay an opening, look for three ways an attack can reach either king:</p>
        <ul>
          <li>
            <strong>Early queen attacks:</strong> Which targets next to the king can the queen
            reach? If you block one route, can it switch to another?
          </li>
          <li>
            <strong>Knight invasions:</strong> Where can the knight jump next, and which squares
            beside the king could it attack from there?
          </li>
          <li>
            <strong>Open files and diagonals:</strong> If a pawn moves or a capture clears several
            squares, what lines open up, and who can use them first?
          </li>
        </ul>
        <Topic name="queenAttacks" />
        <p>
          Visualize the board after an explosion before you capture. After 1. e4 d5 2. exd5, both
          pawns disappear. Black’s queen on d8 has a clear path to d2, right beside White’s king.
        </p>
        <Example id="queenFile" />
        <p>
          A pawn push can close one line without stopping the attack. Here Black plays …g6 against
          Qh5, but the queen switches to d5 and threatens both d7 and f7. Moving just one of those
          pawns leaves the other exposed.
        </p>
        <Example id="queenAngles" />
        <Topic name="knightInvasions" />
        <p>
          After 1. Nf3, Black needs to keep the knight from invading. The immediate threat is 2.
          Ne5, forking the pawns on d7 and f7. This isn’t a fork that wins a pawn: either capture
          explodes the king on e8 and ends the game.
        </p>
        <p>
          Natural replies like 1…e6 and 1…c5 leave e5 open and both pawns in place. Once the knight
          gets to e5, moving one pawn won’t save you. In the replay below, 2…d5 takes away the
          target on d7 but leaves 3. Nxf7#.
        </p>
        <Example id="knight" />
        <p>
          Compare 1…f6. The pawn covers both e5 and g5, another square from which the knight could
          attack f7. If White jumps to e5 anyway, Black can play 2…fxe5 before the knight gets a
          chance to capture. The explosion on e5 is safely away from Black’s king.
        </p>
        <Example id="knightDefense" />
        <section aria-labelledby="opening-lines">
          <Topic name="starterOpenings" />
          <Topic name="twoKnightsOpening" as="h4" />
          <p>
            <span className="atomicChessExampleLine">1. Nf3 f6 2. Nc3</span> is one of White’s
            strongest choices in{" "}
            <LinkComponent href="/rankings/openings">engine analysis</LinkComponent>. It’s also a
            staple in practice: 2. Nc3 was the most played move after 1. Nf3 f6 in the Atomic
            Puzzles explorer from November 2025 through October 2026.
          </p>
          <p>
            After 2…Nh6, Black wants to jump to g4 and threaten Nxf2#, exploding White’s king. White
            can cover g4 with 3. h3 or occupy it with 3. g4, as in the replay. Occupying the square
            turns the knight jump into a capture, so the knight itself explodes instead of staying
            on g4. There’s also 3. Ne5 fxe5 4. d4, where White gives up a knight and then opens the
            c1-bishop’s line to h6.
          </p>
          <p>
            Prepare 2…c6 separately. It covers b5 and d5, but a knight sacrifice can still open the
            way for the queen to travel through h5, b5, and b6, a maneuver that also turns up in Nf3
            e3 theory.
          </p>
          <Example id="twoKnightsOpening" />

          <Topic name="nf3E3Opening" as="h4" />
          <p>
            <span className="atomicChessExampleLine">1. Nf3 f6 2. e3</span> is the historical
            favorite after …f6 in the explorer’s full archive. On Lichess, you’ll meet many spammers
            of this opening who know all the main lines by heart. That’s why it’s worth preparing a
            defense even if you never play it as White. Learn what changes after 2…d5 and 2…e6
            rather than memorizing one reply to everything. You can also reach the 2…e6 position via
            1. e3 e6 2. Nf3 f6.
          </p>
          <p>
            The board shows 2…d5 3. Ng5 fxg5, but Black doesn’t have to take the knight. After
            3…Bg4, the bishop aims down the squares White just cleared: f3, e2, and finally d1.
            White has to deal with Bxd1#, since taking the queen would explode the king on e1.
          </p>
          <p>
            Like Two Knights, this opening often sends both players deep into familiar theory. What
            sets it apart is the position you’re playing for: White often emerges a pawn or two up
            with the queens gone, then has to grind out the win. As{" "}
            <a href="https://lichess.org/forum/general-chess-discussion/why-does-everyone-hate-nf3-e3-in-atomic">
              Wolfram_EP notes on Lichess
            </a>
            , Black can still have counterplay. Try playing the replay position after 6. Qxc7 from
            both sides. As White, learn which trades help you convert the extra pawns; as Black,
            look for threats that keep White from using them.
          </p>
          <Example id="nf3E3Opening" />

          <Topic name="nh3D4Opening" as="h4" />
          <p>
            <span className="atomicChessExampleLine">1. Nh3 h6 2. d4</span> is the least
            conventional of the three, but it’s just as theory-heavy. It gives you more room for
            tactical play: where Nf3 e3 often leads to a queenless grind, Nh3 d4 can start a fight
            on move three with both queens still on the board. The move order has also grown more
            common in the game archive over the past year.
          </p>
          <p>
            After 2…e6, White’s 3. Bg5 threatens to take the queen on d8 and explode the king beside
            it. Black can take the bishop with 3…hxg5, but the explosion clears g5 for 4. Ng5, and
            now the knight threatens Nxf7#. The replay follows the more common 3…f6, which blocks
            the line to d8 and attacks the bishop. After 4. Bf4, Black has several ways to continue;{" "}
            <a href="https://lichess.org/study/SuwIxql6/nQ6yidC8">catask’s study</a> has separate
            chapters for …e5, …d6, and …Bb4+.
          </p>
          <p>
            As Black, look at 2…d5 as a separate defense. The pawn on e7 hasn’t moved, so Bg5 would
            threaten Bxe7# instead of Bxd8#. Black has also cleared d7 for the c8-bishop. Don’t
            assume the replies you learned against 2…e6 carry over.
          </p>
          <Example id="nh3D4Opening" />
        </section>
        <Topic name="development" />
        <p>
          Start with one opening as White and a defense as Black. Study the first move where the
          line branches, not just the moves you already know. Look for threats that recur across
          different replies, and memorize the exact order where one wrong move loses. Then play a
          few games from the position where your notes end; that’s the part you’ll need to handle on
          your own.
        </p>
      </section>

      <section id="middlegame" aria-labelledby="middlegame-title">
        <h2 id="middlegame-title">Middlegame</h2>
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
        <p>
          If you’re down material, don’t rush to win it back. A pawn push that opens a file or
          drives a piece away can give you the next threat. If you’re ahead, check for that
          counterplay before spending a turn trying to trade.
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
        <h2 id="endgame-title">Endgame</h2>
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
          it needs.
        </p>
        <p>
          Before trading, look at what will survive the explosion. Reducing the position to kings
          and pawns is sometimes called <em>pawnitization</em>. A position that was winning with an
          extra piece can be drawn after that trade. Count the moves to promotion and check whether
          a king can blockade the passed pawn before you commit.
        </p>
        <p>
          Try <LinkComponent href="/puzzles/endgames">endgame practice</LinkComponent> to work on
          these positions, and see
          <a href="https://lichess.org/study/ikJM4K3L"> tipau’s Atomic Endgames Level 1</a> for the
          full lines and alternative defenses.
        </p>
      </section>

      <section id="how-to-play" aria-labelledby="how-to-play-title">
        <h2 id="how-to-play-title">How to play</h2>
        <ul>
          <li>
            <a href="https://lichess.org/">Play on Lichess</a>: choose{" "}
            <strong>Create a game</strong> and select <strong>Atomic</strong> as the variant.
          </li>
          <li>
            <a href="https://www.chess.com/variants/atomic">Play on Chess.com</a>: open the Atomic
            variant in your browser, choose a time control, and start a game.
          </li>
        </ul>
        <p>
          Start with a slower clock. Give yourself time to visualize the explosion before you
          capture and to check what your opponent can take next.
        </p>
      </section>

      <section id="practice" aria-labelledby="practice-title">
        <h2 id="practice-title">How to improve</h2>
        <ol>
          <li>
            <strong>Review the first threat you missed.</strong> On the{" "}
            <LinkComponent href="/analysis">analysis board</LinkComponent>, go back before the final
            mistake. Find the move that let the attack start, then try a different reply.
          </li>
          <li>
            <strong>Practice what cost you the game.</strong> If you missed a winning capture, solve{" "}
            <LinkComponent href="/solve">atomic puzzles</LinkComponent> and explain the threat
            before moving. If the same opening trap keeps catching you, replay it from the defending
            side in <LinkComponent href="/practice">opening practice</LinkComponent>. If you got
            ahead but couldn’t finish, try{" "}
            <LinkComponent href="/puzzles/endgames">endgame practice</LinkComponent>. Puzzle solving
            requires a Lichess login.
          </li>
          <li>
            <strong>See how stronger players handle it.</strong> Find the opening in the{" "}
            <LinkComponent href="/recent">game archive</LinkComponent> or replay{" "}
            <LinkComponent href="/tournaments">Atomic World Championship games</LinkComponent>.
            Pause where you’re unsure what to play and choose a move before revealing theirs.
          </li>
        </ol>
      </section>
    </article>
  );
};
