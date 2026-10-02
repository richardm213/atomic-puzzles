import { isPuzzleEndgameMotifTag } from "../../../../shared/domain/puzzles/puzzleMotifs";
import { evaluatePuzzleMoves } from "../../../../shared/domain/puzzles/serverEvaluation";
import { HttpError } from "../../../platform/errors";
import {
  createPendingItem,
  type CustomPuzzleSetAction,
  type CustomPuzzleSetFilters,
  type CustomPuzzleSetItemRow,
  decodeCustomPuzzleSetFilters,
  serializeCustomPuzzleSet,
} from "./model";
import type { CustomPuzzleSetRepository } from "./repository";

type ServiceResult = {
  statusCode: number;
  body: Record<string, unknown>;
};

export class CustomPuzzleSetService {
  constructor(private readonly repository: CustomPuzzleSetRepository) {}

  private async loadMatchingPuzzleIds(filters: CustomPuzzleSetFilters): Promise<string[]> {
    const progressRows = await this.repository.loadProgress();
    const attemptedIds = [...new Set(progressRows.map((row) => String(row.puzzle_id)))];
    const resultByPuzzleId = new Map(
      progressRows.map((row) => [String(row.puzzle_id), Boolean(row.puzzle_correct)]),
    );
    const includeUnattemptedEndgames =
      !filters.untaggedOnly &&
      filters.resultFilter === "all" &&
      filters.tags.some(isPuzzleEndgameMotifTag);
    if (!attemptedIds.length && !includeUnattemptedEndgames) return [];

    const puzzles = includeUnattemptedEndgames
      ? await this.repository.loadAllPuzzles()
      : await this.repository.loadPuzzlesByIds(attemptedIds);
    const normalizedAuthors = new Set(filters.authors.map((author) => author.toLocaleLowerCase()));
    const puzzlesById = new Map(puzzles.map((puzzle) => [String(puzzle.id), puzzle]));
    const attemptedIdSet = new Set(attemptedIds);
    const candidateIds = includeUnattemptedEndgames
      ? [
          ...attemptedIds,
          ...puzzles
            .map((puzzle) => String(puzzle.id))
            .filter((puzzleId) => !attemptedIdSet.has(puzzleId)),
        ]
      : attemptedIds;

    return candidateIds.filter((puzzleId) => {
      const puzzle = puzzlesById.get(puzzleId);
      if (!puzzle) return false;
      const wasCorrect = resultByPuzzleId.get(puzzleId);
      if (filters.resultFilter === "correct" && wasCorrect !== true) return false;
      if (filters.resultFilter === "incorrect" && wasCorrect !== false) return false;
      if (
        normalizedAuthors.size > 0 &&
        !normalizedAuthors.has(
          String(puzzle.author ?? "")
            .trim()
            .toLocaleLowerCase(),
        )
      ) {
        return false;
      }
      const tags = new Set(Array.isArray(puzzle.tags) ? puzzle.tags : []);
      if (filters.untaggedOnly) return tags.size === 0;
      return filters.tags.every((tag) => tags.has(tag));
    });
  }

  private async list(): Promise<ServiceResult> {
    const sets = await this.repository.listSets();
    const items = await this.repository.loadItems(sets.map((set) => set.id));
    return {
      statusCode: 200,
      body: { sets: sets.map((set) => serializeCustomPuzzleSet(set, items)) },
    };
  }

  private async get(id: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const items = await this.repository.loadItems([set.id]);
    return { statusCode: 200, body: { set: serializeCustomPuzzleSet(set, items) } };
  }

  private async attempts(id: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const items = await this.repository.loadItems([set.id]);
    return {
      statusCode: 200,
      body: {
        attempts: items
          .filter((item) => item.completed_at && item.last_result !== null)
          .map((item) => ({
            puzzleId: item.puzzle_id,
            attemptedAt: String(item.completed_at),
            puzzleCorrect: Boolean(item.last_result),
          }))
          .sort((left, right) => right.attemptedAt.localeCompare(left.attemptedAt)),
      },
    };
  }

  private async create(
    input: Extract<CustomPuzzleSetAction, { action: "create" }>,
  ): Promise<ServiceResult> {
    const filters: CustomPuzzleSetFilters = {
      tags: [...new Set(input.tags)],
      untaggedOnly: input.untaggedOnly,
      authors: [...new Set(input.authors)],
      resultFilter: input.resultFilter,
    };
    const matchingPuzzleIds = await this.loadMatchingPuzzleIds(filters);
    if (!matchingPuzzleIds.length) throw new HttpError(400, "No puzzles match those filters.");

    const set = await this.repository.createSet(input.name, filters);
    const itemInserts = matchingPuzzleIds.map((puzzleId, position) => ({
      set_id: set.id,
      puzzle_id: puzzleId,
      position,
    }));
    try {
      await this.repository.insertItems(itemInserts);
    } catch (error) {
      await this.repository.deleteSet(set.id).catch(() => undefined);
      throw error;
    }

    return {
      statusCode: 201,
      body: {
        set: serializeCustomPuzzleSet(
          set,
          itemInserts.map((item) => createPendingItem(item.set_id, item.puzzle_id, item.position)),
        ),
      },
    };
  }

  private async refresh(id: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const currentItems = await this.repository.loadItems([set.id]);
    const filters = decodeCustomPuzzleSetFilters(set);
    const activePuzzleIds = new Set(
      currentItems.filter((item) => !item.removed_at).map((item) => item.puzzle_id),
    );
    const addedPuzzleIds = filters.tags.length
      ? (
          await this.loadMatchingPuzzleIds({
            tags: filters.tags,
            untaggedOnly: false,
            authors: [],
            resultFilter: "all",
          })
        ).filter((puzzleId) => !activePuzzleIds.has(puzzleId))
      : [];
    if (!addedPuzzleIds.length) {
      return {
        statusCode: 200,
        body: { set: serializeCustomPuzzleSet(set, currentItems), addedPuzzleIds: [] },
      };
    }

    const firstPosition = currentItems.reduce(
      (highest, item) => Math.max(highest, item.position + 1),
      0,
    );
    const removedItemsByPuzzleId = new Map(
      currentItems.filter((item) => item.removed_at).map((item) => [item.puzzle_id, item] as const),
    );
    const restoredItems = addedPuzzleIds
      .map((puzzleId) => removedItemsByPuzzleId.get(puzzleId))
      .filter((item): item is CustomPuzzleSetItemRow => Boolean(item));
    for (const item of restoredItems) {
      await this.repository.restoreItem(set.id, item.puzzle_id);
    }

    const restoredPuzzleIds = new Set(restoredItems.map((item) => item.puzzle_id));
    const newPuzzleIds = addedPuzzleIds.filter((puzzleId) => !restoredPuzzleIds.has(puzzleId));
    const addedItems = newPuzzleIds.map((puzzleId, index) => ({
      set_id: set.id,
      puzzle_id: puzzleId,
      position: firstPosition + index,
    }));
    await this.repository.insertItems(addedItems);
    const updatedSet = await this.repository.touchSet(set.id, new Date().toISOString());

    return {
      statusCode: 200,
      body: {
        set: serializeCustomPuzzleSet(updatedSet, [
          ...currentItems,
          ...restoredItems.map((item) => ({ ...item, removed_at: null })),
          ...addedItems.map((item) =>
            createPendingItem(item.set_id, item.puzzle_id, item.position),
          ),
        ]),
        addedPuzzleIds: addedPuzzleIds.map(Number).filter(Number.isSafeInteger),
      },
    };
  }

  private async removeItem(id: string, puzzleId: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const currentItems = await this.repository.loadItems([set.id]);
    const item = currentItems.find(
      (candidate) => candidate.puzzle_id === puzzleId && !candidate.removed_at,
    );
    if (!item) throw new HttpError(400, "That puzzle is not part of this custom set.");
    const removedAt = new Date().toISOString();
    await this.repository.removeItem(set.id, puzzleId, removedAt);
    return {
      statusCode: 200,
      body: {
        set: serializeCustomPuzzleSet(
          set,
          currentItems.map((candidate) =>
            candidate.puzzle_id === puzzleId ? { ...candidate, removed_at: removedAt } : candidate,
          ),
        ),
      },
    };
  }

  private async rename(id: string, name: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const renamedSet = await this.repository.renameSet(set.id, name, new Date().toISOString());
    return {
      statusCode: 200,
      body: {
        set: serializeCustomPuzzleSet(renamedSet, await this.repository.loadItems([set.id])),
      },
    };
  }

  private async reset(id: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    await this.repository.resetSet(set.id);
    return { statusCode: 200, body: { success: true } };
  }

  private async delete(id: string): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    await this.repository.deleteSet(set.id);
    return { statusCode: 200, body: { success: true } };
  }

  private async record(
    id: string,
    puzzleId: string,
    moves: string[],
  ): Promise<ServiceResult> {
    const set = await this.repository.loadOwnedSet(id);
    const currentItems = await this.repository.loadItems([set.id]);
    const item = currentItems.find(
      (candidate) => candidate.puzzle_id === puzzleId && !candidate.removed_at,
    );
    if (!item) throw new HttpError(400, "That puzzle is not part of this custom set.");
    if (!item.completed_at) {
      const puzzle = await this.repository.loadPuzzleSolution(puzzleId);
      let evaluation;
      try {
        evaluation = evaluatePuzzleMoves(puzzle.fen, puzzle.solution, moves);
      } catch (evaluationError) {
        throw new HttpError(
          400,
          evaluationError instanceof Error
            ? evaluationError.message
            : "Invalid puzzle move history.",
        );
      }
      if (evaluation.evaluation === "retry") {
        throw new HttpError(400, "A retry move is not a completed puzzle attempt.");
      }
      const puzzleCorrect = evaluation.evaluation === "accepted" && evaluation.solved;
      await this.repository.recordItem(set.id, puzzleId, puzzleCorrect);
    }
    return { statusCode: 200, body: { success: true } };
  }

  async execute(input: CustomPuzzleSetAction): Promise<ServiceResult> {
    switch (input.action) {
      case "list":
        return this.list();
      case "get":
        return this.get(input.id);
      case "attempts":
        return this.attempts(input.id);
      case "create":
        return this.create(input);
      case "refresh":
        return this.refresh(input.id);
      case "remove-item":
        return this.removeItem(input.id, input.puzzleId);
      case "rename":
        return this.rename(input.id, input.name);
      case "reset":
        return this.reset(input.id);
      case "delete":
        return this.delete(input.id);
      case "record":
        return this.record(input.id, input.puzzleId, input.moves);
    }
  }
}
