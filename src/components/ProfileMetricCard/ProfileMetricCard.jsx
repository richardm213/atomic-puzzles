import "./ProfileMetricCard.css";

export const ProfileMetricCard = ({
  label,
  value,
  valueSuffix = "",
  valueLink = null,
  subtext = "",
}) => {
  return (
    <div className="profileMetric">
      <span className="statusLabel">{label}</span>
      <strong className="profileMetricValue">
        {value}
        {valueLink && valueSuffix ? (
          <a className="profileMetricValueLink" href={valueLink}>
            {valueSuffix}
          </a>
        ) : null}
      </strong>
      {subtext ? <span className="profileMetricSubtext">{subtext}</span> : null}
    </div>
  );
};
