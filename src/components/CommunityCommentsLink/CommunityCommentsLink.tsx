import "./CommunityCommentsLink.css";

import { faComment } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";

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

type CommunityCommentsProps = {
  target: CommunityTarget;
  label?: string;
  hideWhenEmpty?: boolean;
};

type CommunityCommentsLinkProps = CommunityCommentsProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href" | "target"> & { href: string };
type CommunityCommentsButtonProps = CommunityCommentsProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">;

const CommunityCommentsControl = ({
  target,
  label = "Comments",
  hideWhenEmpty = false,
  className = "",
  ...elementProps
}: CommunityCommentsLinkProps | CommunityCommentsButtonProps) => {
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

  const content = (
    <>
      <FontAwesomeIcon icon={faComment} aria-hidden="true" />
      <span>{label}</span>
      <span className="communityCommentCount" aria-label={accessibleLabel}>
        {displayValue}
      </span>
    </>
  );
  const classes = `communityCommentsLink${className ? ` ${className}` : ""}`;
  return "href" in elementProps ? (
    <a {...elementProps} className={classes}>
      {content}
    </a>
  ) : (
    <button {...elementProps} type="button" className={classes}>
      {content}
    </button>
  );
};

export const CommunityCommentsLink = (props: CommunityCommentsLinkProps) => (
  <CommunityCommentsControl {...props} />
);
export const CommunityCommentsButton = (props: CommunityCommentsButtonProps) => (
  <CommunityCommentsControl {...props} />
);
