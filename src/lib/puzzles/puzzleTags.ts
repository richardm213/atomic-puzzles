import {
  type PuzzleTagVote,
  puzzleTagVoteResponseSchema,
  rewardedPuzzleTagVoteResponseSchema,
} from "../../../shared/domain/puzzles/puzzleTagVotes";
import { apiRequest, postApi } from "../api/postApi";
import { announceCoinChange } from "../coins/coinEvents";

const endpoint = "/api/puzzles/tags";
const options = {
  schema: puzzleTagVoteResponseSchema,
  invalidMessage: "The server returned invalid puzzle tag votes.",
};

export const loadPuzzleTagVotes = async (puzzleId: number, signal: AbortSignal) =>
  (
    await apiRequest(`${endpoint}?puzzleId=${puzzleId}`, {
      ...options,
      errorMessage: "Unable to load puzzle tag votes.",
      signal,
    })
  ).votes;

export const voteOnPuzzleTag = async (puzzleId: number, tag: string, vote: PuzzleTagVote) => {
  const { votes, coinAward, coinDelta } = await postApi(
    endpoint,
    { puzzleId, tag, vote },
    {
      ...options,
      schema: rewardedPuzzleTagVoteResponseSchema,
      errorMessage: "Unable to save your tag vote.",
    },
  );
  const change = coinDelta ?? coinAward;
  if (change !== 0) {
    announceCoinChange(
      change,
      change < 0 ? "Tag reward reversed" : change > 0.1 ? "Tag proposed" : "Tag vote",
    );
  }
  return votes;
};
