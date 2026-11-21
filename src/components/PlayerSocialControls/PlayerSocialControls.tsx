import "./PlayerSocialControls.css";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useRef } from "react";

import {
  isThemeAtomicLogo,
  PLAYER_FLAIR_GROUPS,
  type PlayerFlair,
  playerFlairLabel,
  themeAtomicLogo,
} from "../../../shared/domain/playerSocial";
import { useColorMode } from "../../context/AppSettings";
import { useAuth } from "../../context/AuthContext";
import {
  type PlayerSocial,
  playerSocialQueryOptions,
  updatePlayerCountry,
  updatePlayerFlair,
} from "../../lib/playerSocial/playerSocial";
import { normalizeUsername } from "../../utils/playerNames";
import { PlayerFlairIcon } from "../PlayerFlair/PlayerFlair";

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
  const atomicLogo = themeAtomicLogo(useColorMode());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const queryClient = useQueryClient();
  const { isAuthenticated, user } = useAuth();
  const normalizedUsername = normalizeUsername(username);
  const isSelf = normalizeUsername(user?.username ?? "") === normalizedUsername;
  const socialQuery = useQuery(playerSocialQueryOptions(normalizedUsername));
  const social = socialQuery.data;
  const socialQueryKey = ["player-social", normalizedUsername] as const;
  const flairMutation = useMutation({
    mutationFn: (flair: PlayerFlair | null) => updatePlayerFlair(flair),
    onMutate: (flair) => {
      const previousSocial = queryClient.getQueryData<PlayerSocial>(socialQueryKey);
      void queryClient.cancelQueries({ queryKey: socialQueryKey }, { revert: false });
      queryClient.setQueryData<PlayerSocial | undefined>(socialQueryKey, (current) =>
        current ? { ...current, flair } : current,
      );
      return { previousSocial };
    },
    onError: (_error, _flair, context) => {
      queryClient.setQueryData(socialQueryKey, context?.previousSocial);
    },
    onSuccess: () => dialogRef.current?.close(),
    onSettled: () => {
      void queryClient.invalidateQueries(playerSocialQueryOptions(normalizedUsername));
    },
  });

  if (!social || !isSelf || !isAuthenticated) return null;
  const selectedFlair = social.flair && isThemeAtomicLogo(social.flair) ? atomicLogo : social.flair;

  return (
    <>
      <button
        className="playerFlairTrigger"
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          if (!flairMutation.isPending) flairMutation.reset();
          dialogRef.current?.showModal();
        }}
      >
        {social.flair ? (
          <>
            <PlayerFlairIcon flair={social.flair} /> Change flair
          </>
        ) : (
          "Choose flair"
        )}
      </button>
      <dialog
        ref={dialogRef}
        className="playerFlairPalette"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          // Let the native dialog handle Escape before the settings panel does.
          if (event.key === "Escape") event.stopPropagation();
        }}
      >
        <header className="playerFlairPaletteHeader">
          <h2 id={titleId}>Choose profile flair</h2>
          <button
            className="playerFlairClose"
            type="button"
            aria-label="Close flair picker"
            onClick={() => dialogRef.current?.close()}
          >
            ×
          </button>
        </header>
        <div className="playerFlairPaletteBody">
          <button
            className="playerFlairRemove"
            type="button"
            disabled={!social.flair || flairMutation.isPending}
            onClick={() => flairMutation.mutate(null)}
          >
            Remove flair
          </button>
          {PLAYER_FLAIR_GROUPS.map((group) => (
            <section key={group.label} className="playerFlairGroup">
              <h3>{group.label}</h3>
              <div className="playerFlairGrid">
                {group.flairs
                  .filter((flair) => !isThemeAtomicLogo(flair) || flair === atomicLogo)
                  .map((flair) => (
                    <button
                      key={flair}
                      type="button"
                      aria-label={`Use ${playerFlairLabel(flair)} flair`}
                      title={playerFlairLabel(flair)}
                      aria-pressed={selectedFlair === flair}
                      disabled={flairMutation.isPending}
                      onClick={() => flairMutation.mutate(flair)}
                    >
                      <PlayerFlairIcon flair={flair} decorative />
                    </button>
                  ))}
              </div>
            </section>
          ))}
        </div>
        {flairMutation.isPending ? (
          <p className="playerFlairFeedback" role="status">
            Saving flair…
          </p>
        ) : flairMutation.isError ? (
          <p className="playerFlairFeedback" role="alert">
            Unable to update flair. Try again.
          </p>
        ) : null}
      </dialog>
    </>
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
    onMutate: (countryCode) => {
      const previousSocial = queryClient.getQueryData<PlayerSocial>(socialQueryKey);
      void queryClient.cancelQueries({ queryKey: socialQueryKey }, { revert: false });
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
