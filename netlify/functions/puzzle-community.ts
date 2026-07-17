import { communityRoute } from "../features/community/routes";
import {
  buildProfileCommentRows,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
} from "../features/community/service";
import { postJsonHandler } from "../http/handler";

export {
  buildProfileCommentRows,
  isPublicCommunityReadAction,
  sortProfileCommentRecords,
  sumCommentKarma,
};

export const handler = postJsonHandler(communityRoute, "Unable to update community discussion.");
