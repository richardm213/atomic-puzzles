import "./TournamentFairPlayFlag.css";

import { faRobot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { normalizeUsername } from "../../utils/playerNames";

const FAIR_PLAY_FLAGGED_PLAYERS = new Set(["neverofzero", "thuban", "taisthuban", "jasos12"]);
const FAIR_PLAY_FLAG_LABEL =
  "Fair-play flag: this player has a tournament cheating violation, so interpret their results accordingly.";

export const TournamentFairPlayFlag = ({ playerName }: { playerName: string }) =>
  FAIR_PLAY_FLAGGED_PLAYERS.has(normalizeUsername(playerName)) ? (
    <span
      className="tournamentFairPlayFlag"
      title={FAIR_PLAY_FLAG_LABEL}
      aria-label={FAIR_PLAY_FLAG_LABEL}
    >
      <FontAwesomeIcon icon={faRobot} aria-hidden="true" />
    </span>
  ) : null;
