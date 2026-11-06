import "./PredictionTrading.css";

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PredictionMarketExplainer } from "../PredictionMarketExplainer/PredictionMarketExplainer";
import { PredictionMarketRoi } from "./PredictionMarketRoi";
import { PredictionMarketStatus } from "./PredictionMarketStatus";

type PredictionMarketGroupHeaderProps = {
  iconSrc?: string | undefined;
  isLoading: boolean;
  isOpen: boolean;
  middle?: ReactNode;
  path: string;
  pnl?: number | null | undefined;
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
  pnl,
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
        <PredictionMarketStatus status={isLoading ? "loading" : isOpen ? "open" : "closed"} />
        <small>{isLoading ? "Volume —" : `Volume ${volume} coins`}</small>
        {pnl !== null && pnl !== undefined && Math.abs(pnl) >= 0.005 ? (
          <PredictionMarketRoi value={pnl} />
        ) : null}
      </span>
    </div>
    {middle ? <div className="predictionSharedGroupMiddle">{middle}</div> : null}
    <Link className="predictionSharedGroupAction" to={path}>
      Open market →
    </Link>
  </header>
);
