import type { SourceFilters } from "../../constants/matches";

const sources: Array<keyof SourceFilters> = ["arena", "friend", "lobby"];

export type SourceFilterChecksProps = {
  values: SourceFilters;
  onChange: (source: keyof SourceFilters, checked: boolean) => void;
};

export const SourceFilterChecks = ({ values, onChange }: SourceFilterChecksProps) => (
  <div className="opponentRatingFilter sourceFilterGroup">
    <span className="statusLabel">Source filter</span>
    <div className="sourceFilterChecks">
      {sources.map((source) => (
        <label key={source} className="sourceFilterCheck">
          <input
            type="checkbox"
            checked={values[source]}
            onChange={(event) => onChange(source, event.target.checked)}
          />
          <span>{source}</span>
        </label>
      ))}
    </div>
  </div>
);
