import "./ProfileMetricCard.css";

import type { ReactNode } from "react";

export type ProfileMetricCardProps = {
  label: ReactNode;
  value: ReactNode;
  valueSuffix?: string | undefined;
  valueLink?: string | null | undefined;
  subtext?: string | undefined;
};

export const ProfileMetricCard = ({
  label,
  value,
  valueSuffix = "",
  valueLink = null,
  subtext = "",
}: ProfileMetricCardProps) => {
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
