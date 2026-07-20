import { Link } from "@tanstack/react-router";

import type { CommunityHistoryComment } from "../../lib/community/puzzleCommunity";

type CommunityCommentTargetLinkProps = Pick<
  CommunityHistoryComment,
  "target_type" | "target_id" | "target_context"
> & {
  className?: string;
};

export const CommunityCommentTargetLink = ({
  target_type: targetType,
  target_id: targetId,
  target_context: targetContext,
  className,
}: CommunityCommentTargetLinkProps) => {
  if (targetType === "profile") {
    return (
      <Link className={className} to="/@/$username" params={{ username: targetId }}>
        @{targetId} profile
      </Link>
    );
  }

  if (targetType === "match") {
    return (
      <Link
        className={className}
        to="/matches/$mode/$matchId"
        params={{ mode: targetContext, matchId: targetId }}
      >
        {targetContext} match {targetId}
      </Link>
    );
  }

  if (targetType === "tournament") {
    return (
      <Link
        className={className}
        to="/tournaments/$tournamentId"
        params={{ tournamentId: targetId }}
      >
        Tournament {targetId.toUpperCase()}
      </Link>
    );
  }

  return (
    <Link className={className} to="/solve/$puzzleId" params={{ puzzleId: targetId }}>
      Puzzle #{targetId}
    </Link>
  );
};
