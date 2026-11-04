import "./PlayerSocialControls.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PLAYER_FLAIRS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { useAuth } from "../../context/AuthContext";
import { playerSocialQueryOptions, updatePlayerFlair } from "../../lib/playerSocial/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";

export const PlayerSocialControls = ({ username }: { username: string }) => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const normalizedUsername = normalizeUsername(username);
  const isSelf = normalizeUsername(user?.username ?? "") === normalizedUsername;
  const socialQuery = useQuery(playerSocialQueryOptions(normalizedUsername));
  const social = socialQuery.data;
  const flairMutation = useMutation({
    mutationFn: (flair: PlayerFlair | null) => updatePlayerFlair(flair),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["player-social", normalizedUsername] });
      void queryClient.invalidateQueries({ queryKey: ["player-flair", normalizedUsername] });
    },
  });

  if (!social || !isSelf || !isAuthenticated) return null;

  return (
    <div className="playerSocialControls">
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
    </div>
  );
};
