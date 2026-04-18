import "./ProfileMetricCard.css";
export const ProfileMetricCard = ({ label, value, subtext = "" }) => {
  return (
    <div className="profileMetric">
      <span className="statusLabel">{label}</span>
      <strong>{value}</strong>
      {subtext ? <span className="profileMetricSubtext">{subtext}</span> : null}
    </div>
  );
};
