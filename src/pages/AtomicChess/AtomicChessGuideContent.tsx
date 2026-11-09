import type { ComponentProps, ComponentType } from "react";

import { TACTICAL_MOTIFS_PATH } from "../../../shared/seo";
import { atomicChessExamples, type GuideExampleId } from "./atomicChessExamples";

const Anchor = ({ children, ...props }: ComponentProps<"a">) => <a {...props}>{children}</a>;
const ExampleCaption = ({ id }: { id: GuideExampleId }) => <p>{atomicChessExamples[id].note}</p>;

export const AtomicChessGuideContent = ({
  LinkComponent = Anchor,
  ExampleComponent = ExampleCaption,
}: {
  LinkComponent?: ComponentType<ComponentProps<"a">>;
  ExampleComponent?: ComponentType<{ id: GuideExampleId }>;
}) => {
  const Example = ({ id }: { id: GuideExampleId }) => (
    <div className="atomicChessGuideExample">
      <ExampleComponent id={id} />
      <p className="atomicChessGuideSource">
        Source: <a href={atomicChessExamples[id].sourceUrl}>{atomicChessExamples[id].sourceName}</a>
      </p>
    </div>
  );
  return (
    <article className="atomicChessGuide">
      <header>
        <LinkComponent href="/">Back to home</LinkComponent>
        <h1>Atomic chess: rules and strategy</h1>
        <p>
          Atomic chess is a variant in which every capture causes an explosion. Both pieces involved
          in the capture are removed, along with adjacent pieces other than pawns. You win by
          exploding the opposing king or by checkmate.
        </p>
      </header>

      <nav className="atomicChessGuideContents" aria-label="Guide contents">
        <a href="#rules">Rules</a>
        <a href="#opening">Opening</a>
        <a href="#middlegame">Middlegame</a>
        <a href="#endgame">Endgame</a>
        <a href="#practice">Practice</a>
      </nav>

      <section id="rules" aria-labelledby="rules-title">
        <h2 id="rules-title">The rules</h2>
        <p>
          Start from the normal chess position. Pieces move as usual, but a capture removes both
          pieces involved and every non-pawn piece within one square of the capture. Neighboring
          pawns survive. A pawn making a capture, or being captured, does not.
        </p>
        <Example id="explosion" />
        <h3>Kings, check, and checkmate</h3>
        <p>
          A move that explodes your own king is illegal. Kings cannot capture, because the capturing
          piece is destroyed. They can stand next to each other: neither king can capture the other.
        </p>
        <p>
          You can win by exploding the opposing king or by checkmate. A winning explosion takes
          priority over answering a check, as long as your own king survives. With no legal moves
          and no check, the game is a draw by stalemate.
        </p>
        <h3>Castling, promotion, and en passant</h3>
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
        <h3>Early queen attacks</h3>
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
        <h3>Knight invasions</h3>
        <p>
          Knights can jump over a pawn shield and attack several targets beside the king. A knight
          on e5, for example, attacks both d7 and f7. Once it reaches d7 or f7, it may threaten a
          bishop or queen next to the king, even if the original pawn has moved.
        </p>
        <Example id="knight" />
        <p>
          Defend the knight’s route as well as its destination. In the position after 1.Nf3, …f6
          controls e5 and g5; the study shows why more casual replies can allow an immediate attack.
          This does not make …f6 a universal answer: always check what else the move opens.
        </p>
        <h3>Development and king safety</h3>
        <p>
          Bring pieces into play with a purpose. A developed bishop can stop a knight entry or
          create a threat of its own. Avoid trapping a pawn beside your king behind another piece:
          when that pawn is attacked, you may need to move it out of the blast zone. Before
          castling, examine captures near the destination square too.
        </p>
      </section>

      <section id="middlegame" aria-labelledby="middlegame-title">
        <h2 id="middlegame-title">The middlegame</h2>
        <h3>Find targets beside the king</h3>
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
        <h3>Sacrifices and material</h3>
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
        <h3>Defending with an explosion</h3>
        <p>
          When you are under attack, inspect your own captures before retreating. You may be able to
          remove several attacking pieces at once, or destroy the piece blocking an escape route. An
          explosion can also uncover a rook or bishop behind your king, so check the newly opened
          lines before playing it.
        </p>
        <p>
          For more replayable examples of forks, clearance, pins, and explosion defense, visit the
          <a href={TACTICAL_MOTIFS_PATH}> tactical motifs page</a>.
        </p>
      </section>

      <section id="endgame" aria-labelledby="endgame-title">
        <h2 id="endgame-title">The endgame</h2>
        <h3>Connected kings</h3>
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
        <h3>Pawn endings and promotion races</h3>
        <p>
          Kings can block pawns but cannot take them. Getting in front of a passed pawn is therefore
          very different from approaching it from the side. Count promotion moves, check whether the
          king can blockade the pawn, and remember that a pawn advancing toward a king may give
          check.
        </p>
        <Example id="pawnRace" />
        <h3>Converting extra material</h3>
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
