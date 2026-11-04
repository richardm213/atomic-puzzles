import "./PlayerSocialControls.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PLAYER_FLAIR_GROUPS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { useAuth } from "../../context/AuthContext";
import {
  type PlayerSocial,
  playerSocialQueryOptions,
  updatePlayerFlair,
} from "../../lib/playerSocial/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";

export const PlayerFlairPicker = ({ username }: { username: string }) => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const normalizedUsername = normalizeUsername(username);
  const isSelf = normalizeUsername(user?.username ?? "") === normalizedUsername;
  const socialQuery = useQuery(playerSocialQueryOptions(normalizedUsername));
  const social = socialQuery.data;
  const socialQueryKey = ["player-social", normalizedUsername] as const;
  const flairMutation = useMutation({
    mutationFn: (flair: PlayerFlair | null) => updatePlayerFlair(flair),
    onMutate: async (flair) => {
      await queryClient.cancelQueries({ queryKey: socialQueryKey });
      const previousSocial = queryClient.getQueryData<PlayerSocial>(socialQueryKey);
      queryClient.setQueryData<PlayerSocial | undefined>(socialQueryKey, (current) =>
        current ? { ...current, flair } : current,
      );
      return { previousSocial };
    },
    onError: (_error, _flair, context) => {
      queryClient.setQueryData(socialQueryKey, context?.previousSocial);
    },
    onSettled: () => {
      void queryClient.invalidateQueries(playerSocialQueryOptions(normalizedUsername));
    },
  });

  if (!social || !isSelf || !isAuthenticated) return null;

  return (
    <div className="playerSocialControls">
      <details className="playerFlairPicker">
        <summary>{social.flair ? `${social.flair} Change flair` : "Choose flair"}</summary>
        <div className="playerFlairPalette" aria-label="Choose profile flair">
          <div className="playerFlairPaletteHeader">
            <button
              type="button"
              className={!social.flair ? "selected" : ""}
              aria-label="No flair"
              aria-pressed={!social.flair}
              onClick={() => flairMutation.mutate(null)}
            >
              ×
            </button>
            <span>Remove flair</span>
          </div>
          {PLAYER_FLAIR_GROUPS.map((group) => (
            <section key={group.label} className="playerFlairGroup">
              <h3>{group.label}</h3>
              <div className="playerFlairGrid">
                {group.flairs.map((flair) => (
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
            </section>
          ))}
        </div>
      </details>
    </div>
  );
};
