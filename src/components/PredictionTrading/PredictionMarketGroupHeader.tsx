import "./PredictionTrading.css";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PredictionMarketExplainer } from "../PredictionMarketExplainer/PredictionMarketExplainer";

type PredictionMarketGroupHeaderProps = {
  iconSrc?: string | undefined;
  isLoading: boolean;
  isOpen: boolean;
  middle?: ReactNode;
  path: string;
  showExplainer?: boolean;
  title: string;
  volume: string;
};

export const PredictionMarketGroupHeader = ({
  iconSrc,
  isLoading,
  isOpen,
  middle,
  path,
  showExplainer = true,
  title,
  volume,
}: PredictionMarketGroupHeaderProps) => (
  <header
    className={`predictionSharedGroupHeader${
      middle ? " predictionSharedGroupHeader--withMiddle" : ""
    }`}
  >
    <div className="predictionSharedGroupQuestion">
      <span className="predictionSharedGroupTitle">
        {iconSrc ? <img src={iconSrc} alt="" aria-hidden="true" /> : null}
        <strong>{title}</strong>
        {showExplainer ? <PredictionMarketExplainer /> : null}
      </span>
      <span className="predictionSharedGroupMeta">
        <small
          className={`predictionSharedGroupStatus${
            isLoading
              ? " predictionSharedGroupStatus--loading"
              : isOpen
                ? ""
                : " predictionSharedGroupStatus--closed"
          }`}
        >
          {isLoading ? "Loading" : isOpen ? "Open" : "Closed"}
        </small>
        <small>{isLoading ? "Volume —" : `Volume ${volume} coins`}</small>
      </span>
    </div>
    {middle ? <div className="predictionSharedGroupMiddle">{middle}</div> : null}
    <Link className="predictionSharedGroupAction" to={path}>
      Open market →
    </Link>
  </header>
);
