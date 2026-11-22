import { INITIAL_FEN } from "chessops/fen";

import { archivedGameInitialFen } from "../../../../shared/domain/chess/initialFen";
import { isApprovedPuzzleCreator } from "../../../../shared/domain/puzzles/approvedPuzzleCreators";
import { matchPuzzleGameHistory } from "../../../../shared/domain/puzzles/gameHistory";
import { PUZZLE_ADMIN_USERNAME } from "../../../../shared/domain/puzzles/puzzleAdmin";
import { normalizePuzzleMotifTags } from "../../../../shared/domain/puzzles/puzzleMotifs";
import { normalizePuzzlePlayers } from "../../../../shared/domain/puzzles/puzzleSetMetadata";
import {
  compactPuzzleSolution,
  parsePuzzlePgnInput,
  validateParsedPuzzleSubmission,
  type PuzzlePositionHistory,
  type PuzzleSubmissionValue,
} from "../../../../shared/domain/puzzles/puzzleSubmission";
import { HttpError } from "../../../platform/errors";
import type { loadMatchPuzzleContext } from "./matchContext";
import type { PuzzleSubmissionRepository } from "./repository";

export type PuzzleSubmissionInput = PuzzleSubmissionValue & {
  opaStyle: boolean;
  author: string;
  positionInitialFen?: PuzzlePositionHistory["positionInitialFen"] | undefined;
  positionMoves?: PuzzlePositionHistory["positionMoves"] | undefined;
};

const PUBLIC_DOMAIN_ERROR =
  /^(Invalid (FEN|atomic position|PGN)|Enter |The PGN|The moves are not a legal atomic line)/;

export class PuzzleSubmissionService {
  constructor(private readonly repository: PuzzleSubmissionRepository) {}

  private normalize(
    username: string,
    input: PuzzleSubmissionInput,
    fallbackInitialFen: string | null = INITIAL_FEN,
  ) {
    const parsedPgn = parsePuzzlePgnInput(input.solution, input.fen);
    const fen = parsedPgn.fen;
    const solution = validateParsedPuzzleSubmission(input, {
      ...parsedPgn,
      solution: compactPuzzleSolution(parsedPgn.solution),
    }).solution;
    const initialFen = input.positionInitialFen ?? fallbackInitialFen;
    const history =
      input.positionMoves && initialFen
        ? matchPuzzleGameHistory(fen, input.positionMoves, initialFen, true)
        : null;
    if ((input.positionMoves !== undefined || input.positionInitialFen !== undefined) && !history) {
      throw new HttpError(
        400,
        "The moves leading up to the puzzle do not reach its starting position.",
      );
    }
    const whitePlayer = input.whitePlayer?.trim() ?? "";
    const blackPlayer = input.blackPlayer?.trim() ?? "";
    const normalizedUsername = username.trim().toLowerCase();
    const author =
      normalizedUsername === PUZZLE_ADMIN_USERNAME
        ? input.author.trim() || normalizedUsername
        : normalizedUsername;
    return {
      fen,
      solution: compactPuzzleSolution(solution),
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
      ...(history && initialFen
        ? { positionMoves: history.moves, gameInitialFen: initialFen }
        : {}),
    };
  }

  async submit(username: string, input: PuzzleSubmissionInput) {
    try {
      const puzzle = this.normalize(username, input);
      if (isApprovedPuzzleCreator(username)) {
        return {
          destination: "published" as const,
          puzzleId: await this.repository.publish(username, puzzle),
        };
      }
      return {
        destination: "review" as const,
        puzzle: await this.repository.enqueue(username, puzzle),
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && PUBLIC_DOMAIN_ERROR.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }

  async submitMatchPuzzle(
    username: string,
    input: PuzzleSubmissionInput & {
      gameId: string;
      matchName: string;
      renameFrom?: string | undefined;
    },
    context: Awaited<ReturnType<typeof loadMatchPuzzleContext>>,
  ) {
    if (input.renameFrom && (!context.canRenameSet || input.renameFrom !== context.setName)) {
      throw new HttpError(409, "This set can no longer be renamed. Reopen the puzzle editor.");
    }
    const setName = input.renameFrom ? input.matchName : context.setName;
    if (context.tournamentMatch && !setName)
      throw new HttpError(400, "Missing tournament set name.");
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
          tournamentMatch: context.tournamentMatch,
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
      });
    } catch (error) {
      if (error instanceof Error && PUBLIC_DOMAIN_ERROR.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }
}
