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
  explanation: string;
};

const PUBLIC_DOMAIN_ERROR = /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN)/;

export class PuzzleSubmissionService {
  constructor(private readonly repository: PuzzleSubmissionRepository) {}

  async submit(username: string, input: PuzzleSubmissionInput) {
    try {
      const parsedPgn = parsePuzzlePgnInput(input.solution, input.fen);
      const fen = parsedPgn.fen;
      const solution = compactPuzzleSolution(parsedPgn.solution);
      createAtomicPosition(fen);
      if (parseSolutionUciLines(fen, solution).length === 0) {
        throw new HttpError(400, "The moves are not legal from this atomic position.");
      }
      const puzzle = await this.repository.enqueue(username, {
        fen,
        solution: compactPuzzleSolution(normalizeSolutionPgn(fen, solution)),
        event: parsedPgn.event || input.event,
        explanation: input.explanation,
      });
      return { puzzle };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      if (error instanceof Error && PUBLIC_DOMAIN_ERROR.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }
}
