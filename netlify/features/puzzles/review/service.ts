import {
  compactPuzzleSolution,
  validatePuzzleSubmission,
} from "../../../../shared/domain/puzzles/puzzleSubmission";
import { HttpError } from "../../../platform/errors";
import type { PuzzleReviewRepository } from "./repository";

export type PuzzleReviewAction =
  | { action: "list" }
  | { action: "reject"; id: number }
  | { action: "approve"; id: number; puzzleId: number }
  | {
      action: "update";
      id: number;
      fen: string;
      solution: string;
      event: string;
      explanation: string;
      author: string;
    };

const PUBLIC_DOMAIN_ERROR = /^(Invalid (FEN|atomic position|PGN)|Enter PGN|The PGN|The moves)/;

export class PuzzleReviewService {
  private repositoryInstance: PuzzleReviewRepository | null = null;

  constructor(
    private readonly createRepository: () => PuzzleReviewRepository,
    private readonly reviewer: string,
  ) {}

  private repository(): PuzzleReviewRepository {
    this.repositoryInstance ??= this.createRepository();
    return this.repositoryInstance;
  }

  async execute(input: PuzzleReviewAction) {
    if (input.action === "list") {
      const puzzles = await this.repository().listQueue();
      if (puzzles.length === 0) return { puzzles: [] };
      const nextPuzzleId = await this.repository().nextPuzzleId();
      return { puzzles: puzzles.map((puzzle) => ({ ...puzzle, next_puzzle_id: nextPuzzleId })) };
    }

    if (input.action === "reject") {
      await this.repository().reject(input.id);
      return { rejected: true };
    }

    if (input.action === "approve") {
      return { puzzleId: await this.repository().approve(input.id, this.reviewer, input.puzzleId) };
    }

    try {
      const validated = validatePuzzleSubmission({
        fen: input.fen,
        solution: compactPuzzleSolution(input.solution),
        event: input.event,
        explanation: input.explanation,
      });
      const puzzle = await this.repository().update(input.id, {
        ...validated,
        solution: compactPuzzleSolution(validated.solution),
        submitted_by: input.author,
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
