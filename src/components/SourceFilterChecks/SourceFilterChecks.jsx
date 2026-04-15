const sources = ["arena", "friend", "lobby"];

export const SourceFilterChecks = ({ values, onChange }) => (
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
