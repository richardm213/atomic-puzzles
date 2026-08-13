import type { PuzzleAttempt, PuzzleProgressRepository } from "./repository";

export class PuzzleProgressService {
  constructor(private readonly repository: PuzzleProgressRepository) {}

  async record(username: string, attempt: PuzzleAttempt) {
    await this.repository.record(username, attempt);
    return { recorded: true, username };
  }
}
