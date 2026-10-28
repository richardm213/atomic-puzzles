import "./CommunityCommentsLink.css";

import { faComment } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import type { AnchorHTMLAttributes } from "react";

import { useAuth } from "../../context/AuthContext";
import { communityDiscussionQueryOptions } from "../../lib/community/communityQueries";
import type { CommunityTarget } from "../../lib/community/puzzleCommunity";

type CommunityCommentCountProps = {
  target: CommunityTarget;
  className?: string;
};

const useCommunityCommentCount = (target: CommunityTarget) => {
  const { isAuthenticated, user } = useAuth();
  const discussionQuery = useQuery({
    ...communityDiscussionQueryOptions(
      target,
      isAuthenticated ? (user?.username ?? "authenticated") : "anonymous",
    ),
    enabled: Boolean(target.id),
  });
  const count = discussionQuery.data?.comments.length ?? 0;

  return { count, discussionQuery };
};

export const CommunityCommentCount = ({ target, className = "" }: CommunityCommentCountProps) => {
  const { count, discussionQuery } = useCommunityCommentCount(target);
  const displayValue = discussionQuery.isPending ? "…" : discussionQuery.isError ? "—" : count;
  const accessibleLabel = discussionQuery.isPending
    ? "Loading comment count"
    : discussionQuery.isError
      ? "Comment count unavailable"
      : `${count} ${count === 1 ? "comment" : "comments"}`;

  return (
    <span
      className={`communityCommentCount${className ? ` ${className}` : ""}`}
      aria-label={accessibleLabel}
    >
      {displayValue}
    </span>
  );
};

type CommunityCommentsLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "children" | "href" | "target"
> & {
  target: CommunityTarget;
  href: string;
  label?: string;
  hideWhenEmpty?: boolean;
};

export const CommunityCommentsLink = ({
  target,
  href,
  label = "Comments",
  hideWhenEmpty = false,
  className = "",
  ...anchorProps
}: CommunityCommentsLinkProps) => {
  const { count, discussionQuery } = useCommunityCommentCount(target);

  if (hideWhenEmpty && (discussionQuery.isPending || discussionQuery.isError || count === 0)) {
    return null;
  }

  const displayValue = discussionQuery.isPending ? "…" : discussionQuery.isError ? "—" : count;
  const accessibleLabel = discussionQuery.isPending
    ? "Loading comment count"
    : discussionQuery.isError
      ? "Comment count unavailable"
      : `${count} ${count === 1 ? "comment" : "comments"}`;

  return (
    <a
      {...anchorProps}
      className={`communityCommentsLink${className ? ` ${className}` : ""}`}
      href={href}
    >
      <FontAwesomeIcon icon={faComment} aria-hidden="true" />
      <span>{label}</span>
      <span className="communityCommentCount" aria-label={accessibleLabel}>
        {displayValue}
      </span>
    </a>
  );
};
