import "./PredictionTrading.css";

import { Fragment } from "react";

import type { PredictionMarketDefinition } from "../../lib/predictionMarkets/predictionMarkets";
import {
  predictionMarketDisplayOutcomes,
  predictionMarketMatchupLabel,
  predictionOutcomeCountryCode,
} from "../../lib/predictionMarkets/predictionMarkets";
import { countryCodeToFlagUrl } from "../../utils/countryFlags";

type PredictionMarketIdentityProps = {
  definition: PredictionMarketDefinition;
  density?: "compact" | "comfortable";
};

export const PredictionMarketIdentity = ({
  definition,
  density = "comfortable",
}: PredictionMarketIdentityProps) => {
  if (!definition.outcomeLabels) {
    return (
      <span className={`predictionSharedIdentity predictionSharedIdentity--${density}`}>
        {definition.countryCode ? (
          <img
            src={countryCodeToFlagUrl(definition.countryCode)}
            alt=""
            crossOrigin="anonymous"
            loading="lazy"
            decoding="async"
            aria-hidden="true"
          />
        ) : null}
        <strong title={definition.username}>{definition.username}</strong>
      </span>
    );
  }

  return (
    <span
      className={`predictionSharedIdentity predictionSharedIdentity--matchup predictionSharedIdentity--${density}`}
    >
      {predictionMarketDisplayOutcomes(definition.id).map((outcome, index) => {
        const label = predictionMarketMatchupLabel(definition, outcome);
        return (
          <Fragment key={outcome}>
            {index > 0 ? <span className="predictionSharedIdentityVs">vs</span> : null}
            <span className="predictionSharedIdentityPlayer">
              <img
                src={countryCodeToFlagUrl(predictionOutcomeCountryCode(definition, outcome))}
                alt=""
                crossOrigin="anonymous"
                loading="lazy"
                decoding="async"
                aria-hidden="true"
              />
              <strong title={label}>{label}</strong>
            </span>
          </Fragment>
        );
      })}
    </span>
  );
};
