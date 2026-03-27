export const ProfileMetricCard = ({ label, value }) => {
  return (
    <div className="profileMetric">
      <span className="statusLabel">{label}</span>
      <strong>{value}</strong>
    </div>
  );
};
