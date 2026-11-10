import { INITIAL_FEN } from "chessops/fen";

import { archivedGameInitialFen } from "../../../../shared/domain/chess/initialFen";
import { isApprovedPuzzleCreator } from "../../../../shared/domain/puzzles/approvedPuzzleCreators";
import { matchPuzzleGameHistory } from "../../../../shared/domain/puzzles/gameHistory";
import { normalizePuzzleMotifTags } from "../../../../shared/domain/puzzles/puzzleMotifs";
import { normalizePuzzlePlayers } from "../../../../shared/domain/puzzles/puzzleSetMetadata";
import {
  compactPuzzleSolution,
  parsePuzzlePgnInput,
  type PuzzlePositionHistory,
  type PuzzleSubmissionValue,
} from "../../../../shared/domain/puzzles/puzzleSubmission";
import {
  createAtomicPosition,
  normalizeSolutionPgn,
  parseSolutionUciLines,
} from "../../../../shared/domain/puzzles/solutionPgn";
import { HttpError } from "../../../platform/errors";
import type { loadMatchPuzzleContext } from "./matchContext";
import type { PuzzleSubmissionRepository } from "./repository";

export type PuzzleSubmissionInput = PuzzleSubmissionValue & {
  opaStyle: boolean;
  author: string;
  positionInitialFen?: PuzzlePositionHistory["positionInitialFen"] | undefined;
  positionMoves?: PuzzlePositionHistory["positionMoves"] | undefined;
};

const PUBLIC_DOMAIN_ERROR = /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN)/;

export class PuzzleSubmissionService {
  constructor(private readonly repository: PuzzleSubmissionRepository) {}

  private normalize(
    username: string,
    input: PuzzleSubmissionInput,
    fallbackInitialFen: string | null = INITIAL_FEN,
  ) {
    const parsedPgn = parsePuzzlePgnInput(input.solution, input.fen);
    const fen = parsedPgn.fen;
    const solution = compactPuzzleSolution(parsedPgn.solution);
    createAtomicPosition(fen);
    if (parseSolutionUciLines(fen, solution).length === 0) {
      throw new HttpError(400, "The moves are not legal from this atomic position.");
    }
    const initialFen = input.positionInitialFen ?? fallbackInitialFen;
    const history =
      input.positionMoves && initialFen
        ? matchPuzzleGameHistory(fen, input.positionMoves, initialFen, true)
        : null;
    if ((input.positionMoves !== undefined || input.positionInitialFen !== undefined) && !history) {
      throw new HttpError(400, "The moves leading up to the puzzle do not reach its starting position.");
    }
    const whitePlayer = input.whitePlayer?.trim() ?? "";
    const blackPlayer = input.blackPlayer?.trim() ?? "";
    const normalizedUsername = username.trim().toLowerCase();
    const author =
      normalizedUsername === "seaside_tiramisu"
        ? input.author.trim() || normalizedUsername
        : normalizedUsername;
    return {
      fen,
      solution: compactPuzzleSolution(normalizeSolutionPgn(fen, solution)),
      event: parsedPgn.event || input.event,
      // Event metadata remains unset until it can be reviewed, while the
      // explicitly supplied players can safely populate the participants.
      eventName: "",
      eventDate: "",
      players: normalizePuzzlePlayers([whitePlayer, blackPlayer]),
      whitePlayer,
      blackPlayer,
      explanation: input.explanation,
      opaStyle: input.opaStyle === true,
      author,
      tags: normalizePuzzleMotifTags(input.tags),
      ...(history && initialFen ? { positionMoves: history.moves, gameInitialFen: initialFen } : {}),
    };
  }

  async submitBatch(
    username: string,
    inputs: PuzzleSubmissionInput[],
    allowDifferentStartMove = false,
  ) {
    try {
      // Validate every puzzle before performing the first write.
      const normalizedPuzzles = inputs.map((input) => this.normalize(username, input));
      if (isApprovedPuzzleCreator(username)) {
        return {
          destination: "published" as const,
          puzzleIds: await this.repository.publishBatch(
            username,
            normalizedPuzzles,
            allowDifferentStartMove,
          ),
        };
      }
      const puzzles = [];
      for (const normalizedPuzzle of normalizedPuzzles) {
        puzzles.push(
          await this.repository.enqueue(username, normalizedPuzzle, allowDifferentStartMove),
        );
      }
      return {
        destination: "review" as const,
        puzzles,
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && PUBLIC_DOMAIN_ERROR.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }

  async submit(username: string, input: PuzzleSubmissionInput, allowDifferentStartMove = false) {
    const result = await this.submitBatch(username, [input], allowDifferentStartMove);
    return result.destination === "published"
      ? { destination: result.destination, puzzleId: result.puzzleIds[0] }
      : { destination: result.destination, puzzle: result.puzzles[0] };
  }

  async submitMatchPuzzle(
    username: string,
    input: PuzzleSubmissionInput & {
      gameId: string;
      matchName: string;
      renameFrom?: string | undefined;
      allowDifferentStartMove?: boolean | undefined;
    },
    context: Awaited<ReturnType<typeof loadMatchPuzzleContext>>,
  ) {
    if (input.renameFrom && (!context.canRenameSet || input.renameFrom !== context.setName)) {
      throw new HttpError(409, "This set can no longer be renamed. Reopen the puzzle editor.");
    }
    const setName = input.renameFrom ? input.matchName : context.setName;
    if (!setName) throw new HttpError(400, "Enter a name for this match.");
    try {
      const initialFen = archivedGameInitialFen(context.sourceGame);
      const puzzle = this.normalize(
        username,
        { ...input, whitePlayer: context.whitePlayer, blackPlayer: context.blackPlayer },
        initialFen,
      );
      if (puzzle.fen !== input.fen) {
        throw new HttpError(400, "The solution must start from the selected position.");
      }
      // Older clients do not send the selected branch. Match those requests
      // against the archived main line only when no board history was supplied.
      const archiveHistory =
        input.positionMoves === undefined && initialFen && context.sourceGame.moves
          ? matchPuzzleGameHistory(puzzle.fen, context.sourceGame.moves, initialFen)
          : null;
      const publish = isApprovedPuzzleCreator(username);
      return await this.repository.saveMatchPuzzle({
        username,
        puzzle: {
          ...puzzle,
          event: setName,
          eventName: setName,
          eventDate: context.eventDate,
          ...(archiveHistory && initialFen
            ? { positionMoves: archiveHistory.moves, gameInitialFen: initialFen }
            : {}),
        },
        gameId: input.gameId,
        matchId: context.matchId,
        existingSetId: context.existingSetId,
        renameFrom: input.renameFrom,
        publish,
        allowDifferentStartMove: input.allowDifferentStartMove ?? false,
      });
    } catch (error) {
      if (error instanceof Error && PUBLIC_DOMAIN_ERROR.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }
}
