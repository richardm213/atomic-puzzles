import { normalizePuzzleMotifTags } from "../../../../shared/domain/puzzles/puzzleMotifs";
import { HttpError } from "../../../platform/errors";
import type { PuzzleTagRepository } from "./repository";

export class PuzzleTagService {
  constructor(private readonly repository: PuzzleTagRepository) {}

  async update(puzzleId: number, inputTags: string[]) {
    const tags = normalizePuzzleMotifTags(inputTags);
    const data = await this.repository.update(puzzleId, tags);
    if (!data) throw new HttpError(404, "Puzzle not found.");
    return { puzzleId: Number(data.id), tags: normalizePuzzleMotifTags(data.tags) };
  }
}
