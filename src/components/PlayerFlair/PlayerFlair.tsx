import "./PlayerFlair.css";

import {
  type PlayerFlair,
  playerFlairImagePath,
  playerFlairLabel,
} from "../../../shared/domain/playerSocial";
import { appAssetPath } from "../../utils/appAssetPath";

export const PlayerFlairIcon = ({
  flair,
  className,
  decorative = false,
}: {
  flair: PlayerFlair;
  className?: string;
  decorative?: boolean;
}) => {
  const path = playerFlairImagePath(flair);
  if (!path) {
    return (
      <span className={className} aria-hidden={decorative || undefined}>
        {flair}
      </span>
    );
  }

  return (
    <img
      className={className ? `playerFlairImage ${className}` : "playerFlairImage"}
      src={appAssetPath(path)}
      alt={decorative ? "" : playerFlairLabel(flair)}
      decoding="async"
      loading="lazy"
    />
  );
};
