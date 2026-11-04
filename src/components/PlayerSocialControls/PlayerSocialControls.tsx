import "./PlayerSocialControls.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PLAYER_FLAIR_GROUPS, type PlayerFlair } from "../../../shared/domain/playerSocial";
import { useAuth } from "../../context/AuthContext";
import {
  type PlayerSocial,
  playerSocialQueryOptions,
  updatePlayerCountry,
  updatePlayerFlair,
} from "../../lib/playerSocial/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";

const countryDisplayNames = new Intl.DisplayNames(["en"], { type: "region" });
const isoCountryCodes =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(
    " ",
  );
const countryOptions = isoCountryCodes
  .map((code) => {
    const displayName = countryDisplayNames.of(code) ?? code;
    return { code, displayName: code === "US" ? "USA" : displayName };
  })
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

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

export const PlayerCountryPicker = ({ username }: { username: string }) => {
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const normalizedUsername = normalizeUsername(username);
  const isSelf = normalizeUsername(user?.username ?? "") === normalizedUsername;
  const socialQuery = useQuery(playerSocialQueryOptions(normalizedUsername));
  const social = socialQuery.data;
  const socialQueryKey = ["player-social", normalizedUsername] as const;
  const countryMutation = useMutation({
    mutationFn: (countryCode: string | null) => updatePlayerCountry(countryCode),
    onMutate: async (countryCode) => {
      await queryClient.cancelQueries({ queryKey: socialQueryKey });
      const previousSocial = queryClient.getQueryData<PlayerSocial>(socialQueryKey);
      queryClient.setQueryData<PlayerSocial | undefined>(socialQueryKey, (current) =>
        current
          ? {
              ...current,
              countryCode: countryCode ?? current.tournamentCountryCode,
              countryCodeSource: countryCode
                ? "profile"
                : current.tournamentCountryCode
                  ? "tournament"
                  : null,
            }
          : current,
      );
      return { previousSocial };
    },
    onError: (_error, _countryCode, context) => {
      queryClient.setQueryData(socialQueryKey, context?.previousSocial);
    },
    onSettled: () => {
      void queryClient.invalidateQueries(playerSocialQueryOptions(normalizedUsername));
    },
  });

  if (!social || !isSelf || !isAuthenticated) return null;

  const selectedCountry = social.countryCodeSource === "profile" ? social.countryCode : "";
  const tournamentDefault = social.tournamentCountryCode
    ? countryOptions.find(({ code }) => code === social.tournamentCountryCode)?.displayName ||
      social.tournamentCountryCode
    : "Not set";

  return (
    <div className="playerCountryPicker">
      <select
        aria-label="Profile country"
        value={selectedCountry}
        disabled={countryMutation.isPending}
        onChange={(event) => countryMutation.mutate(event.target.value || null)}
      >
        <option value="">Tournament default — {tournamentDefault}</option>
        {countryOptions.map(({ code, displayName }) => (
          <option key={code} value={code}>
            {displayName}
          </option>
        ))}
      </select>
      {countryMutation.isError ? (
        <span className="playerSocialControlError" role="alert">
          Unable to update country.
        </span>
      ) : null}
    </div>
  );
};
