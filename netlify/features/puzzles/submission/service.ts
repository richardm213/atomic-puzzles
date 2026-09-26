import { isApprovedPuzzleCreator } from "../../../../shared/domain/puzzles/approvedPuzzleCreators";
import { normalizePuzzlePlayers } from "../../../../shared/domain/puzzles/puzzleSetMetadata";
import {
  compactPuzzleSolution,
  parsePuzzlePgnInput,
} from "../../../../shared/domain/puzzles/puzzleSubmission";
import {
  createAtomicPosition,
  normalizeSolutionPgn,
  parseSolutionUciLines,
} from "../../../../shared/domain/puzzles/solutionPgn";
import { HttpError } from "../../../platform/errors";
import type { PuzzleSubmissionRepository } from "./repository";

export type PuzzleSubmissionInput = {
  fen: string;
  solution: string;
  event: string;
  whitePlayer?: string;
  blackPlayer?: string;
  explanation: string;
};

const PUBLIC_DOMAIN_ERROR = /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN)/;

export class PuzzleSubmissionService {
  constructor(private readonly repository: PuzzleSubmissionRepository) {}

  private normalize(input: PuzzleSubmissionInput) {
    const parsedPgn = parsePuzzlePgnInput(input.solution, input.fen);
    const fen = parsedPgn.fen;
    const solution = compactPuzzleSolution(parsedPgn.solution);
    createAtomicPosition(fen);
    if (parseSolutionUciLines(fen, solution).length === 0) {
      throw new HttpError(400, "The moves are not legal from this atomic position.");
    }
    const whitePlayer = input.whitePlayer?.trim() ?? "";
    const blackPlayer = input.blackPlayer?.trim() ?? "";
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
    };
  }

  async submitBatch(
    username: string,
    inputs: PuzzleSubmissionInput[],
    allowDifferentStartMove = false,
  ) {
    try {
      // Validate every puzzle before performing the first write.
      const normalizedPuzzles = inputs.map((input) => this.normalize(input));
      if (isApprovedPuzzleCreator(username) && !allowDifferentStartMove) {
        return {
          destination: "published" as const,
          puzzleIds: await this.repository.publishBatch(username, normalizedPuzzles),
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
}
