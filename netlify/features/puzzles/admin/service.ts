import {
  isPuzzleMotifTag,
  normalizePuzzleMotifTags,
} from "../../../../shared/domain/puzzles/puzzleMotifs";
import {
  compactPuzzleSolution,
  validatePuzzleSubmission,
} from "../../../../shared/domain/puzzles/puzzleSubmission";
import { HttpError } from "../../../platform/errors";
import type { PuzzleAdminRepository } from "./repository";

export type PuzzleAdminAction =
  | { action: "get"; puzzleId?: number; direction: "latest" | "exact" | "older" | "newer" }
  | {
      action: "update";
      puzzleId: number;
      fen: string;
      solution: string;
      author: string;
      event: string;
      whitePlayer: string;
      blackPlayer: string;
      explanation: string;
      opaStyle: boolean;
      tags: string[];
    }
  | { action: "tag-votes"; puzzleId: number; beforeId?: number }
  | { action: "mark-tag-vote-incorrect"; puzzleId: number; voteId: number }
  | { action: "delete"; puzzleId: number }
  | { action: "restore"; puzzleId: number };

export class PuzzleAdminService {
  constructor(
    private readonly repository: PuzzleAdminRepository,
    private readonly username: string,
  ) {}

  async execute(input: PuzzleAdminAction) {
    if (input.action === "get") {
      return this.repository.get(input.puzzleId, input.direction);
    }

    if (input.action === "tag-votes") {
      return this.repository.listTagVoteEvents(input.puzzleId, input.beforeId);
    }

    if (input.action === "mark-tag-vote-incorrect") {
      return this.repository.markTagVoteIncorrect(input.puzzleId, input.voteId, this.username);
    }

    if (input.action === "delete") {
      await this.repository.delete(input.puzzleId, this.username);
      return this.repository.get(input.puzzleId, "exact");
    }

    if (input.action === "restore") {
      await this.repository.restore(input.puzzleId, this.username);
      return this.repository.get(input.puzzleId, "exact");
    }

    if (!input.author.trim()) throw new HttpError(400, "Enter an author.");
    if (!input.tags.every(isPuzzleMotifTag)) throw new HttpError(400, "Unknown puzzle motif.");

    const normalized = validatePuzzleSubmission({
      fen: input.fen,
      solution: compactPuzzleSolution(input.solution),
      event: input.event,
      whitePlayer: input.whitePlayer,
      blackPlayer: input.blackPlayer,
      explanation: input.explanation,
      opaStyle: input.opaStyle,
    });
    await this.repository.update(input.puzzleId, {
      ...normalized,
      solution: compactPuzzleSolution(normalized.solution),
      author: input.author.trim().toLowerCase(),
      whitePlayer: normalized.whitePlayer ?? "",
      blackPlayer: normalized.blackPlayer ?? "",
      opaStyle: normalized.opaStyle === true,
      tags: normalizePuzzleMotifTags(input.tags),
    });
    return this.repository.get(input.puzzleId, "exact");
  }
}
