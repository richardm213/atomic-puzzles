import type { FetchMatchPuzzleGame } from "../features/puzzles/submission/matchContext";
import { puzzleSubmissionRoute } from "../features/puzzles/submission/route";
import { defineFunction } from "../platform/defineFunction";

export const createPuzzleSubmissionHandler = (fetchGame?: FetchMatchPuzzleGame) =>
  defineFunction((event) => puzzleSubmissionRoute(event, fetchGame), {
    methods: ["POST"],
    fallbackMessage: "Unable to submit puzzle.",
  });

export const handler = createPuzzleSubmissionHandler();
