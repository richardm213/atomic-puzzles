import { communityRoute } from "../features/community/routes";
import {
  addPuzzleAttemptStats,
  buildCommunityUserStats,
  buildProfileCommentRows,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
} from "../features/community/service";
import { postJsonHandler } from "../http/handler";

export {
  addPuzzleAttemptStats,
  buildCommunityUserStats,
  buildProfileCommentRows,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
};

export const handler = postJsonHandler(communityRoute, "Unable to update community discussion.");
