import type { SourceFilters } from "../../constants/matches";
import { knownSourceKeys } from "../../constants/matches";

const sources: Array<keyof SourceFilters> = knownSourceKeys;
const sourceLabels: Record<keyof SourceFilters, string> = {
  arena: "Arena",
  friend: "Friend",
  lobby: "Lobby",
  swiss: "Swiss",
  chesscom: "Chess.com",
  unknown: "Other",
};

export type SourceFilterChecksProps = {
  values: SourceFilters;
  onChange: (source: keyof SourceFilters, checked: boolean) => void;
};

export const SourceFilterChecks = ({ values, onChange }: SourceFilterChecksProps) => (
  <div className="opponentRatingFilter sourceFilterGroup">
    <span className="statusLabel">Source filter</span>
    <div className="sourceFilterChecks">
      {sources.map((source) => (
        <label key={source} className="sourceFilterCheck sourceFilterSourceCheck">
          <input
            type="checkbox"
            checked={values[source]}
            onChange={(event) => onChange(source, event.target.checked)}
          />
          <span>{sourceLabels[source]}</span>
        </label>
      ))}
    </div>
  </div>
);
