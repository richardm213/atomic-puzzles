import "./PlayerSocialControls.css";

import { faUserCheck, faUserPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PLAYER_FLAIRS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { useAuth } from "../../context/AuthContext";
import {
  playerSocialQueryOptions,
  updateFollow,
  updatePlayerFlair,
} from "../../lib/playerSocial/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";

export const PlayerSocialControls = ({ username }: { username: string }) => {
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const normalizedUsername = normalizeUsername(username);
  const socialQuery = useQuery(playerSocialQueryOptions(normalizedUsername));
  const social = socialQuery.data;
  const followMutation = useMutation({
    mutationFn: (follow: boolean) => updateFollow(normalizedUsername, follow),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["player-social", normalizedUsername] });
    },
  });
  const flairMutation = useMutation({
    mutationFn: (flair: PlayerFlair | null) => updatePlayerFlair(flair),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["player-social", normalizedUsername] });
      void queryClient.invalidateQueries({ queryKey: ["player-flair", normalizedUsername] });
    },
  });

  if (!social) return null;

  return (
    <div className="playerSocialControls">
      <span className="playerFollowerCount">
        {social.followerCount.toLocaleString("en-US")} 
        {social.followerCount === 1 ? "follower" : "followers"}
      </span>
      {social.canFollow && isAuthenticated ? (
        <button
          type="button"
          className="playerFollowButton"
          aria-pressed={social.isFollowing}
          disabled={followMutation.isPending}
          onClick={() => followMutation.mutate(!social.isFollowing)}
        >
          <FontAwesomeIcon
            icon={social.isFollowing ? faUserCheck : faUserPlus}
            aria-hidden="true"
          />
          {followMutation.isPending ? "Saving…" : social.isFollowing ? "Following" : "Follow"}
        </button>
      ) : null}
      {social.isSelf && isAuthenticated ? (
        <details className="playerFlairPicker">
          <summary>{social.flair ? `${social.flair} Change flair` : "Choose flair"}</summary>
          <div className="playerFlairPalette" aria-label="Choose profile flair">
            <button
              type="button"
              className={!social.flair ? "selected" : ""}
              aria-label="No flair"
              aria-pressed={!social.flair}
              onClick={() => flairMutation.mutate(null)}
            >
              ×
            </button>
            {PLAYER_FLAIRS.map((flair) => (
              <button
                key={flair}
                type="button"
                className={social.flair === flair ? "selected" : ""}
                aria-label={`Use ${flair} flair`}
                aria-pressed={social.flair === flair}
                disabled={flairMutation.isPending}
                onClick={(event) => {
                  flairMutation.mutate(flair);
                  event.currentTarget.closest("details")?.removeAttribute("open");
                }}
              >
                {flair}
              </button>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
};
